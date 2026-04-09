/**
 * Implementation Handler
 *
 * Provides implementation navigation for Pike classes/interfaces.
 * When invoked on a class/interface, finds all classes that inherit from it.
 *
 * Per LSP spec:
 * - textDocument/implementation should find all implementations of an interface
 * - For Pike, this means finding all classes with "inherit TargetClass"
 * - Returns empty array for non-class symbols
 * - Returns empty array when on an implementation (shows usages instead)
 *
 * KB-1262: Parse-under-edit resilience
 */

import { Connection, Location, CancellationToken } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import {
  PikeIntrospectionService,
  type InheritRelation,
} from '../../services/pike-introspection.js';
import { uriToFsPath } from '../../utils/uri-path.js';
import { RequestScheduler, RequestSupersededError } from '../../services/request-scheduler.js';
import { toSchedulerMetricsLogPayload } from '../utils/scheduler-metrics.js';

export function registerImplementationHandler(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
  const log = new Logger('Navigation');
  const pikeIntrospection = services.pikeIntrospection ?? new PikeIntrospectionService(services);

  // KB-1262: Request scheduler for resilient implementation requests
  const implScheduler = new RequestScheduler({ logger: log });
  const IMPL_SCHEDULER_LOG_EVERY = 50;
  let implRequestsObserved = 0;

  function maybeLogImplSchedulerMetrics(uri: string, outcome: string): void {
    implRequestsObserved += 1;
    if (implRequestsObserved % IMPL_SCHEDULER_LOG_EVERY !== 0) {
      return;
    }

    const schedulerMetrics = implScheduler.snapshotMetrics();
    log.debug('Implementation scheduler metrics', {
      uri,
      outcome,
      samples: implRequestsObserved,
      ...toSchedulerMetricsLogPayload(schedulerMetrics),
    });
  }

  /**
   * KB-1262: Resilient getInherits wrapper that isolates per-URI failures.
   * One failing URI does not prevent finding implementations in other URIs.
   */
  async function getInheritsResilient(
    candidateUri: string,
    cancellationToken?: CancellationToken
  ): Promise<InheritRelation[]> {
    try {
      if (cancellationToken?.isCancellationRequested) {
        return [];
      }

      const result = await pikeIntrospection.getInherits(candidateUri);

      if (cancellationToken?.isCancellationRequested) {
        return [];
      }

      return result;
    } catch (err) {
      // KB-1262: Gracefully handle introspection failures (likely parse-under-edit)
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isParseError = errorMessage.includes('parse') || errorMessage.includes('syntax');

      if (isParseError) {
        log.debug('getInherits failed (parse-under-edit, handled gracefully)', {
          uri: candidateUri,
          error: errorMessage,
        });
      } else {
        log.error(`getInherits failed for ${candidateUri}: ${errorMessage}`);
      }

      return [];
    }
  }

  connection.onImplementation(async (params, cancellationToken): Promise<Location[]> => {
    log.debug('Implementation request', {
      uri: params.textDocument.uri,
      position: params.position,
    });

    // KB-1262: Check cancellation early
    if (cancellationToken?.isCancellationRequested) {
      maybeLogImplSchedulerMetrics(params.textDocument.uri, 'cancelled-early');
      return [];
    }

    const uri = params.textDocument.uri;

    try {
      const result = await implScheduler.schedule<Location[]>({
        requestClass: 'interactive',
        key: `implementation:${uri}`,
        run: async checkpoint => {
          checkpoint();

          if (cancellationToken?.isCancellationRequested) {
            throw new RequestSupersededError('Implementation request cancelled');
          }

          const cached = documentCache.get(uri);
          const document = documents.get(uri);

          if (!cached || !document) {
            return [];
          }

          // KB-1262: Wrap symbol lookup in try-catch for parse-under-edit resilience
          let symbol: PikeSymbol | null = null;
          try {
            symbol = findSymbolAtPosition(cached.symbols, params.position, document);
          } catch (err) {
            log.debug('Symbol lookup failed (handled gracefully)', {
              uri,
              error: err instanceof Error ? err.message : String(err),
            });
            return [];
          }

          if (!symbol) {
            log.debug('Implementation: no symbol at position');
            return [];
          }

          if (symbol.kind !== 'class') {
            log.debug('Implementation: symbol is not a class/interface', { kind: symbol.kind });
            return [];
          }

          // KB-1262: Check cancellation before heavy processing
          if (cancellationToken?.isCancellationRequested) {
            throw new RequestSupersededError(
              'Implementation request cancelled before heavy processing'
            );
          }

          const className = normalizeSymbolName(symbol.name);
          const classPath = normalizeSymbolName(uriToFsPath(uri));
          const implementations: Location[] = [];

          // KB-1262: Wrap getKnownUris in try-catch (type assertions could fail)
          let knownUris: string[];
          try {
            knownUris = getKnownUris(services);
          } catch (err) {
            log.debug('getKnownUris failed (handled gracefully)', {
              uri,
              error: err instanceof Error ? err.message : String(err),
            });
            knownUris = [];
          }

          const seenLocations = new Set<string>();

          for (const candidateUri of knownUris) {
            // KB-1262: Check cancellation between URI iterations
            if (cancellationToken?.isCancellationRequested) {
              return implementations;
            }

            // KB-1262: Use resilient per-URI introspection to isolate failures
            const inherits = await getInheritsResilient(candidateUri, cancellationToken);
            for (const relation of inherits) {
              try {
                if (
                  !matchesInheritance(
                    relation.inheritedName,
                    className,
                    relation.inheritedPath,
                    classPath
                  )
                ) {
                  continue;
                }

                const dedupeKey = `${relation.uri}:${relation.ownerLine}:${relation.ownerClass}`;
                if (seenLocations.has(dedupeKey)) {
                  continue;
                }
                seenLocations.add(dedupeKey);

                implementations.push({
                  uri: relation.uri,
                  range: {
                    start: { line: relation.ownerLine, character: 0 },
                    end: { line: relation.ownerLine, character: relation.ownerClass.length },
                  },
                });
              } catch (err) {
                // KB-1262: Isolate per-relation failures
                log.debug('Relation processing failed (handled gracefully)', {
                  candidateUri,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }
          }

          log.debug('Implementation: found', {
            className,
            count: implementations.length,
            implementations: implementations.map(loc => ({ uri: loc.uri, range: loc.range })),
          });

          return implementations;
        },
      });

      maybeLogImplSchedulerMetrics(uri, result.length > 0 ? 'success' : 'empty');
      return result;
    } catch (err) {
      // KB-1262: RequestSupersededError means a newer request replaced this one
      if (err instanceof RequestSupersededError) {
        maybeLogImplSchedulerMetrics(uri, 'superseded');
        return [];
      }

      // KB-1262: Log at debug level for parse-under-edit scenarios, error only for unexpected
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isParseError = errorMessage.includes('parse') || errorMessage.includes('syntax');

      if (isParseError) {
        log.debug('Implementation failed (parse-under-edit, handled gracefully)', {
          uri,
          line: params.position.line + 1,
          col: params.position.character,
          error: errorMessage,
        });
      } else {
        log.error(
          `Implementation failed for ${uri} at line ${params.position.line + 1}, col ${params.position.character}: ${errorMessage}`
        );
      }

      maybeLogImplSchedulerMetrics(uri, 'error');
      return [];
    }
  });
}

function getKnownUris(services: Services): string[] {
  const uris = new Set<string>();

  for (const uri of services.documentCache.keys()) {
    uris.add(uri);
  }

  const workspaceIndex = (
    services as unknown as { workspaceIndex?: { getAllDocumentUris?: () => string[] } }
  ).workspaceIndex as
    | {
        getAllDocumentUris?: () => string[];
      }
    | undefined;
  const indexedUris = workspaceIndex?.getAllDocumentUris?.() ?? [];
  for (const uri of indexedUris) {
    uris.add(uri);
  }

  const workspaceScanner = (
    services as unknown as { workspaceScanner?: { getAllFiles?: () => Array<{ uri: string }> } }
  ).workspaceScanner as
    | {
        getAllFiles?: () => Array<{ uri: string }>;
      }
    | undefined;
  const files = workspaceScanner?.getAllFiles?.() ?? [];
  for (const file of files) {
    if (file.uri) {
      uris.add(file.uri);
    }
  }

  return Array.from(uris);
}

function findSymbolAtPosition(
  symbols: PikeSymbol[],
  position: { line: number; character: number },
  document: TextDocument
): PikeSymbol | null {
  const text = document.getText();
  const offset = document.offsetAt(position);

  let start = offset;
  let end = offset;
  while (start > 0 && isIdentifierChar(text[start - 1] ?? '')) {
    start--;
  }
  while (end < text.length && isIdentifierChar(text[end] ?? '')) {
    end++;
  }

  const word = text.slice(start, end);
  if (!word) {
    return null;
  }

  for (const sym of symbols) {
    if (sym.name === word) {
      if (sym.position) {
        const symbolLine = (sym.position.line ?? 1) - 1;
        if (symbolLine === position.line) {
          return sym;
        }
      }
    }
  }

  return null;
}

function isIdentifierChar(char: string): boolean {
  if (!char) {
    return false;
  }

  const code = char.charCodeAt(0);
  const isLower = code >= 97 && code <= 122;
  const isUpper = code >= 65 && code <= 90;
  const isDigit = code >= 48 && code <= 57;
  return isLower || isUpper || isDigit || char === '_';
}

function normalizeSymbolName(input: string): string {
  if (!input) {
    return '';
  }

  let text = input.trim();
  if (
    text.length > 1 &&
    ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
  ) {
    text = text.slice(1, -1);
  }

  const slash = text.lastIndexOf('/');
  if (slash >= 0 && slash < text.length - 1) {
    text = text.slice(slash + 1);
  }

  const dot = text.lastIndexOf('.');
  if (dot >= 0 && dot < text.length - 1) {
    text = text.slice(dot + 1);
  }

  return text;
}

function matchesInheritance(
  inheritedName: string,
  className: string,
  inheritedPath: string | undefined,
  classPath: string
): boolean {
  if (normalizeSymbolName(inheritedName) === normalizeSymbolName(className)) {
    return true;
  }

  if (inheritedPath) {
    const normalizedPath = normalizeSymbolName(inheritedPath);
    if (normalizedPath === normalizeSymbolName(className)) {
      return true;
    }
    if (normalizedPath === normalizeSymbolName(classPath)) {
      return true;
    }
  }

  return false;
}
