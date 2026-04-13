/**
 * Semantic Diagnostics Analyzer
 *
 * Provides semantic analysis beyond syntax-only diagnostics:
 * - Undefined variable/function detection
 * - Basic type mismatch warnings (delegated to semantic-type-analysis.ts)
 * - Missing required callbacks (delegated to semantic-type-analysis.ts)
 *
 * Issue #1196: Add semantic analysis beyond syntax-only
 * Issue #1289: Split for 500-line limit
 */

import type { Diagnostic, Range } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol, PikeMethod, IntrospectionResult, PikeToken } from '@pike-lsp/pike-bridge';
import { isRoxenModule } from '../roxen/index.js';
import { isPikeIdentifierStart, isPikeIdentifierChar } from '../utils/pike-identifier.js';

export interface SemanticAnalysisResult {
  diagnostics: Diagnostic[];
  stats: {
    undefinedSymbols: number;
    typeMismatches: number;
    missingCallbacks: number;
  };
}

export interface SemanticAnalyzerOptions {
  maxProblems: number;
  enableUndefinedDetection: boolean;
  enableTypeMismatch: boolean;
  enableMissingCallbacks: boolean;
}

export interface UnresolvedImportCandidate {
  modulePath: string;
  importKind: 'import' | 'inherit';
  score: number;
}

export interface UnresolvedSymbolDiagnosticData {
  kind: 'unresolved-symbol';
  symbol: string;
  importCandidates: UnresolvedImportCandidate[];
}

const UNRESOLVED_SYMBOL_DIAGNOSTIC_CODE = 'undefined-symbol.unresolved-import';

const DEFAULT_OPTIONS: SemanticAnalyzerOptions = {
  maxProblems: 100,
  enableUndefinedDetection: true,
  enableTypeMismatch: true,
  enableMissingCallbacks: true,
};

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

// Pre-compiled regex to skip numeric tokens in undefined-symbol analysis
const NUMERIC_TEXT_REGEX = /^\d+$/;

// Import from semantic-type-analysis for local use and re-export
import {
  isSemanticAnalysisEnabled,
  deduplicateDiagnostics,
  analyzeTypeMismatches,
  analyzeMissingRoxenCallbacks,
} from './semantic-type-analysis.js';

// Re-export for backward compatibility
export {
  isSemanticAnalysisEnabled,
  deduplicateDiagnostics,
  analyzeTypeMismatches,
  analyzeMissingRoxenCallbacks,
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

  const definedSymbols = buildDefinedSymbolSet(symbols, introspection);
  const isRoxenMod = isRoxenModule(text, symbols);

  if (opts.enableUndefinedDetection && tokens && tokens.length > 0) {
    const undefinedDiags = analyzeUndefinedSymbols(
      tokens,
      definedSymbols,
      symbols,
      opts.maxProblems - diagnostics.length
    );
    diagnostics.push(...undefinedDiags);
    stats.undefinedSymbols = undefinedDiags.length;
  }

  if (opts.enableTypeMismatch && introspection && introspection.variables && tokens) {
    const typeDiags = analyzeTypeMismatches(
      introspection,
      tokens,
      opts.maxProblems - diagnostics.length
    );
    diagnostics.push(...typeDiags);
    stats.typeMismatches = typeDiags.length;
  }

  if (opts.enableMissingCallbacks && isRoxenMod) {
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

function analyzeUndefinedSymbols(
  tokens: PikeToken[],
  definedSymbols: Set<string>,
  symbols: PikeSymbol[],
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

  const functionLocalVars = extractFunctionLocalVars(symbols);

  for (let i = 0; i < tokens.length && diagnostics.length < maxDiagnostics; i++) {
    const token = tokens[i];
    if (!token) continue;

    const { text, line, character } = token;

    if (!text || !isPikeIdentifier(text)) {
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

    if (NUMERIC_TEXT_REGEX.test(text)) {
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
      code: UNRESOLVED_SYMBOL_DIAGNOSTIC_CODE,
      data: {
        kind: 'unresolved-symbol',
        symbol: text,
        importCandidates: [],
      } satisfies UnresolvedSymbolDiagnosticData,
    });
  }

  return diagnostics;
}

function extractFunctionLocalVars(symbols: PikeSymbol[]): Set<string> {
  const localVars = new Set<string>();

  for (const sym of symbols) {
    if (sym.kind === 'method' && 'argNames' in sym) {
      const method = sym as PikeMethod;
      for (const name of method.argNames) {
        if (name && !PIKE_KEYWORDS.has(name)) {
          localVars.add(name);
        }
      }
    }
    // Also add variables declared in scope
    if (sym.kind === 'variable' && sym.name && !PIKE_KEYWORDS.has(sym.name)) {
      localVars.add(sym.name);
    }
    // Recurse into children (class methods, etc.)
    if (sym.children) {
      const childVars = extractFunctionLocalVars(sym.children);
      for (const v of childVars) {
        localVars.add(v);
      }
    }
  }

  return localVars;
}

function isPikeIdentifier(text: string): boolean {
  if (!text) return false;
  if (!isPikeIdentifierStart(text[0]!)) return false;
  for (let i = 1; i < text.length; i++) {
    if (!isPikeIdentifierChar(text[i]!)) return false;
  }
  return true;
}
