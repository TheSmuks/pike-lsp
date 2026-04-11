/**
 * Roxen Configuration File Support
 *
 * Provides parsing, validation, and completion for Roxen module configuration files.
 * Roxen modules use defvar() calls to define configuration variables with TYPE_* constants.
 *
 * ADR-001 compliant: uses PikeSymbol data (from bridge parse) and PikeToken scanning
 * (from bridge tokenize) instead of regex for all Pike code analysis.
 */

import type { CompletionItem, Diagnostic, Position } from 'vscode-languageserver';
import { CompletionItemKind, DiagnosticSeverity } from 'vscode-languageserver/node.js';
import type { PikeSymbol, PikeToken, RoxenModuleInfo } from '@pike-lsp/pike-bridge';
import { TYPE_CONSTANTS, MODULE_CONSTANTS, VAR_FLAGS } from './constants.js';
import {
  extractDefvarsFromTokens,
  extractDefvarsFromCode,
  parseFlagsValue,
} from './defvar-scanner.js';

/**
 * Parsed defvar declaration
 */
export interface DefvarDeclaration {
  name: string;
  displayName: string;
  type: string;
  documentation: string;
  flags: number;
  line: number;
  column: number;
}

/**
 * Parsed Roxen module configuration
 */
export interface RoxenConfig {
  isInheritModule: boolean;
  moduleType: string | null;
  defvars: DefvarDeclaration[];
  errors: ConfigError[];
}

/**
 * Configuration validation error
 */
export interface ConfigError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Optional inputs from Pike bridge for parser-backed analysis.
 *
 * Priority order for module_type and inherit detection:
 * 1. roxenInfo (bridge.roxenDetect()) — most authoritative, uses Parser.Pike
 * 2. symbols (bridge parse) — parser-backed symbol table
 * 3. String scanning fallback — last resort
 *
 * Tokens enable defvar extraction via token walking.
 */
export interface BridgeParseInput {
  roxenInfo?: RoxenModuleInfo;
  symbols?: PikeSymbol[];
  tokens?: PikeToken[];
}

/**
 * Strip surrounding quotes (single or double) from a string.
 */
function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0]!;
    const last = s[s.length - 1]!;
    if ((first === '"' || first === "'") && first === last) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/**
 * Check if a PikeSymbol represents an inherit of "module" or "roxen".
 */
function isInheritModuleSymbol(sym: PikeSymbol): boolean {
  if (sym.kind !== 'inherit') return false;
  const raw = sym.classname ?? sym.name ?? '';
  const name = stripQuotes(raw).toLowerCase();
  return name === 'module' || name === 'roxen';
}

/**
 * Extract module_type value from a constant symbol named "module_type".
 */
function getModuleTypeFromConstant(sym: PikeSymbol): string | null {
  if (sym.kind !== 'constant' || sym.name !== 'module_type') return null;
  const typeName = sym.type;
  if (typeName && typeof typeName === 'object' && 'name' in typeName) {
    const name = (typeName as { name: string }).name;
    if (name.startsWith('MODULE_')) return name;
  }
  return null;
}

/**
 * Detect inherit of "module" or "roxen" from symbols (bridge parse).
 * Falls back to simple string scanning when symbols unavailable.
 */
function detectInheritModule(code: string, symbols?: PikeSymbol[]): boolean {
  if (symbols && symbols.length > 0) {
    return symbols.some(isInheritModuleSymbol);
  }
  // Fallback: simple string search (no regex)
  const lines = code.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('inherit ')) {
      const arg = trimmed.slice(8).trim();
      const semiIdx = arg.indexOf(';');
      const noSemi = semiIdx >= 0 ? arg.slice(0, semiIdx).trim() : arg;
      const unquoted = stripQuotes(noSemi);
      if (unquoted === 'module' || unquoted === 'roxen') return true;
    }
  }
  return false;
}

/**
 * Detect module_type constant value from symbols (bridge parse).
 * Falls back to line scanning when symbols unavailable.
 */
function detectModuleType(code: string, symbols?: PikeSymbol[]): string | null {
  if (symbols && symbols.length > 0) {
    for (const sym of symbols) {
      const mt = getModuleTypeFromConstant(sym);
      if (mt) return mt;
      if (sym.children) {
        for (const child of sym.children) {
          const cmt = getModuleTypeFromConstant(child);
          if (cmt) return cmt;
        }
      }
    }
    return null;
  }
  // Fallback: scan lines for "constant [int] module_type = MODULE_*"
  const lines = code.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('constant ')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const lhs = trimmed.slice(0, eqIdx).trim();
    if (!lhs.endsWith('module_type')) continue;
    const rhsFull = trimmed.slice(eqIdx + 1).trim();
    const semiIdx = rhsFull.indexOf(';');
    const rhs = semiIdx >= 0 ? rhsFull.slice(0, semiIdx).trim() : rhsFull;
    if (rhs.startsWith('MODULE_')) return rhs;
  }
  return null;
}

/**
 * Parse Roxen configuration from code.
 *
 * When BridgeParseInput is provided, uses bridge data in priority order:
 * 1. roxenInfo (bridge.roxenDetect()) — authoritative, uses Parser.Pike
 * 2. symbols/tokens — parser-backed symbol table and token walking
 * 3. String scanning — fallback
 */
export function parseRoxenConfig(code: string, bridgeInput?: BridgeParseInput): RoxenConfig {
  const result: RoxenConfig = {
    isInheritModule: false,
    moduleType: null,
    defvars: [],
    errors: [],
  };

  // Priority 1: roxenInfo from bridge.roxenDetect()
  if (bridgeInput?.roxenInfo && bridgeInput.roxenInfo.is_roxen_module === 1) {
    const info = bridgeInput.roxenInfo;
    const inheritsModuleOrRoxen = info.inherits.some(
      (name: string) => name === 'module' || name === 'roxen'
    );
    result.isInheritModule = inheritsModuleOrRoxen;
    if (info.module_type.length > 0) {
      result.moduleType = info.module_type[0]!;
    } else {
      result.moduleType = detectModuleType(code, bridgeInput.symbols);
    }
  } else {
    // Priority 2: symbols from bridge parse, 3: string scanning
    result.isInheritModule = detectInheritModule(code, bridgeInput?.symbols);
    result.moduleType = detectModuleType(code, bridgeInput?.symbols);
  }

  // Extract defvars: prefer token-based extraction, fall back to code scanning
  if (bridgeInput?.tokens && bridgeInput.tokens.length > 0) {
    const rawDefvars = extractDefvarsFromTokens(bridgeInput.tokens);
    for (const dv of rawDefvars) {
      if (!TYPE_CONSTANTS[dv.type as keyof typeof TYPE_CONSTANTS]) {
        result.errors.push({
          line: dv.line,
          column: dv.column,
          message: `Unknown TYPE constant: ${dv.type}. Valid values are: ${Object.keys(TYPE_CONSTANTS).join(', ')}`,
          severity: 'error',
        });
      }

      result.defvars.push({
        name: dv.name,
        displayName: dv.displayName || dv.name,
        type: dv.type,
        documentation: dv.documentation,
        flags: parseFlagsValue(dv.flagsStr),
        line: dv.line,
        column: dv.column,
      });
    }
  } else {
    result.defvars = extractDefvarsFromCode(code);
    for (const dv of result.defvars) {
      if (!TYPE_CONSTANTS[dv.type as keyof typeof TYPE_CONSTANTS]) {
        result.errors.push({
          line: dv.line,
          column: dv.column,
          message: `Unknown TYPE constant: ${dv.type}. Valid values are: ${Object.keys(TYPE_CONSTANTS).join(', ')}`,
          severity: 'error',
        });
      }
    }
  }

  return result;
}

/**
 * Validate Roxen configuration and return LSP diagnostics
 */
export function validateRoxenConfig(code: string, bridgeInput?: BridgeParseInput): Diagnostic[] {
  const config = parseRoxenConfig(code, bridgeInput);
  const diagnostics: Diagnostic[] = [];

  // Convert config errors to LSP diagnostics
  for (const error of config.errors) {
    diagnostics.push({
      range: {
        start: { line: error.line, character: error.column },
        end: { line: error.line, character: error.column + 10 },
      },
      severity:
        error.severity === 'error'
          ? DiagnosticSeverity.Error
          : error.severity === 'warning'
            ? DiagnosticSeverity.Warning
            : DiagnosticSeverity.Information,
      message: error.message,
      source: 'roxen-config',
    });
  }

  // Check for module inherit without module_type
  if (config.isInheritModule && !config.moduleType) {
    diagnostics.push({
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 10 },
      },
      severity: DiagnosticSeverity.Warning,
      message: 'Roxen module inherits "module" but does not define module_type constant',
      source: 'roxen-config',
    });
  }

  return diagnostics;
}

/**
 * Get defvar snippet completions
 */
export function getDefvarCompletions(): CompletionItem[] {
  const typeChoices = Object.keys(TYPE_CONSTANTS).filter(k => k.startsWith('TYPE_'));

  return [
    {
      label: 'defvar',
      kind: CompletionItemKind.Snippet,
      detail: 'Roxen module variable definition',
      documentation: 'Define a configuration variable for a Roxen module',
      insertTextFormat: 2,
      insertText: `defvar("\${1:varname}", "\${2:Display Name}", \${3|${typeChoices.join(',')}|}, "\${4:Documentation}", \${5:0});`,
    },
  ];
}

/**
 * Check if a line ends with a typed prefix like TYPE_, MODULE_, or VAR_
 * followed by zero or more word characters. Used for completion triggers.
 */
function endsInTypedPrefix(line: string, prefix: string): boolean {
  const idx = line.lastIndexOf(prefix);
  if (idx === -1) return false;
  // The char before the prefix must be non-word (or start of string)
  if (idx > 0) {
    const prev = line.charCodeAt(idx - 1);
    const isWord =
      (prev >= 0x30 && prev <= 0x39) ||
      (prev >= 0x41 && prev <= 0x5a) ||
      (prev >= 0x61 && prev <= 0x7a) ||
      prev === 0x5f;
    if (isWord) return false;
  }
  // Everything after the prefix must be word characters
  for (let i = idx + prefix.length; i < line.length; i++) {
    const c = line.charCodeAt(i);
    const isWord =
      (c >= 0x30 && c <= 0x39) ||
      (c >= 0x41 && c <= 0x5a) ||
      (c >= 0x61 && c <= 0x7a) ||
      c === 0x5f;
    if (!isWord) return false;
  }
  return true;
}

/**
 * Get completions for Roxen configuration context
 */
export function getRoxenConfigCompletions(
  line: string,
  _position: Position
): CompletionItem[] | null {
  const trimmed = line.trimEnd();

  // defvar(...) snippet
  if (trimmed.endsWith('defvar(')) {
    return getDefvarCompletions();
  }

  // TYPE_* completions
  if (endsInTypedPrefix(trimmed, 'TYPE_')) {
    return Object.entries(TYPE_CONSTANTS).map(([name, info]) => ({
      label: name,
      kind: CompletionItemKind.Constant,
      detail: `${info.value} - ${info.description}`,
      documentation: info.description,
    }));
  }

  // MODULE_* completions
  if (endsInTypedPrefix(trimmed, 'MODULE_')) {
    return Object.entries(MODULE_CONSTANTS).map(([name, info]) => ({
      label: name,
      kind: CompletionItemKind.Constant,
      detail: `${info.value} - ${info.description}`,
      documentation: info.description,
    }));
  }

  // VAR_* completions
  if (endsInTypedPrefix(trimmed, 'VAR_')) {
    return Object.entries(VAR_FLAGS).map(([name, info]) => ({
      label: name,
      kind: CompletionItemKind.Constant,
      detail: `${info.value} - ${info.description}`,
      documentation: info.description,
    }));
  }

  return null;
}

/**
 * Check if a line is within a defvar call
 */
export function isInDefvarContext(line: string, column: number): boolean {
  const defvarIndex = line.indexOf('defvar');
  return defvarIndex >= 0 && defvarIndex < column;
}
