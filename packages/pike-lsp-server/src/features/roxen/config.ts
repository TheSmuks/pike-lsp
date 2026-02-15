/**
 * Roxen Configuration File Support
 *
 * Provides parsing, validation, and completion for Roxen module configuration files.
 * Roxen modules use defvar() calls to define configuration variables with TYPE_* constants.
 *
 * Key patterns:
 * - defvar("name", "Display Name", TYPE_*, "Documentation", flags)
 * - inherit "module" or inherit "roxen"
 * - constant module_type = MODULE_*
 */

import type { CompletionItem, Diagnostic, Position } from 'vscode-languageserver';
import { CompletionItemKind, DiagnosticSeverity } from 'vscode-languageserver/node.js';
import { TYPE_CONSTANTS, MODULE_CONSTANTS, VAR_FLAGS } from './constants.js';

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
 * Regex patterns for parsing Roxen config
 */
const PATTERNS = {
    // inherit "module" or inherit 'module'
    inheritModule: /inherit\s+["']module["']/i,
    inheritRoxen: /inherit\s+["']roxen["']/i,
    // constant module_type = MODULE_*
    moduleType: /constant\s+(?:int\s+)?module_type\s*=\s*(MODULE_\w+)/i,
    // defvar("name", "Display Name", TYPE_*, "Documentation", flags)
    // Flags can be numeric (0, 1) or named (VAR_EXPERT, VAR_EXPERT | VAR_MORE)
    defvar: /defvar\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']*)["']\s*,\s*(TYPE_\w+)\s*,\s*["']([^"']*)["']\s*,\s*([^)]+)\s*\)/gi,
    // Partial defvar for completion - simplified pattern
    defvarPartial: /defvar\s*\(\s*["']?[^"']*/,
};

/**
 * Get line number from position in code
 */
function getLineNumber(code: string, position: number): number {
    const before = code.slice(0, position);
    return before.split('\n').length - 1;
}

/**
 * Get column number from position in code
 */
function getColumnNumber(code: string, position: number): number {
    const before = code.slice(0, position);
    const lastNewline = before.lastIndexOf('\n');
    return position - lastNewline - 1;
}

/**
 * Parse Roxen configuration from code
 */
export function parseRoxenConfig(code: string): RoxenConfig {
    const result: RoxenConfig = {
        isInheritModule: false,
        moduleType: null,
        defvars: [],
        errors: [],
    };

    // Check for inherit patterns in entire code
    result.isInheritModule = PATTERNS.inheritModule.test(code) || PATTERNS.inheritRoxen.test(code);

    // Check for module_type constant
    const moduleMatch = code.match(PATTERNS.moduleType);
    if (moduleMatch && moduleMatch[1]) {
        result.moduleType = moduleMatch[1];
    }

    // Check for defvar declarations - process on full code to handle multi-line
    PATTERNS.defvar.lastIndex = 0;
    let defvarMatch;
    while ((defvarMatch = PATTERNS.defvar.exec(code)) !== null) {
        const matchStart = defvarMatch.index;
        const [, name, displayName, type, documentation, flagsStr] = defvarMatch;

        // Parse flags - handle numeric and named constants
        let flags = 0;
        const trimmedFlags = flagsStr.trim();
        if (/^\d+$/.test(trimmedFlags)) {
            flags = parseInt(trimmedFlags, 10);
        } else {
            // Handle named constants like VAR_EXPERT or VAR_EXPERT | VAR_MORE
            const flagNames = trimmedFlags.split('|').map(f => f.trim());
            for (const flagName of flagNames) {
                const flagInfo = VAR_FLAGS[flagName as keyof typeof VAR_FLAGS];
                if (flagInfo) {
                    flags |= flagInfo.value;
                }
            }
        }

        // Validate defvar components
        if (!TYPE_CONSTANTS[type as keyof typeof TYPE_CONSTANTS]) {
            const typeIndex = code.indexOf(type, matchStart);
            result.errors.push({
                line: getLineNumber(code, typeIndex),
                column: getColumnNumber(code, typeIndex),
                message: `Unknown TYPE constant: ${type}. Valid values are: ${Object.keys(TYPE_CONSTANTS).join(', ')}`,
                severity: 'error',
            });
        }

        result.defvars.push({
            name,
            displayName: displayName || name,
            type,
            documentation,
            flags,
            line: getLineNumber(code, matchStart),
            column: getColumnNumber(code, matchStart),
        });
    }

    return result;
}

/**
 * Validate Roxen configuration and return LSP diagnostics
 */
export function validateRoxenConfig(code: string): Diagnostic[] {
    const config = parseRoxenConfig(code);
    const diagnostics: Diagnostic[] = [];

    // Convert config errors to LSP diagnostics
    for (const error of config.errors) {
        diagnostics.push({
            range: {
                start: { line: error.line, character: error.column },
                end: { line: error.line, character: error.column + 10 },
            },
            severity: error.severity === 'error' ? DiagnosticSeverity.Error :
                      error.severity === 'warning' ? DiagnosticSeverity.Warning :
                      DiagnosticSeverity.Information,
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
 * Get completions for Roxen configuration context
 */
export function getRoxenConfigCompletions(
    line: string,
    _position: Position
): CompletionItem[] | null {
    // defvar(...) snippet
    if (/\bdefvar\s*\(\s*$/.test(line)) {
        return getDefvarCompletions();
    }

    // TYPE_* completions
    if (/\bTYPE_\w*$/.test(line)) {
        return Object.entries(TYPE_CONSTANTS).map(([name, info]) => ({
            label: name,
            kind: CompletionItemKind.Constant,
            detail: `${info.value} - ${info.description}`,
            documentation: info.description,
        }));
    }

    // MODULE_* completions
    if (/\bMODULE_\w*$/.test(line)) {
        return Object.entries(MODULE_CONSTANTS).map(([name, info]) => ({
            label: name,
            kind: CompletionItemKind.Constant,
            detail: `${info.value} - ${info.description}`,
            documentation: info.description,
        }));
    }

    // VAR_* completions
    if (/\bVAR_\w*$/.test(line)) {
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
    // Simple check: is "defvar" on the line and cursor is after it
    const defvarIndex = line.indexOf('defvar');
    return defvarIndex >= 0 && defvarIndex < column;
}
