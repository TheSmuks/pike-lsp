/**
 * Bridge Startup Error Classification
 *
 * Classifies bridge startup errors into actionable categories so the document
 * validator can provide specific guidance instead of a generic warning.
 */

import { MIN_SUPPORTED_VERSION, type PikeVersionInfo } from './compatibility.js';

/**
 * Classification of bridge startup failures.
 */
export type BridgeStartupErrorKind =
  | 'pike-not-found'
  | 'pike-not-executable'
  | 'script-not-found'
  | 'script-not-executable'
  | 'version-unsupported'
  | 'pipe-failure'
  | 'timeout'
  | 'unknown';

/**
 * Actionable error details for user display.
 */
export interface BridgeStartupErrorDetails {
  kind: BridgeStartupErrorKind;
  message: string;
  suggestion: string;
  diagnostic?: string;
  pikePath?: string;
  scriptPath?: string;
  currentVersion?: PikeVersionInfo;
  requiredVersion?: PikeVersionInfo;
}

/**
 * Classify a bridge startup error into actionable categories.
 */
export function classifyBridgeStartupError(
  err: unknown,
  pikePath?: string,
  scriptPath?: string
): BridgeStartupErrorDetails {
  if (!(err instanceof Error)) {
    return {
      kind: 'unknown',
      message: 'Pike bridge failed to start with an unknown error',
      suggestion: 'Check LSP logs for details and ensure Pike is properly installed',
      diagnostic: String(err),
    };
  }

  const errorCode = (err as NodeJS.ErrnoException).code;
  const errorMessage = err.message.toLowerCase();
  const errPath = (err as NodeJS.ErrnoException).path;

  // ENOENT: file or directory not found
  if (errorCode === 'ENOENT') {
    const isScriptError =
      errPath?.includes('analyzer.pike') || (scriptPath && !errPath?.includes('pike') && !pikePath);

    if (isScriptError) {
      const result: BridgeStartupErrorDetails = {
        kind: 'script-not-found',
        message: 'Pike analyzer script not found',
        suggestion: `Ensure the LSP server is installed correctly. Looking for: ${scriptPath ?? 'analyzer.pike'}`,
        diagnostic: `ENOENT: ${err.message}`,
      };
      const resolvedPath = errPath ?? scriptPath;
      if (resolvedPath) result.scriptPath = resolvedPath;
      return result;
    }

    const result: BridgeStartupErrorDetails = {
      kind: 'pike-not-found',
      message: 'Pike executable not found',
      suggestion: `Install Pike or configure the correct path in settings. Current path: ${pikePath ?? 'pike'}`,
      diagnostic: `ENOENT: ${err.message}`,
    };
    const resolvedPath = errPath ?? pikePath;
    if (resolvedPath) result.pikePath = resolvedPath;
    return result;
  }

  // EACCES or EPERM: permission denied
  if (errorCode === 'EACCES' || errorCode === 'EPERM') {
    const isScriptError =
      errPath?.includes('analyzer.pike') || (scriptPath && !errPath?.includes('pike') && !pikePath);

    if (isScriptError) {
      const result: BridgeStartupErrorDetails = {
        kind: 'script-not-executable',
        message: 'Analyzer script cannot be executed (permission denied)',
        suggestion: `Check file permissions for: ${scriptPath ?? 'analyzer.pike'}. Ensure read and execute permissions are granted.`,
        diagnostic: `${errorCode}: ${err.message}`,
      };
      const resolvedPath = errPath ?? scriptPath;
      if (resolvedPath) result.scriptPath = resolvedPath;
      return result;
    }

    const result: BridgeStartupErrorDetails = {
      kind: 'pike-not-executable',
      message: 'Pike executable cannot be executed (permission denied)',
      suggestion: `Check file permissions for: ${pikePath ?? 'pike'}. Ensure execute permission is granted.`,
      diagnostic: `${errorCode}: ${err.message}`,
    };
    const resolvedPath = errPath ?? pikePath;
    if (resolvedPath) result.pikePath = resolvedPath;
    return result;
  }

  // Pipe creation failure
  if (
    errorMessage.includes('pipe') ||
    errorMessage.includes('stdin') ||
    errorMessage.includes('stdout')
  ) {
    return {
      kind: 'pipe-failure',
      message: 'Failed to create communication pipes with Pike subprocess',
      suggestion:
        'This may indicate a system resource limit or configuration issue. Try restarting your editor or system.',
      diagnostic: err.message,
    };
  }

  // Timeout
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    return {
      kind: 'timeout',
      message: 'Pike bridge startup timed out',
      suggestion:
        'Pike may be taking too long to start. Check system resources or try increasing the timeout in settings.',
      diagnostic: err.message,
    };
  }

  return {
    kind: 'unknown',
    message: 'Pike bridge failed to start',
    suggestion: 'Check LSP logs for technical details and ensure Pike is properly configured',
    diagnostic: err.message,
  };
}

/**
 * Create error details for an unsupported Pike version.
 *
 * Called after successful startup when version check fails.
 */
export function createVersionErrorDetails(
  current: PikeVersionInfo,
  required: PikeVersionInfo = MIN_SUPPORTED_VERSION
): BridgeStartupErrorDetails {
  return {
    kind: 'version-unsupported',
    message: 'Pike version is not supported',
    suggestion: `Pike ${required.string} or higher is required. Current version: ${current.string}. Please upgrade Pike.`,
    diagnostic: `Version mismatch: required ${required.string}, found ${current.string}`,
    currentVersion: current,
    requiredVersion: required,
  };
}

/**
 * Format classified error details for console output.
 */
export function formatBridgeStartupError(details: BridgeStartupErrorDetails): string {
  const parts = [`[VALIDATE] ${details.message}`, `  Suggestion: ${details.suggestion}`];

  if (details.pikePath) {
    parts.push(`  Pike path: ${details.pikePath}`);
  }
  if (details.scriptPath) {
    parts.push(`  Script path: ${details.scriptPath}`);
  }
  if (details.diagnostic) {
    parts.push(`  Diagnostic: ${details.diagnostic}`);
  }

  return parts.join('\n');
}
