/**
 * Error types for Pike Bridge.
 *
 * These are local copies to avoid circular dependency with pike-lsp-server.
 * The server package imports from bridge, so bridge cannot import from server.
 *
 * TODO: Extract to a shared @pike-lsp/core package to eliminate duplication.
 */

/**
 * Valid error layers in the LSP stack.
 */
export type ErrorLayer = 'server' | 'bridge' | 'pike';

/**
 * Base error class for all LSP-related errors.
 *
 * Tracks which layer the error occurred at and supports error chaining
 * via the native Error.cause property (Node.js 16.9.0+).
 */
export class LSPError extends Error {
  /**
   * The layer where this error occurred.
   */
  public readonly layer: ErrorLayer;

  /**
   * The underlying error that caused this error (if any).
   * Overrides Error.cause from the base Error class.
   */
  public override readonly cause?: Error;

  /**
   * Create a new LSPError.
   *
   * @param message - Human-readable error message
   * @param layer - The layer where this error occurred
   * @param cause - The underlying error that caused this error
   */
  constructor(message: string, layer: ErrorLayer, cause?: Error) {
    super(message);

    this.name = 'LSPError';
    this.layer = layer;

    // Handle cause assignment - only set when cause is provided
    // This works with exactOptionalPropertyTypes by not assigning undefined
    if (cause) {
      this.cause = cause;
    }

    // Maintain proper stack trace (V8-only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LSPError);
    }
  }

  public override toString(): string {
    return `${this.name} [${this.layer}]: ${this.message}`;
  }

  /**
   * Get the full error chain as a readable string.
   */
  get chain(): string {
    const messages: string[] = [this.message];

    let current = this.cause;
    while (current) {
      messages.push(current.message);
      // Follow the native Error.cause property
      current = 'cause' in current ? (current as { cause: Error }).cause : undefined;
    }

    return messages.join(' -> ');
  }

  /**
   * Get all errors in the chain as an array.
   */
  get chainErrors(): Error[] {
    const errors: Error[] = [this];

    let current = this.cause;
    while (current) {
      errors.push(current);
      current = 'cause' in current ? (current as { cause: Error }).cause : undefined;
    }

    return errors;
  }
}

/**
 * Error that originates from the Pike subprocess.
 *
 * Pike errors typically involve:
 * - Pike compilation failures
 * - Pike runtime errors
 * - Invalid Pike code being analyzed
 *
 * @example
 * ```typescript
 * try {
 *   const result = await this.pike.analyze(code);
 * } catch (cause) {
 *   throw new PikeError('pike compilation failed', cause);
 * }
 * ```
 */
export class PikeError extends LSPError {
  /**
   * Create a new PikeError.
   *
   * @param message - Human-readable error message
   * @param cause - The underlying error that caused this error
   */
  constructor(message: string, cause?: Error) {
    super(message, 'pike', cause);
    this.name = 'PikeError';
  }
}
