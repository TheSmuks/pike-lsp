/**
 * Semantic Tokens Handler
 *
 * Provides rich syntax highlighting for Pike code.
 * Supports both full and delta (incremental) updates for efficient token updates.
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

  // KB-1248: Shared error classification for parse-under-edit resilience logging
  const logTokenError = (label: string, uri: string, err: unknown): void => {
    const msg = err instanceof Error ? err.message : String(err);
    const isParse = msg.includes('parse') || msg.includes('regex') || msg.includes('syntax');
    if (isParse) {
      log.debug(`${label} failed (parse-under-edit, handled gracefully)`, { uri, error: msg });
    } else {
      log.error(`${label} failed for ${uri}: ${msg}`);
    }
  };

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
    if (
      previousData.length === nextData.length &&
      previousData.every((v, i) => v === nextData[i])
    ) {
      return null;
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

  const getOrBuildTokenState = (uri: string, document: TextDocument) => {
    const existing = tokenStateByUri.get(uri);
    if (existing && existing.version === document.version) {
      return existing;
    }

    const tokens = buildTokens(uri, document);
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
  const buildTokens = (uri: string, document: TextDocument): SemanticTokens => {
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

    for (const symbol of cached.symbols) {
      if (!symbol.name) continue;

      // KB-1248: Per-symbol error isolation - one bad symbol must not break all tokens
      try {
        const kindToTokenType: Record<string, string> = {
          class: 'class',
          method: 'method',
          variable: 'variable',
          constant: 'property',
          enum: 'enum',
          enum_constant: 'enumMember',
          typedef: 'type',
          module: 'namespace',
          import: 'namespace',
          inherit: 'class',
          include: 'namespace',
        };
        const mappedType = kindToTokenType[symbol.kind];
        if (!mappedType) continue;

        const tokenType = tokenTypes.indexOf(mappedType);
        let declModifiers = declarationBit;
        const hasModifier = (mod: string) => symbol.modifiers?.includes(mod) ?? false;
        if (hasModifier('static')) declModifiers |= staticBit;
        if (hasModifier('deprecated')) declModifiers |= deprecatedBit;
        if (symbol.kind === 'constant' || symbol.kind === 'enum_constant')
          declModifiers |= readonlyBit;

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
        // KB-1248: Skip symbols with broken regex/name, continue with others
        log.debug('Symbol tokenization failed (handled gracefully)', {
          uri,
          symbolName: symbol.name,
          symbolKind: symbol.kind,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Add keyword highlighting for Pike keywords
    // KB-1248: Wrap in try-catch for resilience during malformed edits
    try {
      const keywordTokenType = tokenTypes.indexOf('keyword');
      const controlKeywords = PIKE_KEYWORDS.filter(kw => kw.category === 'control').map(
        kw => kw.name
      );

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        if (!line) continue;

        for (const keyword of controlKeywords) {
          const keywordRegex = new RegExp(`\\b${keyword}\\b`, 'g');
          let match = keywordRegex.exec(line);
          while (match !== null) {
            const matchIndex = match.index;

            if (!isIgnoredPosition(lineNum, matchIndex)) {
              builder.push(lineNum, matchIndex, keyword.length, keywordTokenType, 0);
            }

            match = keywordRegex.exec(line);
          }
        }
      }
    } catch (err) {
      // KB-1248: Keyword highlighting is best-effort, must not break symbol tokens
      log.debug('Keyword tokenization failed (handled gracefully)', {
        uri,
        error: err instanceof Error ? err.message : String(err),
      });
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
   *
   * KB-1248: Cancellation support and improved error isolation.
   */
  connection.languages.semanticTokens.on(
    (params: { textDocument: { uri: string } }, cancellationToken?: CancellationToken) => {
      const uri = params.textDocument.uri;
      log.debug('Semantic tokens request', { uri });

      // KB-1248: Check cancellation early
      if (cancellationToken?.isCancellationRequested) {
        return { resultId: '0', data: [] };
      }

      try {
        const document = documents.get(uri);

        if (!document) {
          return { resultId: '0', data: [] };
        }

        // KB-1248: Check cancellation before expensive tokenization
        if (cancellationToken?.isCancellationRequested) {
          return { resultId: '0', data: [] };
        }

        const state = getOrBuildTokenState(uri, document);
        return {
          resultId: state.resultId,
          data: state.data,
        };
      } catch (err) {
        logTokenError('Semantic tokens request', uri, err);
        return { resultId: '0', data: [] };
      }
    }
  );

  /**
   * Semantic Tokens - Delta request handler
   * KB-1248: Cancellation support and improved error isolation.
   */
  connection.languages.semanticTokens.onDelta(
    (
      params: { textDocument: { uri: string }; previousResultId: string },
      cancellationToken?: CancellationToken
    ): SemanticTokensDelta => {
      const uri = params.textDocument.uri;
      log.debug('Semantic tokens delta request', { uri });

      if (cancellationToken?.isCancellationRequested) {
        return { resultId: '0', edits: [] };
      }

      try {
        const document = documents.get(uri);
        const previousState = tokenStateByUri.get(uri);
        if (!document || cancellationToken?.isCancellationRequested) {
          return { resultId: '0', edits: [] };
        }

        const nextState = getOrBuildTokenState(uri, document);
        const fullReplace = {
          resultId: nextState.resultId,
          edits: [{ start: 0, deleteCount: 0, data: nextState.data }],
        };

        if (previousState && previousState.resultId === nextState.resultId) {
          return params.previousResultId === nextState.resultId
            ? { resultId: nextState.resultId, edits: [] }
            : fullReplace;
        }

        if (!previousState || previousState.resultId !== params.previousResultId) {
          return fullReplace;
        }

        const edit = computeDeltaEdit(previousState.data, nextState.data);
        return edit
          ? { resultId: nextState.resultId, edits: [edit] }
          : { resultId: nextState.resultId, edits: [] };
      } catch (err) {
        logTokenError('Semantic tokens delta request', uri, err);
        return { resultId: '0', edits: [] };
      }
    }
  );
}
