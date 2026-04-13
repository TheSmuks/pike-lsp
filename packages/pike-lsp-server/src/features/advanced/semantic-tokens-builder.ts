/**
 * Semantic Tokens Builder
 *
 * Builds semantic token arrays from cached symbols for Pike documents.
 * Extracted from semantic-tokens.ts to keep file sizes under 500 lines.
 */

import {
  SemanticTokensBuilder,
  SemanticTokens,
  CancellationToken,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';
import { PIKE_KEYWORDS } from '../navigation/keywords.js';
import { buildIgnoredRangesFromTokens, buildIgnoredRangesFallback } from './ignored-ranges.js';
import type { IgnoredRange } from './ignored-ranges.js';

/** Create a word-boundary regex for exact identifier matching. */
function wholeWordPattern(identifier: string): RegExp {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'g');
}

// Issue #1389: Pre-compiled keyword regex — avoids per-invocation RegExp construction
const CONTROL_KEYWORD_NAMES = PIKE_KEYWORDS.filter(kw => kw.category === 'control').map(
  kw => kw.name
);
const CONTROL_KEYWORDS_REGEX = new RegExp('\\b(' + CONTROL_KEYWORD_NAMES.join('|') + ')\\b', 'g');

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

export { tokenTypes, tokenModifiers };

/**
 * Build semantic tokens for a document from cached symbols.
 */
export async function buildTokens(
  uri: string,
  document: TextDocument,
  services: Services,
  log: Logger,
  cancellationToken?: CancellationToken
): Promise<SemanticTokens> {
  const builder = new SemanticTokensBuilder();
  const text = document.getText();
  const lines = text.split('\n');

  // Issue #1581: Build ignored ranges from bridge.tokenize() output.
  // When bridge is unavailable (tests, parse-under-edit), falls back to a
  // lightweight line scanner that detects //, /* */, "...", and #"..."#.
  let ignoredRangesByLine: IgnoredRange[][];
  if (services.bridge) {
    try {
      const tokens = await services.bridge.tokenize(text);
      ignoredRangesByLine = buildIgnoredRangesFromTokens(tokens, lines.length);
    } catch {
      // Tokenize failure (parse-under-edit) — fall back to line scanner
      ignoredRangesByLine = buildIgnoredRangesFallback(lines);
    }
  } else {
    ignoredRangesByLine = buildIgnoredRangesFallback(lines);
  }

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

  const cached = services.documentCache.get(uri);
  if (!cached) {
    return builder.build();
  }

  // KB-1262: Track symbol count for periodic cancellation checks
  let symbolIndex = 0;
  for (const symbol of cached.symbols) {
    if (!symbol.name) continue;

    // KB-1262: Check cancellation every 10 symbols
    symbolIndex++;
    if (cancellationToken && symbolIndex % 10 === 0 && cancellationToken.isCancellationRequested) {
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
      const symbolRegex = wholeWordPattern(symbol.name);
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

  // Issue #1389: Control keywords matched via pre-compiled module-level regex
  const keywordTokenType = tokenTypes.indexOf('keyword');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    // KB-1262: Check cancellation periodically during keyword processing
    if (cancellationToken?.isCancellationRequested) {
      break;
    }

    const line = lines[lineNum];
    if (!line) continue;

    // Issue #1389: Single regex scan instead of per-keyword RegExp construction
    // Reset lastIndex for stateful 'g' flag when switching lines
    CONTROL_KEYWORDS_REGEX.lastIndex = 0;
    try {
      let match = CONTROL_KEYWORDS_REGEX.exec(line);
      while (match !== null) {
        const matchIndex = match.index;
        const matchedKeyword = match[0];

        if (matchedKeyword && !isIgnoredPosition(lineNum, matchIndex)) {
          builder.push(lineNum, matchIndex, matchedKeyword.length, keywordTokenType, 0);
        }

        match = CONTROL_KEYWORDS_REGEX.exec(line);
      }
    } catch (_) {
      // Skip lines with regex matching failures during parse-under-edit
    }
  }

  return builder.build();
}
