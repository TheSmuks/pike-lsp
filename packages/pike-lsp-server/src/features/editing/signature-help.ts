/**
 * Signature Help Handler
 *
 * Provides function parameter hints for Pike code.
 * KB-1248: Parse-under-edit resilience with cancellation support.
 */

import {
  Connection,
  ParameterInformation,
  SignatureHelp,
  SignatureInformation,
  TextDocuments,
  CancellationToken,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type {
  IntrospectedSymbol,
  PikeFunctionType,
  PikeMethod,
  PikeSymbol,
} from '@pike-lsp/pike-bridge';
import type { Services } from '../../services/index.js';
import { formatPikeType } from '../utils/pike-type-formatter.js';
import { uriToFsPath } from '../../utils/uri-path.js';
import { resolveCallContextAtOffset } from '../navigation/call-context-resolver.js';
import { RequestScheduler, RequestSupersededError } from '../../services/request-scheduler.js';
import { toSchedulerMetricsLogPayload } from '../utils/scheduler-metrics.js';

const useQueryEngineSignatureHelp = process.env['PIKE_LSP_QE2_SIGNATURE_HELP'] !== '0';
const inFlightSignatureHelpRequests = new Map<string, string>();
const signatureHelpRequestSequence = new Map<string, number>();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Parse a SignatureHelp object from query engine response.
 * Handles both structured and minimally-shaped responses.
 */
function parseSignatureHelpResponse(raw: Record<string, unknown>): SignatureHelp | null {
  try {
    const signatures = raw['signatures'];
    if (!Array.isArray(signatures) || signatures.length === 0) {
      return null;
    }

    const parsed: SignatureInformation[] = [];
    for (const sig of signatures) {
      if (!sig || typeof sig !== 'object') continue;
      const s = sig as Record<string, unknown>;
      if (typeof s['label'] !== 'string') continue;

      const parameters = Array.isArray(s['parameters'])
        ? (s['parameters'] as Array<Record<string, unknown>>).map(p => {
            if (typeof p['label'] === 'string') {
              return { label: p['label'] as string };
            }
            if (Array.isArray(p['label']) && p['label'].length === 2) {
              return { label: p['label'] as [number, number] };
            }
            return { label: '' };
          })
        : [];

      const info: SignatureInformation = {
        label: s['label'] as string,
        parameters,
      };
      if (typeof s['documentation'] === 'string') {
        info.documentation = s['documentation'];
      }
      parsed.push(info);
    }

    if (parsed.length === 0) return null;

    return {
      signatures: parsed,
      activeSignature:
        typeof raw['activeSignature'] === 'number' ? (raw['activeSignature'] as number) : 0,
      activeParameter:
        typeof raw['activeParameter'] === 'number' ? (raw['activeParameter'] as number) : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Register signature help handler.
 */
export function registerSignatureHelpHandler(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { logger, documentCache, stdlibIndex } = services;

  // KB-1248: Request scheduler for resilient signature help requests
  const signatureHelpScheduler = new RequestScheduler({ logger });
  const SIGNATURE_HELP_SCHEDULER_LOG_EVERY = 50;
  let signatureHelpRequestsObserved = 0;

  function maybeLogSignatureHelpSchedulerMetrics(uri: string, outcome: string): void {
    signatureHelpRequestsObserved += 1;
    if (signatureHelpRequestsObserved % SIGNATURE_HELP_SCHEDULER_LOG_EVERY !== 0) {
      return;
    }

    const schedulerMetrics = signatureHelpScheduler.snapshotMetrics();
    logger.debug('Signature help scheduler metrics', {
      uri,
      outcome,
      samples: signatureHelpRequestsObserved,
      ...toSchedulerMetricsLogPayload(schedulerMetrics),
    });
  }

  /**
   * KB-1248: Find function symbol with parse-under-edit resilience.
   * Wraps stdlib and document cache lookups in try-catch.
   */
  async function findFunctionSymbolResilient(
    funcName: string,
    callContext: {
      target: {
        expression: string;
        memberOperator: string | null;
      };
    },
    uri: string,
    cached: NonNullable<ReturnType<typeof documentCache.get>>,
    cancellationToken?: CancellationToken
  ): Promise<PikeSymbol | null> {
    // Check for cancellation first
    if (cancellationToken?.isCancellationRequested) {
      return null;
    }

    // Check if this is a qualified stdlib symbol
    if (
      callContext.target.memberOperator === '.' &&
      callContext.target.expression.includes('.') &&
      !callContext.target.expression.includes('->') &&
      stdlibIndex
    ) {
      const expression = callContext.target.expression;
      const lastDotIndex = expression.lastIndexOf('.');
      const modulePath = expression.substring(0, lastDotIndex);
      const symbolName = expression.substring(lastDotIndex + 1);

      logger.debug('Signature help for qualified symbol', { modulePath, symbolName });

      try {
        if (cancellationToken?.isCancellationRequested) {
          return null;
        }

        const currentFile = uriToFsPath(uri);
        const module = await stdlibIndex.getModule(modulePath);

        if (cancellationToken?.isCancellationRequested) {
          return null;
        }

        if (module?.symbols && module.symbols.has(symbolName)) {
          const methodSymbol = findMethodFromModuleSymbols(module.symbols, symbolName);

          if (methodSymbol) {
            return methodSymbol;
          }

          const targetPath = module.resolvedPath
            ? module.resolvedPath
            : services.bridge
              ? await services.bridge.resolveModule(modulePath, currentFile)
              : null;

          if (targetPath) {
            const cleanPath = targetPath.split(':')[0] ?? targetPath;
            const targetUri = `file://${cleanPath}`;

            const targetCached = documentCache.get(targetUri);
            if (targetCached) {
              const symbol = findSymbolByName(targetCached.symbols, symbolName);
              if (symbol) {
                return symbol;
              }
            }
          }
        }
      } catch (err) {
        // KB-1248: Gracefully handle stdlib lookup failures during parse-under-edit
        logger.debug('Error resolving stdlib symbol (handled gracefully)', {
          modulePath,
          symbolName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (cancellationToken?.isCancellationRequested) {
      return null;
    }

    // Fallback: search in current document
    try {
      const methodMatches = cached.symbols.filter(s => s.name === funcName && s.kind === 'method');
      const funcSymbol =
        methodMatches.find(s => !(s as { inherited?: boolean }).inherited) ??
        methodMatches[0] ??
        null;

      return funcSymbol;
    } catch (err) {
      // KB-1248: Gracefully handle document cache lookup failures
      logger.debug('Error searching local symbols (handled gracefully)', {
        funcName,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Signature help handler - show function parameters
   * KB-1248: Parse-under-edit resilience with cancellation support
   */
  connection.onSignatureHelp(async (params, cancellationToken): Promise<SignatureHelp | null> => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const cached = documentCache.get(uri);

    if (!document || !cached) {
      return null;
    }

    const text = document.getText();
    const offset = document.offsetAt(params.position);

    if (!services.bridge) {
      return null;
    }
    let callContext: Awaited<ReturnType<typeof resolveCallContextAtOffset>> = null;
    try {
      callContext = await resolveCallContextAtOffset(text, offset, t =>
        services.bridge!.tokenize(t)
      );
    } catch (err) {
      logger.debug('Call context resolution failed (handled gracefully)', {
        uri,
        offset,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }

    if (!callContext) {
      return null;
    }

    const funcName = callContext.target.name;
    const paramIndex = callContext.activeParameter;

    // KB-1248: Try query engine signature-help path with snapshot isolation
    if (useQueryEngineSignatureHelp) {
      const bridge = services.bridge;
      if (bridge?.isRunning?.()) {
        const nextSequence = (signatureHelpRequestSequence.get(uri) ?? 0) + 1;
        signatureHelpRequestSequence.set(uri, nextSequence);
        const requestId = `signatureHelp:${uri}:${document.version ?? 0}:${Date.now()}:${nextSequence}`;
        const filename = decodeURIComponent(uri.replace(/^file:\/\//, ''));

        let cancelledByToken = false;
        const cancellationDisposable = cancellationToken?.onCancellationRequested(() => {
          cancelledByToken = true;
          void bridge.engineCancelRequest({ requestId }).catch(error => {
            logger.warn('Signature help cancellation request failed', {
              uri,
              requestId,
              error,
            });
          });
        });

        const clearInFlight = (): void => {
          if (inFlightSignatureHelpRequests.get(uri) === requestId) {
            inFlightSignatureHelpRequests.delete(uri);
          }
        };

        try {
          const qeSignatureResult = await signatureHelpScheduler.schedule<SignatureHelp | null>({
            requestClass: 'interactive',
            key: `signatureHelp:${uri}`,
            run: async checkpoint => {
              checkpoint();
              if (cancelledByToken || cancellationToken?.isCancellationRequested) {
                throw new RequestSupersededError('Signature help request cancelled by LSP token');
              }

              // Cancel previous in-flight request for same URI
              const previousRequestId = inFlightSignatureHelpRequests.get(uri);
              if (previousRequestId && previousRequestId !== requestId) {
                try {
                  await bridge.engineCancelRequest({ requestId: previousRequestId });
                } catch (err) {
                  logger.debug('Signature help cancellation for superseded request failed', {
                    uri,
                    requestId: previousRequestId,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              }
              inFlightSignatureHelpRequests.set(uri, requestId);

              const snapshotId = services.documentSnapshots?.get(uri);
              const qeResponse = await bridge.engineQuery({
                feature: 'signatureHelp',
                requestId,
                snapshot: snapshotId ? { mode: 'fixed', snapshotId } : { mode: 'latest' },
                queryParams: {
                  uri,
                  filename,
                  position: params.position,
                  text,
                  offset,
                },
              });
              checkpoint();

              if (cancelledByToken || cancellationToken?.isCancellationRequested) {
                throw new RequestSupersededError('Signature help request cancelled by LSP token');
              }

              // Parse direct signature help result
              const directSig = asRecord(qeResponse.result['signatureHelp']);
              if (directSig) {
                return parseSignatureHelpResponse(directSig);
              }

              // Parse nested result
              const nested = asRecord(qeResponse.result['result']);
              if (nested && nested['status'] !== 'stub') {
                const nestedSig = asRecord(nested['signatureHelp']);
                if (nestedSig) {
                  return parseSignatureHelpResponse(nestedSig);
                }
              }

              return null;
            },
          });

          clearInFlight();
          cancellationDisposable?.dispose();
          if (qeSignatureResult) {
            maybeLogSignatureHelpSchedulerMetrics(uri, 'qe_success');
            return qeSignatureResult;
          }
        } catch (err) {
          clearInFlight();
          cancellationDisposable?.dispose();
          if (err instanceof RequestSupersededError) {
            maybeLogSignatureHelpSchedulerMetrics(uri, 'superseded');
            return null;
          }
          maybeLogSignatureHelpSchedulerMetrics(uri, 'qe_fallback');
          logger.debug('Signature help query engine fallback', {
            uri,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // Fallback: local signature resolution
    // KB-1248: Find function symbol with resilience wrapper
    let funcSymbol: PikeSymbol | null = null;

    try {
      funcSymbol = await findFunctionSymbolResilient(
        funcName,
        callContext,
        uri,
        cached,
        cancellationToken
      );
    } catch (err) {
      // KB-1248: Should be caught inside findFunctionSymbol, but handle just in case
      logger.debug('Function symbol lookup failed (handled gracefully)', {
        funcName,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }

    if (!funcSymbol) {
      return null;
    }

    // Build signature
    const params_list: ParameterInformation[] = [];
    const methodSymbol = funcSymbol as {
      argNames?: string[];
      argTypes?: unknown[];
      returnType?: unknown;
    };
    const argNames: string[] = methodSymbol.argNames ?? [];
    const argTypes: unknown[] = methodSymbol.argTypes ?? [];

    const returnType = formatPikeType(methodSymbol.returnType);
    let signatureLabel = `${returnType} ${funcName}(`;

    for (let i = 0; i < argNames.length; i++) {
      const paramStr = formatSignatureParameter(argNames, argTypes, i);

      const startOffset = signatureLabel.length;
      signatureLabel += paramStr;
      const endOffset = signatureLabel.length;

      params_list.push({
        label: [startOffset, endOffset],
      });

      if (i < argNames.length - 1) {
        signatureLabel += ', ';
      }
    }
    signatureLabel += ')';

    const signature: SignatureInformation = {
      label: signatureLabel,
      parameters: params_list,
    };

    logger.debug('Signature help', { func: funcName, paramIndex, paramsCount: params_list.length });

    maybeLogSignatureHelpSchedulerMetrics(uri, 'success');
    return {
      signatures: [signature],
      activeSignature: 0,
      activeParameter: params_list.length > 0 ? Math.min(paramIndex, params_list.length - 1) : 0,
    };
  });
}

function isVarargsType(typeObj: unknown): boolean {
  if (!typeObj) {
    return false;
  }
  if (typeof typeObj === 'string') {
    return typeObj.includes('...');
  }
  if (typeof typeObj !== 'object') {
    return false;
  }
  const record = typeObj as Record<string, unknown>;
  const name = (record['name'] ?? record['kind']) as string | undefined;
  return name === 'varargs';
}

function isOptionalType(typeObj: unknown): boolean {
  if (!typeObj) {
    return false;
  }
  if (typeof typeObj === 'string') {
    return /\bvoid\b/.test(typeObj) && typeObj.includes('|');
  }
  if (typeof typeObj !== 'object') {
    return false;
  }
  const record = typeObj as Record<string, unknown>;
  const name = (record['name'] ?? record['kind']) as string | undefined;
  if (name !== 'or') {
    return false;
  }
  const types = record['types'];
  if (!Array.isArray(types)) {
    return false;
  }
  return types.some(type => {
    if (!type || typeof type !== 'object') {
      return false;
    }
    const part = type as Record<string, unknown>;
    const partName = (part['name'] ?? part['kind']) as string | undefined;
    return partName === 'void';
  });
}

function formatSignatureParameter(argNames: string[], argTypes: unknown[], index: number): string {
  const rawName = argNames[index] ?? `arg${index + 1}`;
  const rawType = argTypes[index];
  const optional = isOptionalType(rawType);
  const varargs = isVarargsType(rawType);

  const typeName = formatPikeType(rawType)
    .replace(/\s*\|\s*void/g, '')
    .replace(/void\s*\|\s*/g, '')
    .trim();
  const normalizedType = varargs ? typeName.replace(/\.{3}\s*$/, '').trim() : typeName;

  const cleanName = rawName.replace(/^\.{3}/, '');
  const displayName = `${varargs ? '...' : ''}${cleanName}${optional ? '?' : ''}`;
  return `${normalizedType || 'mixed'} ${displayName}`;
}

/**
 * Find symbol by name in an array of symbols
 */
function findSymbolByName(symbols: PikeSymbol[], name: string): PikeSymbol | null {
  for (const symbol of symbols) {
    if (symbol.name === name) {
      return symbol;
    }
  }
  return null;
}

function findMethodFromModuleSymbols(
  symbols: Map<string, IntrospectedSymbol> | undefined,
  name: string
): PikeMethod | null {
  if (!symbols) {
    return null;
  }

  const introspected = symbols.get(name);
  if (!introspected || introspected.kind !== 'function') {
    return null;
  }

  const functionType = introspected.type as PikeFunctionType;
  if (!functionType || functionType.kind !== 'function') {
    return null;
  }

  const args = functionType.arguments ?? [];
  const argNames =
    args.length > 0 ? args.map(arg => arg.name) : (functionType.argTypes?.map(() => null) ?? []);
  const argTypes = functionType.argTypes ?? args.map(() => ({ kind: 'mixed' as const }));

  return {
    name: introspected.name,
    kind: 'method',
    modifiers: introspected.modifiers,
    argNames,
    argTypes,
    returnType: functionType.returnType,
    type: introspected.type,
    inherited: introspected.inherited,
    inheritedFrom: introspected.inheritedFrom,
    deprecated: introspected.deprecated === true || introspected.deprecated === 1,
    documentation: introspected.documentation,
  } as PikeMethod;
}
