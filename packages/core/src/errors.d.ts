/**
 * Error types for Pike LSP packages.
 *
 * Shared utilities for error handling across the LSP stack.
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
export declare class LSPError extends Error {
    /**
     * The layer where this error occurred.
     */
    readonly layer: ErrorLayer;
    /**
     * The underlying error that caused this error (if any).
     * Overrides Error.cause from the base Error class.
     */
    readonly cause?: Error;
    /**
     * Create a new LSPError.
     *
     * @param message - Human-readable error message
     * @param layer - The layer where this error occurred
     * @param cause - The underlying error that caused this error
     */
    constructor(message: string, layer: ErrorLayer, cause?: Error);
    toString(): string;
    /**
     * Get the full error chain as a readable string.
     */
    get chain(): string;
    /**
     * Get all errors in the chain as an array.
     */
    get chainErrors(): Error[];
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
export declare class PikeError extends LSPError {
    /**
     * Create a new PikeError.
     *
     * @param message - Human-readable error message
     * @param cause - The underlying error that caused this error
     */
    constructor(message: string, cause?: Error);
}
/**
 * Error that occurs in the bridge layer.
 *
 * Bridge errors typically involve:
 * - Communication timeouts with the Pike subprocess
 * - JSON parsing/serialization failures
 * - stdin/stdout communication issues
 *
 * @example
 * ```typescript
 * try {
 *   await this.bridge.sendMessage(message);
 * } catch (cause) {
 *   throw new BridgeError('bridge timeout waiting for pike response', cause);
 * }
 * ```
 */
export declare class BridgeError extends LSPError {
    /**
     * Create a new BridgeError.
     *
     * @param message - Human-readable error message
     * @param cause - The underlying error that caused this error
     */
    constructor(message: string, cause?: Error);
}
//# sourceMappingURL=errors.d.ts.map