/**
 * Semantic Type Analysis
 *
 * Type mismatch detection, Roxen callback validation, and
 * diagnostic deduplication utilities.
 *
 * Extracted from semantic-analyzer.ts for maintainability (Issue #1289).
 */

import type { Diagnostic } from 'vscode-languageserver/node.js';
import type { PikeSymbol, IntrospectionResult } from '@pike-lsp/pike-bridge';

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
 */
export function analyzeTypeMismatches(
  introspection: IntrospectionResult,
  lines: string[],
  maxDiagnostics: number
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const variableTypes = new Map<string, string>();

  for (const v of introspection.variables || []) {
    if (v.name && v.type) {
      const typeStr = typeToString(v.type);
      variableTypes.set(v.name, typeStr);
    }
  }

  for (let i = 0; i < lines.length && diagnostics.length < maxDiagnostics; i++) {
    const lineText = lines[i];
    if (!lineText) continue;
    const assignmentMatch = lineText.match(/(\w+)\s*=\s*(.+?);?\s*$/);
    if (assignmentMatch) {
      const varName = assignmentMatch[1];
      if (!varName) continue;
      const value = assignmentMatch[2]?.trim();
      if (!value) continue;

      const declaredType = variableTypes.get(varName);
      if (declaredType) {
        const inferredType = inferTypeFromLiteral(value);
        if (inferredType && !isTypeCompatible(declaredType, inferredType)) {
          diagnostics.push({
            severity: 2,
            range: {
              start: { line: i, character: lineText.indexOf(value) },
              end: { line: i, character: lineText.indexOf(value) + value.length },
            },
            message: `Type mismatch: '${varName}' is declared as ${declaredType} but assigned ${inferredType}`,
            source: 'pike-semantic',
            code: 'type-mismatch',
          });
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Convert a Pike type representation to a string.
 */
function typeToString(type: unknown): string {
  if (!type || typeof type !== 'object') {
    return 'mixed';
  }

  const t = type as { kind?: string; name?: string };
  if (t.kind) {
    if (t.kind === 'name' && t.name) {
      return t.name;
    }
    return t.kind;
  }
  return 'mixed';
}

/**
 * Infer a Pike type from a literal value string.
 */
function inferTypeFromLiteral(value: string): string | null {
  const trimmed = value.trim();

  if (/^".*"$/.test(trimmed) || /^'.*'$/.test(trimmed)) {
    return 'string';
  }

  if (/^-?\d+$/.test(trimmed)) {
    return 'int';
  }

  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return 'float';
  }

  if (/^\{.*\}$/.test(trimmed)) {
    return 'array';
  }

  if (/^\[.*\]$/.test(trimmed)) {
    return 'mapping';
  }

  return null;
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
 */
export function isSemanticAnalysisEnabled(settings: Record<string, unknown>): boolean {
  return settings['enableSemanticAnalysis'] !== false;
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
