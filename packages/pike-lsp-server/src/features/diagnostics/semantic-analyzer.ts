/**
 * Semantic Diagnostics Analyzer
 *
 * Provides semantic analysis beyond syntax-only diagnostics:
 * - Undefined variable/function detection
 * - Basic type mismatch warnings
 * - Missing required callbacks (Roxen modules)
 *
 * Issue #1196: Add semantic analysis beyond syntax-only
 */

import type { Diagnostic, Range } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol, IntrospectionResult, PikeToken } from '@pike-lsp/pike-bridge';

export interface SemanticAnalysisResult {
  diagnostics: Diagnostic[];
  stats: {
    undefinedSymbols: number;
    typeMismatches: number;
    missingCallbacks: number;
  };
}

interface UnresolvedSymbolDiagnosticData {
  kind: 'unresolved-symbol';
  symbolName: string;
}

export interface SemanticAnalyzerOptions {
  maxProblems: number;
  enableUndefinedDetection: boolean;
  enableTypeMismatch: boolean;
  enableMissingCallbacks: boolean;
}

const DEFAULT_OPTIONS: SemanticAnalyzerOptions = {
  maxProblems: 100,
  enableUndefinedDetection: true,
  enableTypeMismatch: true,
  enableMissingCallbacks: true,
};

const ROXEN_REQUIRED_CALLBACKS = ['start', 'stop'];

const PIKE_BUILTIN_SYMBOLS = new Set([
  'write',
  'werror',
  'wlog',
  'wflush',
  'exit',
  'error',
  'throw',
  'catch',
  'gauge',
  'sscanf',
  'sprintf',
  'sizeof',
  'copy_value',
  'random',
  'reverse',
  'search',
  'sort',
  'uniq',
  'zero_type',
  'm_delete',
  'mkmapping',
  'map',
  'filter',
  'enumerate',
  'replace',
  'upper_case',
  'lower_case',
  'String',
  'Array',
  'Mapping',
  'Multiset',
  'Math',
  'Crypto',
  'Stdio',
  'Thread',
  'Process',
  'Files',
  'System',
  'Time',
  'Calendar',
  'Protocols',
  'HTTP',
  'SSL',
  'Tools',
]);

const PIKE_KEYWORDS = new Set([
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'return',
  'inherit',
  'import',
  'class',
  'constant',
  'final',
  'function',
  'int',
  'float',
  'string',
  'mapping',
  'array',
  'multiset',
  'object',
  'program',
  'mixed',
  'void',
  'typedef',
  'enum',
  'static',
  'public',
  'private',
  'protected',
  'local',
  'global',
  'this',
  'this_object',
  'this_program',
  '__pragma',
  'variant',
  'deprecated',
  'lambda',
  'typeof',
  '_typeof',
]);

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

export function analyzeSemantics(
  document: TextDocument,
  symbols: PikeSymbol[],
  introspection: IntrospectionResult | undefined,
  tokens: PikeToken[] | undefined,
  options: Partial<SemanticAnalyzerOptions> = {}
): SemanticAnalysisResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const diagnostics: Diagnostic[] = [];
  const stats = {
    undefinedSymbols: 0,
    typeMismatches: 0,
    missingCallbacks: 0,
  };

  const text = document.getText();
  const lines = text.split('\n');

  const definedSymbols = buildDefinedSymbolSet(symbols, introspection);
  const isRoxenModule = detectRoxenModule(text, symbols);

  if (opts.enableUndefinedDetection && tokens && tokens.length > 0) {
    const undefinedDiags = analyzeUndefinedSymbols(
      tokens,
      definedSymbols,
      symbols,
      lines,
      opts.maxProblems - diagnostics.length
    );
    diagnostics.push(...undefinedDiags);
    stats.undefinedSymbols = undefinedDiags.length;
  }

  if (opts.enableTypeMismatch && introspection && introspection.variables) {
    const typeDiags = analyzeTypeMismatches(
      introspection,
      lines,
      opts.maxProblems - diagnostics.length
    );
    diagnostics.push(...typeDiags);
    stats.typeMismatches = typeDiags.length;
  }

  if (opts.enableMissingCallbacks && isRoxenModule) {
    const callbackDiags = analyzeMissingRoxenCallbacks(
      symbols,
      opts.maxProblems - diagnostics.length
    );
    diagnostics.push(...callbackDiags);
    stats.missingCallbacks = callbackDiags.length;
  }

  return { diagnostics, stats };
}

function buildDefinedSymbolSet(
  symbols: PikeSymbol[],
  introspection: IntrospectionResult | undefined
): Set<string> {
  const defined = new Set<string>();

  for (const sym of symbols) {
    if (sym.name) {
      defined.add(sym.name);
      if (sym.children) {
        for (const child of sym.children) {
          if (child.name) {
            defined.add(child.name);
          }
        }
      }
    }
  }

  if (introspection) {
    for (const sym of introspection.symbols || []) {
      if (sym.name) {
        defined.add(sym.name);
      }
    }
    for (const fn of introspection.functions || []) {
      if (fn.name) {
        defined.add(fn.name);
      }
    }
    for (const v of introspection.variables || []) {
      if (v.name) {
        defined.add(v.name);
      }
    }
    for (const cls of introspection.classes || []) {
      if (cls.name) {
        defined.add(cls.name);
      }
    }
  }

  for (const builtin of PIKE_BUILTIN_SYMBOLS) {
    defined.add(builtin);
  }

  return defined;
}

function detectRoxenModule(text: string, symbols: PikeSymbol[]): boolean {
  const roxenPatterns = [
    /inherit\s+["']?roxen/,
    /inherit\s+["']?Roxen/,
    /MODULE_/,
    /ID_(DEFINED|RUNTIME)/,
    /VERSION_/,
  ];

  for (const pattern of roxenPatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  for (const sym of symbols) {
    if (sym.name && /^register_/.test(sym.name)) {
      return true;
    }
  }

  return false;
}

function analyzeUndefinedSymbols(
  tokens: PikeToken[],
  definedSymbols: Set<string>,
  symbols: PikeSymbol[],
  lines: string[],
  maxDiagnostics: number
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const reported = new Set<string>();

  const classNames = new Set<string>();
  for (const sym of symbols) {
    if (sym.kind === 'class' && sym.name) {
      classNames.add(sym.name);
    }
  }

  const functionLocalVars = extractFunctionLocalVars(lines);

  for (let i = 0; i < tokens.length && diagnostics.length < maxDiagnostics; i++) {
    const token = tokens[i];
    if (!token) continue;

    const { text, line, character } = token;

    if (!text || !isIdentifier(text)) {
      continue;
    }

    if (PIKE_KEYWORDS.has(text)) {
      continue;
    }

    if (definedSymbols.has(text)) {
      continue;
    }

    if (functionLocalVars.has(text)) {
      continue;
    }

    if (/^\d+$/.test(text)) {
      continue;
    }

    const prevToken = i > 0 ? tokens[i - 1] : null;
    const nextToken = i < tokens.length - 1 ? tokens[i + 1] : null;

    if (prevToken && (prevToken.text === '->' || prevToken.text === '.')) {
      continue;
    }

    if (nextToken && nextToken.text === '::') {
      continue;
    }

    if (prevToken && classNames.has(prevToken.text || '')) {
      continue;
    }

    const key = `${line}:${character}:${text}`;
    if (reported.has(key)) {
      continue;
    }
    reported.add(key);

    const range: Range = {
      start: {
        line: Math.max(0, (line || 1) - 1),
        character: Math.max(0, character || 0),
      },
      end: {
        line: Math.max(0, (line || 1) - 1),
        character: Math.max(0, (character || 0) + text.length),
      },
    };

    diagnostics.push({
      severity: 2,
      range,
      message: `Undefined symbol: '${text}'`,
      source: 'pike-semantic',
      code: 'undefined-symbol',
      data: {
        kind: 'unresolved-symbol',
        symbolName: text,
      } satisfies UnresolvedSymbolDiagnosticData,
    });
  }

  return diagnostics;
}

function extractFunctionLocalVars(lines: string[]): Set<string> {
  const localVars = new Set<string>();
  const funcPattern = /(?:function\s+)?(\w+)\s*\(([^)]*)\)/g;
  const paramPattern = /(?:\w+\s+)?(\$?\w+)\s*[,)]/g;

  for (const line of lines) {
    let match;
    while ((match = funcPattern.exec(line)) !== null) {
      const params = match[2];
      let paramMatch;
      while ((paramMatch = paramPattern.exec(params + ')')) !== null) {
        const paramName = paramMatch[1];
        if (paramName && !PIKE_KEYWORDS.has(paramName)) {
          localVars.add(paramName);
        }
      }
    }
  }

  return localVars;
}

function isIdentifier(text: string): boolean {
  return /^[a-zA-Z_]\w*$/.test(text);
}

function analyzeTypeMismatches(
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

function analyzeMissingRoxenCallbacks(symbols: PikeSymbol[], maxDiagnostics: number): Diagnostic[] {
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

export function isSemanticAnalysisEnabled(settings: Record<string, unknown>): boolean {
  return settings['enableSemanticAnalysis'] !== false;
}

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
