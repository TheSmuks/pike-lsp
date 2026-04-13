/**
 * Semantic Tokens Builder
 *
 * Builds semantic token arrays from cached symbols for Pike documents.
 * Extracted from semantic-tokens.ts to keep file sizes under 500 lines.
 */

import type { PikeToken, PikeSymbol } from '@pike-lsp/pike-bridge';
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

  // Tokenize and build ignored ranges.
  // When bridge is unavailable (tests, parse-under-edit), falls back to a
  // lightweight line scanner that detects //, /* */, "...", and #"..."#.
  let ignoredRangesByLine: IgnoredRange[][];
  let tokens: PikeToken[] | null = null;
  if (services.bridge) {
    try {
      tokens = await services.bridge.tokenize(text);
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

  // Build name → symbols lookup from cached symbols.
  // A single name may map to multiple symbols (different kinds/positions).
  const symbolMap = new Map<string, PikeSymbol[]>();
  for (const sym of cached.symbols) {
    if (!sym.name) continue;
    let list = symbolMap.get(sym.name);
    if (!list) {
      list = [];
      symbolMap.set(sym.name, list);
    }
    list.push(sym);
  }

  // Resolve token type and modifiers for a symbol kind.
  const getTokenType = (kind: string): number => {
    switch (kind) {
      case 'class':
        return tokenTypes.indexOf('class');
      case 'method':
        return tokenTypes.indexOf('method');
      case 'variable':
        return tokenTypes.indexOf('variable');
      case 'constant':
        return tokenTypes.indexOf('property');
      case 'enum':
        return tokenTypes.indexOf('enum');
      case 'enum_constant':
        return tokenTypes.indexOf('enumMember');
      case 'typedef':
        return tokenTypes.indexOf('type');
      case 'module':
        return tokenTypes.indexOf('namespace');
      case 'import':
        return tokenTypes.indexOf('namespace');
      case 'inherit':
        return tokenTypes.indexOf('class');
      case 'include':
        return tokenTypes.indexOf('namespace');
      default:
        return -1;
    }
  };

  const getModifiers = (sym: PikeSymbol, tokenType: number): number => {
    if (tokenType < 0) return 0;
    const hasModifier = (mod: string) => sym.modifiers && sym.modifiers.includes(mod);
    let mods = declarationBit;
    if (hasModifier('static')) mods |= staticBit;
    if (hasModifier('deprecated')) mods |= deprecatedBit;
    if (sym.kind === 'constant' || sym.kind === 'enum_constant') mods |= readonlyBit;
    return mods;
  };

  // --- Fast path: token-based matching when bridge tokens are available ---
  if (tokens) {
    let symbolIndex = 0;
    for (const token of tokens) {
      // KB-1262: Check cancellation periodically
      symbolIndex++;
      if (
        cancellationToken &&
        symbolIndex % 200 === 0 &&
        cancellationToken.isCancellationRequested
      ) {
        break;
      }

      const syms = symbolMap.get(token.text);
      if (!syms) continue;

      // Only match identifier-like tokens (not comments, strings, operators).
      // Heuristic: must start with a letter/underscore and contain only word chars.
      if (!/^\w/.test(token.text)) continue;

      const lineNum = token.line - 1;
      const charPos = token.character;
      if (lineNum < 0 || charPos < 0) continue;

      if (isIgnoredPosition(lineNum, charPos)) continue;

      for (const sym of syms) {
        const tokenType = getTokenType(sym.kind);
        if (tokenType < 0) continue;
        const isDeclaration = sym.position && sym.position.line - 1 === lineNum;
        builder.push(
          lineNum,
          charPos,
          token.text.length,
          tokenType,
          isDeclaration ? getModifiers(sym, tokenType) : 0
        );
      }
    }
  } else {
    // --- Fallback: regex scan per symbol (no bridge available) ---
    let symbolIndex = 0;
    for (const sym of cached.symbols) {
      if (!sym.name) continue;

      symbolIndex++;
      if (
        cancellationToken &&
        symbolIndex % 10 === 0 &&
        cancellationToken.isCancellationRequested
      ) {
        break;
      }

      const tokenType = getTokenType(sym.kind);
      if (tokenType < 0) continue;
      const declModifiers = getModifiers(sym, tokenType);

      // KB-1262: Wrap regex construction and matching in try-catch per symbol
      try {
        const escaped = sym.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const symbolRegex = new RegExp(`\\b${escaped}\\b`, 'g');
        const declLine = sym.position ? sym.position.line - 1 : -1;
        const searchRadius = 50;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];
          if (!line) continue;

          if (declLine >= 0 && Math.abs(lineNum - declLine) > searchRadius) {
            continue;
          }

          symbolRegex.lastIndex = 0;
          let match = symbolRegex.exec(line);
          while (match !== null) {
            const matchIndex = match.index;

            if (!isIgnoredPosition(lineNum, matchIndex)) {
              const isDeclaration = sym.position && sym.position.line - 1 === lineNum;
              builder.push(
                lineNum,
                matchIndex,
                sym.name.length,
                tokenType,
                isDeclaration ? declModifiers : 0
              );
            }

            match = symbolRegex.exec(line);
          }
        }
      } catch (err) {
        // KB-1262: Skip symbols with malformed names during parse-under-edit
        log.debug('Symbol regex failed (likely parse-under-edit)', {
          uri,
          symbolName: sym.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
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
