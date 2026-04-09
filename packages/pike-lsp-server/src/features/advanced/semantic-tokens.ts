/**
 * Semantic Tokens Handler
 *
 * Provides rich syntax highlighting for Pike code.
 * Supports both full and delta (incremental) updates for efficient token updates.
 * KB-1262: Parse-under-edit resilience
 */

import {
  Connection,
  SemanticTokensBuilder,
  SemanticTokens,
  SemanticTokensDelta,
  CancellationToken,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { PatternHelpers } from '../../utils/regex-patterns.js';
import { Logger } from '@pike-lsp/core';
import { PIKE_KEYWORDS } from '../navigation/keywords.js';
import { RequestScheduler, RequestSupersededError } from '../../services/request-scheduler.js';
import { toSchedulerMetricsLogPayload } from '../utils/scheduler-metrics.js';

// Semantic tokens legend (shared with server.ts)
const tokenTypes = [
  'namespace',
  'type',
  'class',
  'enum',
  'interface',
  'struct',
  'typeParameter',
  'parameter',
  'variable',
  'property',
  'enumMember',
  'event',
  'function',
  'method',
  'macro',
  'keyword',
  'modifier',
  'comment',
  'string',
  'number',
  'regexp',
  'operator',
  'decorator',
];
const tokenModifiers = [
  'declaration',
  'definition',
  'readonly',
  'static',
  'deprecated',
  'abstract',
  'async',
  'modification',
  'documentation',
  'defaultLibrary',
];

/**
 * Register semantic tokens handler.
 */
export function registerSemanticTokensHandler(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache } = services;
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

  const getOrBuildTokenState = (
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
      tokens = buildTokens(uri, document, cancellationToken);
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

  /**
   * Build semantic tokens for a document from cached symbols.
   */
  const buildTokens = (
    uri: string,
    document: TextDocument,
    cancellationToken?: CancellationToken
  ): SemanticTokens => {
    const builder = new SemanticTokensBuilder();
    const text = document.getText();
    const lines = text.split('\n');

    type IgnoredRange = { start: number; end: number };

    const addIgnoredRange = (
      ignoredRangesByLine: IgnoredRange[][],
      lineNum: number,
      start: number,
      end: number
    ): void => {
      if (start >= end || lineNum < 0 || lineNum >= ignoredRangesByLine.length) {
        return;
      }
      ignoredRangesByLine[lineNum]!.push({ start, end });
    };

    const buildIgnoredRangesByLine = (sourceLines: string[]): IgnoredRange[][] => {
      const ignoredRangesByLine: IgnoredRange[][] = sourceLines.map(() => []);
      let inBlockComment = false;
      let inString = false;
      let inMultilineString = false;

      for (let lineNum = 0; lineNum < sourceLines.length; lineNum++) {
        const line = sourceLines[lineNum] ?? '';
        let i = 0;

        while (i < line.length) {
          if (inBlockComment) {
            const closeIndex = line.indexOf('*/', i);
            if (closeIndex < 0) {
              addIgnoredRange(ignoredRangesByLine, lineNum, i, line.length);
              i = line.length;
              continue;
            }

            const end = closeIndex + 2;
            addIgnoredRange(ignoredRangesByLine, lineNum, i, end);
            i = end;
            inBlockComment = false;
            continue;
          }

          if (inMultilineString) {
            const closeIndex = line.indexOf('"#', i);
            if (closeIndex < 0) {
              addIgnoredRange(ignoredRangesByLine, lineNum, i, line.length);
              i = line.length;
              continue;
            }

            const end = closeIndex + 2;
            addIgnoredRange(ignoredRangesByLine, lineNum, i, end);
            i = end;
            inMultilineString = false;
            continue;
          }

          if (inString) {
            const start = i;
            let escaped = false;
            while (i < line.length) {
              const char = line[i];
              if (escaped) {
                escaped = false;
                i++;
                continue;
              }

              if (char === '\\') {
                escaped = true;
                i++;
                continue;
              }

              if (char === '"') {
                i++;
                inString = false;
                break;
              }

              i++;
            }

            addIgnoredRange(ignoredRangesByLine, lineNum, start, i);

            if (inString && i >= line.length) {
              inString = false;
            }

            continue;
          }

          if (line.startsWith('//', i)) {
            addIgnoredRange(ignoredRangesByLine, lineNum, i, line.length);
            break;
          }

          if (line.startsWith('/*', i)) {
            inBlockComment = true;
            continue;
          }

          if (line.startsWith('#"', i)) {
            inMultilineString = true;
            continue;
          }

          if (line[i] === '"') {
            inString = true;
            continue;
          }

          i++;
        }
      }

      return ignoredRangesByLine;
    };

    const ignoredRangesByLine = buildIgnoredRangesByLine(lines);

    const isIgnoredPosition = (lineNum: number, charPos: number): boolean => {
      const ranges = ignoredRangesByLine[lineNum];
      if (!ranges || ranges.length === 0) {
        return false;
      }

      for (const range of ranges) {
        if (charPos >= range.start && charPos < range.end) {
          return true;
        }
      }

      return false;
    };

    const declarationBit = 1 << tokenModifiers.indexOf('declaration');
    const readonlyBit = 1 << tokenModifiers.indexOf('readonly');
    const staticBit = 1 << tokenModifiers.indexOf('static');
    const deprecatedBit = 1 << tokenModifiers.indexOf('deprecated');

    const cached = documentCache.get(uri);
    if (!cached) {
      return builder.build();
    }

    // KB-1262: Track symbol count for periodic cancellation checks
    let symbolIndex = 0;
    for (const symbol of cached.symbols) {
      if (!symbol.name) continue;

      // KB-1262: Check cancellation every 10 symbols
      symbolIndex++;
      if (
        cancellationToken &&
        symbolIndex % 10 === 0 &&
        cancellationToken.isCancellationRequested
      ) {
        break;
      }

      let tokenType = tokenTypes.indexOf('variable');
      let declModifiers = declarationBit;

      const hasModifier = (mod: string) => symbol.modifiers && symbol.modifiers.includes(mod);

      if (hasModifier('static')) {
        declModifiers |= staticBit;
      }

      if (hasModifier('deprecated')) {
        declModifiers |= deprecatedBit;
      }

      switch (symbol.kind) {
        case 'class':
          tokenType = tokenTypes.indexOf('class');
          break;
        case 'method':
          tokenType = tokenTypes.indexOf('method');
          break;
        case 'variable':
          tokenType = tokenTypes.indexOf('variable');
          break;
        case 'constant':
          tokenType = tokenTypes.indexOf('property');
          declModifiers |= readonlyBit;
          break;
        case 'enum':
          tokenType = tokenTypes.indexOf('enum');
          break;
        case 'enum_constant':
          tokenType = tokenTypes.indexOf('enumMember');
          declModifiers |= readonlyBit;
          break;
        case 'typedef':
          tokenType = tokenTypes.indexOf('type');
          break;
        case 'module':
          tokenType = tokenTypes.indexOf('namespace');
          break;
        case 'import':
          tokenType = tokenTypes.indexOf('namespace');
          break;
        case 'inherit':
          tokenType = tokenTypes.indexOf('class');
          break;
        case 'include':
          tokenType = tokenTypes.indexOf('namespace');
          break;
        default:
          continue;
      }

      // KB-1262: Wrap regex construction and matching in try-catch per symbol
      try {
        const symbolRegex = PatternHelpers.wholeWordPattern(symbol.name);
        const declLine = symbol.position ? symbol.position.line - 1 : -1;
        const searchRadius = 50;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];
          if (!line) continue;

          if (declLine >= 0 && Math.abs(lineNum - declLine) > searchRadius) {
            continue;
          }

          let match = symbolRegex.exec(line);
          while (match !== null) {
            const matchIndex = match.index;

            if (!isIgnoredPosition(lineNum, matchIndex)) {
              const isDeclaration = symbol.position && symbol.position.line - 1 === lineNum;
              const modifiers = isDeclaration ? declModifiers : 0;
              builder.push(lineNum, matchIndex, symbol.name.length, tokenType, modifiers);
            }

            match = symbolRegex.exec(line);
          }
        }
      } catch (err) {
        // KB-1262: Skip symbols with malformed names during parse-under-edit
        log.debug('Symbol regex failed (likely parse-under-edit)', {
          uri,
          symbolName: symbol.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // KB-1262: Check cancellation before keyword processing
    if (cancellationToken?.isCancellationRequested) {
      return builder.build();
    }

    // Add keyword highlighting for Pike keywords
    const keywordTokenType = tokenTypes.indexOf('keyword');
    const controlKeywords = PIKE_KEYWORDS.filter(kw => kw.category === 'control').map(
      kw => kw.name
    );

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      // KB-1262: Check cancellation periodically during keyword processing
      if (cancellationToken?.isCancellationRequested) {
        break;
      }

      const line = lines[lineNum];
      if (!line) continue;

      for (const keyword of controlKeywords) {
        // KB-1262: Wrap keyword regex in try-catch per keyword
        try {
          const keywordRegex = new RegExp(`\\b${keyword}\\b`, 'g');
          let match = keywordRegex.exec(line);
          while (match !== null) {
            const matchIndex = match.index;

            if (!isIgnoredPosition(lineNum, matchIndex)) {
              builder.push(lineNum, matchIndex, keyword.length, keywordTokenType, 0);
            }

            match = keywordRegex.exec(line);
          }
        } catch (err) {
          // KB-1262: Skip keywords with regex construction failures
          log.debug('Keyword regex failed (likely parse-under-edit)', {
            uri,
            keyword,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return builder.build();
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
      return { resultId: '0', data: [] };
    }

    const uri = params.textDocument.uri;

    try {
      // KB-1262: Schedule through RequestScheduler for cancellation and supersession
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

          const state = getOrBuildTokenState(uri, document, cancellationToken);
          return {
            resultId: state.resultId,
            data: state.data,
          };
        },
      });

      maybeLogTokensSchedulerMetrics(uri, 'success');
      return result;
    } catch (err) {
      // RequestSupersededError means a newer request superseded this one
      if (err instanceof RequestSupersededError) {
        maybeLogTokensSchedulerMetrics(uri, 'superseded');
        return { resultId: '0', data: [] };
      }

      // KB-1262: Distinguish parse-under-edit errors from unexpected errors
      const errMsg = err instanceof Error ? err.message : String(err);
      if (isParseUnderEditError(errMsg)) {
        log.debug('Semantic tokens request failed (likely parse-under-edit)', {
          uri: params.textDocument.uri,
          error: errMsg,
        });
      } else {
        log.error(`Semantic tokens request failed for ${params.textDocument.uri}: ${errMsg}`);
      }
      maybeLogTokensSchedulerMetrics(params.textDocument.uri, 'error');
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
        return { resultId: '0', edits: [] };
      }

      const uri = params.textDocument.uri;

      try {
        // KB-1262: Schedule through RequestScheduler for cancellation and supersession
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

            const nextState = getOrBuildTokenState(uri, document, cancellationToken);

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

            checkpoint();

            return {
              resultId: nextState.resultId,
              edits: [edit],
            };
          },
        });

        maybeLogTokensSchedulerMetrics(uri, 'success');
        return result;
      } catch (err) {
        // RequestSupersededError means a newer request superseded this one
        if (err instanceof RequestSupersededError) {
          maybeLogTokensSchedulerMetrics(uri, 'superseded');
          return { resultId: '0', edits: [] };
        }

        // KB-1262: Distinguish parse-under-edit errors from unexpected errors
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isParseUnderEditError(errMsg)) {
          log.debug('Semantic tokens delta request failed (likely parse-under-edit)', {
            uri: params.textDocument.uri,
            error: errMsg,
          });
        } else {
          log.error('Semantic tokens delta request failed', {
            error: errMsg,
          });
        }
        maybeLogTokensSchedulerMetrics(params.textDocument.uri, 'error');
        return { resultId: '0', edits: [] };
      }
    }
  );
}
