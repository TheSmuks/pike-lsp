/**
 * Semantic Type Analysis
 *
 * Type mismatch detection, Roxen callback validation, and
 * diagnostic deduplication utilities.
 *
 * Extracted from semantic-analyzer.ts for maintainability (Issue #1289).
 */

import type { Diagnostic } from 'vscode-languageserver/node.js';
import type { PikeSymbol, IntrospectionResult, PikeToken } from '@pike-lsp/pike-bridge';
import type { PikeSettings } from '../../core/types.js';
import { isPikeIdentifierStart } from '../utils/pike-identifier.js';

const ROXEN_REQUIRED_CALLBACKS = ['start', 'stop'];

const TYPE_COMPATIBILITY: Record<string, string[]> = {
  int: ['float', 'mixed'],
  float: ['int', 'mixed'],
  string: ['mixed'],
  array: ['mixed'],
  mapping: ['mixed'],
  multiset: ['mixed'],
  object: ['mixed'],
  program: ['mixed'],
  function: ['mixed'],
  mixed: [],
  void: [],
};

/**
 * Detect type mismatches between declared variable types and assigned values.
 *
 * Uses bridge introspection variables for declared types and bridge tokens
 * for assignment detection — no source-line regex.
 */
export function analyzeTypeMismatches(
  introspection: IntrospectionResult,
  tokens: PikeToken[],
  maxDiagnostics: number
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const variableTypes = new Map<string, string>();

  // Build declared-type map from bridge introspection
  for (const v of introspection.variables || []) {
    if (v.name && v.type) {
      variableTypes.set(v.name, typeToString(v.type));
    }
  }

  if (variableTypes.size === 0) return diagnostics;

  // Scan tokens for assignment expressions
  for (let i = 0; i < tokens.length && diagnostics.length < maxDiagnostics; i++) {
    const token = tokens[i];
    if (!token) continue;

    // Only consider identifier-like tokens as potential LHS
    const firstChar = token.text?.[0];
    if (!firstChar || !isPikeIdentifierStart(firstChar)) continue;

    const next = tokens[i + 1];
    if (!next || next.text !== '=') continue;

    // Reject '==' by checking the token after '='
    const afterEq = tokens[i + 2];
    if (afterEq && afterEq.text === '=') continue;

    // Also reject '!=' — the '=' here is part of a comparison
    if (i > 0 && tokens[i - 1]!.text === '!') continue;

    const varName = token.text!;
    const declaredType = variableTypes.get(varName);
    if (!declaredType) continue;

    // Collect RHS tokens until ';' or a line break > 1 away
    const rvalueTokens: PikeToken[] = [];
    const valueLine = token.line;
    for (let j = i + 2; j < tokens.length; j++) {
      const rt = tokens[j];
      if (!rt) break;
      if (rt.text === ';') break;
      if (rt.line !== valueLine && rt.line !== valueLine + 1) break;
      rvalueTokens.push(rt);
    }

    if (rvalueTokens.length === 0) continue;

    const inferredType = inferTypeFromTokens(rvalueTokens);
    if (inferredType && !isTypeCompatible(declaredType, inferredType)) {
      const firstRvalue = rvalueTokens[0]!;
      const lastRvalue = rvalueTokens[rvalueTokens.length - 1]!;
      diagnostics.push({
        severity: 2,
        range: {
          start: { line: firstRvalue.line, character: firstRvalue.character },
          end: {
            line: lastRvalue.line,
            character: lastRvalue.character + (lastRvalue.text?.length ?? 0),
          },
        },
        message: `Type mismatch: '${varName}' is declared as ${declaredType} but assigned ${inferredType}`,
        source: 'pike-semantic',
        code: 'type-mismatch',
      });
    }
  }

  return diagnostics;
}

/**
 * Convert a Pike type representation to a string.
 */
/**
 * Convert a Pike type representation to a string.
 */
function typeToString(type: unknown): string {
  if (typeof type === 'string') return type;
  if (!type || typeof type !== 'object') return 'mixed';

  const rec = type as Record<string, unknown>;
  const kind = rec['kind'];
  if (typeof kind === 'string') {
    const name = rec['name'];
    if (kind === 'name' && typeof name === 'string' && name.length > 0) {
      return name;
    }
    return kind;
  }
  return 'mixed';
}

/**
 * Infer a Pike type from the first RHS token.
 * Uses token text characteristics directly — no regex on joined strings.
 */
function inferTypeFromTokens(rvalueTokens: PikeToken[]): string | null {
  const first = rvalueTokens[0];
  if (!first || !first.text) return null;

  const text = first.text;
  const firstChar = text[0];

  // String literals: "..." or '...'
  if (firstChar === '"' || firstChar === "'") return 'string';

  // Array literal: ({...})
  if (firstChar === '(' && text.length > 1 && text[1] === '{') return 'array';
  if (firstChar === '{') return 'array';

  // Mapping literal: ([...])
  if (firstChar === '(' && text.length > 1 && text[1] === '[') return 'mapping';
  if (firstChar === '[') return 'mapping';

  // Multiset literal: (< ... >)
  if (firstChar === '(' && text.length > 1 && text[1] === '<') return 'multiset';

  // Numeric: must be purely digits (possibly with leading minus/plus and decimal)
  if (isNumericLiteral(text)) {
    return text.includes('.') ? 'float' : 'int';
  }

  // Callable / object construction — not a literal we can classify
  return null;
}

/**
 * Check if token text looks like a numeric literal (no regex).
 */
function isNumericLiteral(text: string): boolean {
  if (text.length === 0) return false;
  let i = 0;
  if (text[i] === '-' || text[i] === '+') i++;
  if (i >= text.length) return false;
  let hasDot = false;
  let hasDigit = false;
  for (; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 46) {
      // '.'
      if (hasDot) return false;
      hasDot = true;
    } else if (ch >= 48 && ch <= 57) {
      // '0'-'9'
      hasDigit = true;
    } else {
      return false;
    }
  }
  return hasDigit;
}

/**
 * Check if an assigned type is compatible with the declared type.
 */
function isTypeCompatible(declared: string, assigned: string): boolean {
  if (declared === assigned) {
    return true;
  }

  if (declared === 'mixed' || assigned === 'mixed') {
    return true;
  }

  const compatible = TYPE_COMPATIBILITY[declared];
  if (compatible && compatible.includes(assigned)) {
    return true;
  }

  return false;
}

/**
 * Check for missing required Roxen module callbacks.
 */
export function analyzeMissingRoxenCallbacks(
  symbols: PikeSymbol[],
  maxDiagnostics: number
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const definedMethods = new Set<string>();
  for (const sym of symbols) {
    if (sym.kind === 'method' && sym.name) {
      definedMethods.add(sym.name);
    }
  }

  for (const callback of ROXEN_REQUIRED_CALLBACKS) {
    if (diagnostics.length >= maxDiagnostics) {
      break;
    }

    if (!definedMethods.has(callback)) {
      diagnostics.push({
        severity: 3,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
        message: `Roxen module missing required callback: '${callback}()'. Consider implementing this callback.`,
        source: 'pike-semantic',
        code: 'missing-roxen-callback',
      });
    }
  }

  return diagnostics;
}

/**
 * Check if semantic analysis is enabled in settings.
 * Always returns true since enableSemanticAnalysis is not a typed setting.
 */
export function isSemanticAnalysisEnabled(_settings: PikeSettings): boolean {
  return true;
}

/**
 * Deduplicate new diagnostics against existing ones.
 * Filters out new diagnostics that overlap with existing diagnostics.
 */
export function deduplicateDiagnostics(
  existing: Diagnostic[],
  newDiags: Diagnostic[]
): Diagnostic[] {
  const existingKeys = new Set(
    existing.map(d => `${d.range.start.line}:${d.range.start.character}:${d.message}`)
  );

  return newDiags.filter(d => {
    const key = `${d.range.start.line}:${d.range.start.character}:${d.message}`;
    return !existingKeys.has(key);
  });
}
