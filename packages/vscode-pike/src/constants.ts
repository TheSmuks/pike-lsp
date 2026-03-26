/**
 * Configuration constants for VSCode Pike Extension.
 *
 * MAINT-004: Centralized configuration values.
 */

/**
 * Default diagnostic delay in milliseconds.
 *
 * @remarks
 * This is the fallback value when the user hasn't configured a custom delay.
 * The actual value comes from vscode configuration (pike.diagnosticDelay).
 */
export const DEFAULT_DIAGNOSTIC_DELAY = 500;

/**
 * Debug port for Node.js inspector.
 *
 * @remarks
 * Used when launching the LSP server in debug mode.
 */
export const DEBUG_PORT = 6009;

/**
 * Language IDs handled by the Pike LSP.
 *
 * @remarks
 * Must match the language IDs declared in package.json contributes.languages.
 */
export const PIKE_LANGUAGE_IDS = ['pike', 'rxml', 'rjs'] as const;
