/**
 * Semantic Tokens Handler
 *
 * Provides rich syntax highlighting for Pike code.
 * Supports both full and delta (incremental) updates for efficient token updates.
 * KB-1262: Parse-under-edit resilience
 */

import {
  Connection,
  SemanticTokens,
  SemanticTokensDelta,
  CancellationToken,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';
import { RequestScheduler, RequestSupersededError } from '../../services/request-scheduler.js';
import { toSchedulerMetricsLogPayload } from '../utils/scheduler-metrics.js';
import { buildTokens } from './semantic-tokens-builder.js';

/**
 * Register semantic tokens handler.
 */
export function registerSemanticTokensHandler(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const log = new Logger('Advanced');

  // KB-1262: Request scheduler for resilient semantic tokens requests
  const tokensScheduler = new RequestScheduler({ logger: log });
  const TOKENS_SCHEDULER_LOG_EVERY = 50;
  let tokensRequestsObserved = 0;

  function maybeLogTokensSchedulerMetrics(uri: string, outcome: string): void {
    tokensRequestsObserved += 1;
    if (tokensRequestsObserved % TOKENS_SCHEDULER_LOG_EVERY !== 0) {
      return;
    }
    const schedulerMetrics = tokensScheduler.snapshotMetrics();
    log.debug('Tokens scheduler metrics', {
      uri,
      outcome,
      samples: tokensRequestsObserved,
      ...toSchedulerMetricsLogPayload(schedulerMetrics),
    });
  }

  // KB-1262: Distinguish parse-under-edit errors from unexpected errors
  function isParseUnderEditError(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes('invalid regular expression') ||
      lower.includes('regex') ||
      lower.includes('parse') ||
      lower.includes('unexpected') ||
      lower.includes('unterminated') ||
      lower.includes('syntax')
    );
  }
  const tokenStateByUri = new Map<string, { resultId: string; data: number[]; version: number }>();
  let nextResultCounter = 0;

  const makeResultId = (): string => {
    nextResultCounter += 1;
    return String(nextResultCounter);
  };

  const computeDeltaEdit = (
    previousData: number[],
    nextData: number[]
  ): { start: number; deleteCount: number; data: number[] } | null => {
    if (previousData.length === nextData.length) {
      let same = true;
      for (let i = 0; i < previousData.length; i++) {
        if (previousData[i] !== nextData[i]) {
          same = false;
          break;
        }
      }
      if (same) {
        return null;
      }
    }

    let prefix = 0;
    const minLen = Math.min(previousData.length, nextData.length);
    while (prefix < minLen && previousData[prefix] === nextData[prefix]) {
      prefix++;
    }

    let suffix = 0;
    const remainingPrevious = previousData.length - prefix;
    const remainingNext = nextData.length - prefix;
    const maxSuffix = Math.min(remainingPrevious, remainingNext);
    while (
      suffix < maxSuffix &&
      previousData[previousData.length - 1 - suffix] === nextData[nextData.length - 1 - suffix]
    ) {
      suffix++;
    }

    const deleteCount = previousData.length - prefix - suffix;
    const data = nextData.slice(prefix, nextData.length - suffix);
    return {
      start: prefix,
      deleteCount,
      data,
    };
  };

  const getOrBuildTokenState = async (
    uri: string,
    document: TextDocument,
    cancellationToken?: CancellationToken
  ) => {
    const existing = tokenStateByUri.get(uri);
    if (existing && existing.version === document.version) {
      return existing;
    }

    // KB-1262: Wrap buildTokens in try-catch for parse-under-edit resilience
    let tokens: SemanticTokens;
    try {
      tokens = await buildTokens(uri, document, services, log, cancellationToken);
    } catch (err) {
      // KB-1262: Gracefully handle parse-under-edit errors in token building
      log.debug('Token building failed (likely parse-under-edit)', {
        uri,
        error: err instanceof Error ? err.message : String(err),
      });
      tokens = { resultId: '0', data: [] };
    }
    const state = {
      resultId: makeResultId(),
      data: [...tokens.data],
      version: document.version,
    };
    tokenStateByUri.set(uri, state);
    return state;
  };

  const docsWithClose = documents as unknown as {
    onDidClose?: (listener: (event: { document: TextDocument }) => void) => void;
  };
  if (typeof docsWithClose.onDidClose === 'function') {
    docsWithClose.onDidClose(event => {
      tokenStateByUri.delete(event.document.uri);
    });
  }

  /**
   * Semantic Tokens - Full request handler
   *
   * With delta enabled in server capabilities, VSCode will request incremental
   * updates when available. The server advertises delta support in capabilities,
   * enabling the client to make more efficient token requests on document changes.
   * KB-1262: Parse-under-edit resilience with cancellation support
   */
  connection.languages.semanticTokens.on(async (params, cancellationToken) => {
    log.debug('Semantic tokens request', { uri: params.textDocument.uri });

    // KB-1262: Check cancellation early
    if (cancellationToken?.isCancellationRequested) {
      maybeLogTokensSchedulerMetrics(params.textDocument.uri, 'cancelled-early');
      return { resultId: '0', data: [] };
    }

    const uri = params.textDocument.uri;

    try {
      const result = await tokensScheduler.schedule<SemanticTokens>({
        requestClass: 'interactive',
        key: `semantic-tokens:${uri}`,
        run: async checkpoint => {
          checkpoint();

          if (cancellationToken?.isCancellationRequested) {
            throw new RequestSupersededError('Semantic tokens request cancelled');
          }

          const document = documents.get(uri);

          if (!document) {
            return { resultId: '0', data: [] };
          }

          const state = await getOrBuildTokenState(uri, document, cancellationToken);
          return {
            resultId: state.resultId,
            data: state.data,
          };
        },
      });

      maybeLogTokensSchedulerMetrics(uri, 'success');
      return result;
    } catch (err) {
      // KB-1262: RequestSupersededError means a newer request replaced this one
      if (err instanceof RequestSupersededError) {
        maybeLogTokensSchedulerMetrics(uri, 'superseded');
        return { resultId: '0', data: [] };
      }

      // KB-1262: Distinguish parse-under-edit errors from unexpected errors
      const errMsg = err instanceof Error ? err.message : String(err);
      if (isParseUnderEditError(errMsg)) {
        log.debug('Semantic tokens request failed (likely parse-under-edit)', {
          uri,
          error: errMsg,
        });
      } else {
        log.error(`Semantic tokens request failed for ${uri}: ${errMsg}`);
      }
      maybeLogTokensSchedulerMetrics(uri, 'error');
      return { resultId: '0', data: [] };
    }
  });

  /**
   * Semantic Tokens - Delta request handler
   * KB-1262: Parse-under-edit resilience with cancellation support
   */
  connection.languages.semanticTokens.onDelta(
    async (params, cancellationToken): Promise<SemanticTokensDelta> => {
      log.debug('Semantic tokens delta request', { uri: params.textDocument.uri });

      // KB-1262: Check cancellation early
      if (cancellationToken?.isCancellationRequested) {
        maybeLogTokensSchedulerMetrics(params.textDocument.uri, 'cancelled-early-delta');
        return { resultId: '0', edits: [] };
      }

      const uri = params.textDocument.uri;

      try {
        const result = await tokensScheduler.schedule<SemanticTokensDelta>({
          requestClass: 'interactive',
          key: `semantic-tokens-delta:${uri}`,
          run: async checkpoint => {
            checkpoint();

            if (cancellationToken?.isCancellationRequested) {
              throw new RequestSupersededError('Semantic tokens delta request cancelled');
            }

            const document = documents.get(uri);
            const previousState = tokenStateByUri.get(uri);

            if (!document) {
              return { resultId: '0', edits: [] };
            }

            const nextState = await getOrBuildTokenState(uri, document, cancellationToken);

            if (previousState && previousState.resultId === nextState.resultId) {
              if (params.previousResultId === nextState.resultId) {
                return {
                  resultId: nextState.resultId,
                  edits: [],
                };
              }

              return {
                resultId: nextState.resultId,
                edits: [{ start: 0, deleteCount: 0, data: nextState.data }],
              };
            }

            if (!previousState || previousState.resultId !== params.previousResultId) {
              return {
                resultId: nextState.resultId,
                edits: [{ start: 0, deleteCount: 0, data: nextState.data }],
              };
            }

            const edit = computeDeltaEdit(previousState.data, nextState.data);

            if (!edit) {
              return {
                resultId: nextState.resultId,
                edits: [],
              };
            }

            return {
              resultId: nextState.resultId,
              edits: [edit],
            };
          },
        });

        maybeLogTokensSchedulerMetrics(uri, 'success');
        return result;
      } catch (err) {
        // KB-1262: RequestSupersededError means a newer request replaced this one
        if (err instanceof RequestSupersededError) {
          maybeLogTokensSchedulerMetrics(uri, 'superseded');
          return { resultId: '0', edits: [] };
        }

        // KB-1262: Distinguish parse-under-edit errors from unexpected errors
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isParseUnderEditError(errMsg)) {
          log.debug('Semantic tokens delta request failed (likely parse-under-edit)', {
            uri,
            error: errMsg,
          });
        } else {
          log.error('Semantic tokens delta request failed', {
            error: errMsg,
          });
        }
        maybeLogTokensSchedulerMetrics(uri, 'error');
        return { resultId: '0', edits: [] };
      }
    }
  );
}
