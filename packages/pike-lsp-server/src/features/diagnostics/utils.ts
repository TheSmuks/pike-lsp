/**
 * Diagnostic Conversion Utilities
 *
 * Provides functions for converting Pike diagnostics to LSP format.
 * Extracted from diagnostics.ts for maintainability (Issue #136).
 */

import type { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node.js';
import { DiagnosticTag } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol, PikeDiagnostic } from '@pike-lsp/pike-bridge';
import { PatternHelpers } from '../../utils/regex-patterns.js';

/**
 * Extract deprecated status from parsed symbols recursively.
 * Pike parser already extracts @deprecated into documentation.deprecated field.
 * This promotes that to a top-level deprecated boolean for easier access.
 *
 * @param symbols - Parse symbols to annotate
 * @returns Symbols with deprecated field set where applicable
 */
export function extractDeprecatedFromSymbols(symbols: PikeSymbol[]): PikeSymbol[] {
  function processSymbol(sym: PikeSymbol): PikeSymbol {
    let result = sym;

    // Check if Pike parser already extracted @deprecated into documentation
    if (sym.documentation?.deprecated) {
      result = { ...sym, deprecated: true };
    }

    // Recursively process children (for class members)
    if (sym.children && sym.children.length > 0) {
      const processedChildren = sym.children.map(child => processSymbol(child));
      result = { ...result, children: processedChildren };
    }

    return result;
  }

  return symbols.map(processSymbol);
}

/**
 * Convert Pike severity to LSP severity
 */
export function convertSeverity(severity: string): DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return 1; // DiagnosticSeverity.Error
    case 'warning':
      return 2; // DiagnosticSeverity.Warning
    case 'info':
      return 3; // DiagnosticSeverity.Information
    default:
      return 1; // DiagnosticSeverity.Error
  }
}

/**
 * Convert Pike diagnostic to LSP diagnostic
 *
 * Adds Diagnostic.code and Diagnostic.tags:
 * - code: Error code identifier (e.g., "uninitialized-var", "syntax-error")
 * - tags: DiagnosticTag.Deprecated for deprecated symbol usage
 *
 * PERF-420: Optimized to accept pre-split lines instead of re-splitting document text
 * for each diagnostic - significant improvement for large files with many diagnostics.
 */
export function convertDiagnostic(
  pikeDiag: PikeDiagnostic,
  document: TextDocument,
  options?: { deprecated?: boolean; code?: string },
  linesArg?: string[] // PERF-420: Optional pre-split lines for performance
): Diagnostic {
  const line = Math.max(0, (pikeDiag.position.line ?? 1) - 1);
  const lineNumber = pikeDiag.position.line ?? line + 1;
  const columnNumber = pikeDiag.position.column ?? 1;

  // PERF-420: Use pre-split lines if provided, otherwise split once
  let lineText: string;
  let lines: string[];
  if (linesArg) {
    lines = linesArg;
    lineText = linesArg[line] ?? '';
  } else {
    const text = document.getText();
    lines = text.split('\n');
    lineText = lines[line] ?? '';
  }

  // Find meaningful range within the line (skip whitespace and comments)
  let startChar = pikeDiag.position.column ? pikeDiag.position.column - 1 : 0;
  let endChar = lineText.length;

  // If no specific column, find the first non-whitespace character
  if (!pikeDiag.position.column) {
    const trimmedStart = lineText.search(/\S/);
    if (trimmedStart >= 0) {
      startChar = trimmedStart;
    }
  }

  // Check if the line is a comment - if so, try to find the actual error line
  const trimmedLine = lineText.trim();
  if (PatternHelpers.isCommentLine(trimmedLine)) {
    // This line is a comment, look for the next non-comment line for highlighting
    // Or just use a minimal range to avoid confusing the user
    for (let i = line + 1; i < lines.length && i < line + 5; i++) {
      const nextLine = lines[i]?.trim() ?? '';
      if (nextLine && PatternHelpers.isNotCommentLine(nextLine)) {
        // Found a code line, but don't change the position - just use minimal highlight
        break;
      }
    }
    // For comment lines, only highlight a small portion (first 10 chars after whitespace)
    endChar = Math.min(startChar + 10, lineText.length);
  }

  // Ensure endChar is reasonable (highlight at least 1 char, at most the line length)
  if (endChar <= startChar) {
    endChar = Math.min(startChar + Math.max(1, lineText.trim().length), lineText.length);
  }

  // Build diagnostic
  const diagnostic: Diagnostic = {
    severity: convertSeverity(pikeDiag.severity),
    range: {
      start: { line, character: startChar },
      end: { line, character: endChar },
    },
    message: pikeDiag.message,
    source: 'pike',
  };

  if (
    diagnostic.severity === 1 &&
    typeof diagnostic.message === 'string' &&
    !/\bline\s+\d+\s*:\s*\d+/i.test(diagnostic.message) &&
    !/^\[Line\s+\d+:\d+\]/.test(diagnostic.message)
  ) {
    diagnostic.message = `[Line ${lineNumber}:${columnNumber}] ${diagnostic.message}`;
  }

  // Add diagnostic code if provided
  if (options?.code) {
    diagnostic.code = options.code;
  } else {
    // Infer code from message
    const msg = pikeDiag.message.toLowerCase();
    if (msg.includes('uninitialized') || msg.includes('used before')) {
      diagnostic.code = 'uninitialized-var';
    } else if (
      msg.includes('syntax') ||
      msg.includes('parse') ||
      msg.includes('unexpected token') ||
      msg.includes('bracket mismatch') ||
      msg.includes('missing )') ||
      msg.includes('expected') ||
      msg.includes('incomplete expression')
    ) {
      diagnostic.code = 'syntax-error';
    } else if (
      msg.includes('unknown identifier') ||
      msg.includes('unknown symbol') ||
      msg.includes('undefined identifier')
    ) {
      diagnostic.code = 'unknown-symbol';
    } else if (msg.includes('type') || msg.includes('mismatch')) {
      diagnostic.code = 'type-mismatch';
    }
  }

  // Add tags for deprecated symbols
  if (options?.deprecated) {
    diagnostic.tags = [DiagnosticTag.Deprecated];
  }

  return diagnostic;
}

/**
 * Check if a diagnostic message relates to a deprecated symbol.
 *
 * @param message - The diagnostic message to check
 * @param introspectSymbols - Symbols from introspection data
 * @returns true if the message mentions a deprecated symbol
 */
export function isDeprecatedSymbolDiagnostic(
  message: string,
  introspectSymbols: readonly { name: string; deprecated?: boolean | number }[]
): boolean {
  const deprecatedNames = new Set<string>();
  for (const sym of introspectSymbols) {
    if (sym.deprecated === true || sym.deprecated === 1) {
      deprecatedNames.add(sym.name);
    }
  }

  for (const name of deprecatedNames) {
    if (message.includes(name)) {
      return true;
    }
  }

  return false;
}
