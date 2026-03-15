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

    const isInsideComment = (line: string, charPos: number): boolean => {
      const trimmed = line.trimStart();
      if (PatternHelpers.isCommentLine(trimmed)) {
        return true;
      }
      const lineCommentPos = line.indexOf('//');
      if (lineCommentPos >= 0 && lineCommentPos < charPos) {
        return true;
      }
      const blockOpenPos = line.lastIndexOf('/*', charPos);
      if (blockOpenPos >= 0) {
        const blockClosePos = line.indexOf('*/', blockOpenPos);
        if (blockClosePos < 0 || blockClosePos > charPos) {
          return true;
        }
      }
      return false;
    };

    const isInsideString = (line: string, charPos: number): boolean => {
      let inString = false;
      let escaped = false;
      for (let i = 0; i < charPos; i++) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (line[i] === '\\') {
          escaped = true;
          continue;
        }
        if (line[i] === '"') {
          inString = !inString;
        }
      }
      return inString;
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

          if (!(isInsideComment(line, matchIndex) || isInsideString(line, matchIndex))) {
            const isDeclaration = symbol.position && symbol.position.line - 1 === lineNum;
            const modifiers = isDeclaration ? declModifiers : 0;
            builder.push(lineNum, matchIndex, symbol.name.length, tokenType, modifiers);
          }

          match = symbolRegex.exec(line);
        }
      }
    }

    // Add keyword highlighting for Pike keywords
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

          if (!(isInsideComment(line, matchIndex) || isInsideString(line, matchIndex))) {
            builder.push(lineNum, matchIndex, keyword.length, keywordTokenType, 0);
          }

          match = keywordRegex.exec(line);
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
   */
  connection.languages.semanticTokens.on(params => {
    log.debug('Semantic tokens request', { uri: params.textDocument.uri });
    try {
      const uri = params.textDocument.uri;
      const document = documents.get(uri);

      if (!document) {
        return { resultId: '0', data: [] };
      }

      const state = getOrBuildTokenState(uri, document);
      return {
        resultId: state.resultId,
        data: state.data,
      };
    } catch (err) {
      log.error(
        `Semantic tokens request failed for ${params.textDocument.uri}: ${err instanceof Error ? err.message : String(err)}`
      );
      return { resultId: '0', data: [] };
    }
  });

  /**
   * Semantic Tokens - Delta request handler
   */
  connection.languages.semanticTokens.onDelta((params): SemanticTokensDelta => {
    log.debug('Semantic tokens delta request', { uri: params.textDocument.uri });
    try {
      const uri = params.textDocument.uri;
      const document = documents.get(uri);
      const previousState = tokenStateByUri.get(uri);

      if (!document) {
        return { resultId: '0', edits: [] };
      }

      const nextState = getOrBuildTokenState(uri, document);

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
    } catch (err) {
      log.error('Semantic tokens delta request failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { resultId: '0', edits: [] };
    }
  });
}
