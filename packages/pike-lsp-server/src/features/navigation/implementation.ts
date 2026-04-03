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
 */

import { Connection, Location } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { PikeIntrospectionService } from '../../services/pike-introspection.js';
import { uriToFsPath } from '../../utils/uri-path.js';

export function registerImplementationHandler(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
  const log = new Logger('Navigation');
  const pikeIntrospection = services.pikeIntrospection ?? new PikeIntrospectionService(services);

  connection.onImplementation(async (params): Promise<Location[]> => {
    log.debug('Implementation request', {
      uri: params.textDocument.uri,
      position: params.position,
    });
    try {
      const uri = params.textDocument.uri;
      const cached = documentCache.get(uri);
      const document = documents.get(uri);

      if (!cached || !document) {
        return [];
      }

      const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
      if (!symbol) {
        log.debug('Implementation: no symbol at position');
        return [];
      }

      if (symbol.kind !== 'class') {
        log.debug('Implementation: symbol is not a class/interface', { kind: symbol.kind });
        return [];
      }

      const className = normalizeSymbolName(symbol.name);
      const classPath = normalizeSymbolName(uriToFsPath(uri));
      const implementations: Location[] = [];
      const knownUris = getKnownUris(services);
      const seenLocations = new Set<string>();

      for (const candidateUri of knownUris) {
        const inherits = await pikeIntrospection.getInherits(candidateUri);
        for (const relation of inherits) {
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
        }
      }

      log.debug('Implementation: found', {
        className,
        count: implementations.length,
        implementations: implementations.map(loc => ({ uri: loc.uri, range: loc.range })),
      });

      return implementations;
    } catch (err) {
      log.error(
        `Implementation failed for ${params.textDocument.uri} at line ${params.position.line + 1}, col ${params.position.character}: ${err instanceof Error ? err.message : String(err)}`
      );
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
