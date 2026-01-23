/**
 * Error types for Pike LSP packages.
 *
 * Shared utilities for error handling across the LSP stack.
 */
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
    layer;
    /**
     * The underlying error that caused this error (if any).
     * Overrides Error.cause from the base Error class.
     */
    cause;
    /**
     * Create a new LSPError.
     *
     * @param message - Human-readable error message
     * @param layer - The layer where this error occurred
     * @param cause - The underlying error that caused this error
     */
    constructor(message, layer, cause) {
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
    toString() {
        return `${this.name} [${this.layer}]: ${this.message}`;
    }
    /**
     * Get the full error chain as a readable string.
     */
    get chain() {
        const messages = [this.message];
        let current = this.cause;
        while (current) {
            messages.push(current.message);
            // Follow the native Error.cause property
            current = 'cause' in current ? current.cause : undefined;
        }
        return messages.join(' -> ');
    }
    /**
     * Get all errors in the chain as an array.
     */
    get chainErrors() {
        const errors = [this];
        let current = this.cause;
        while (current) {
            errors.push(current);
            current = 'cause' in current ? current.cause : undefined;
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
    constructor(message, cause) {
        super(message, 'pike', cause);
        this.name = 'PikeError';
    }
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
export class BridgeError extends LSPError {
    /**
     * Create a new BridgeError.
     *
     * @param message - Human-readable error message
     * @param cause - The underlying error that caused this error
     */
    constructor(message, cause) {
        super(message, 'bridge', cause);
        this.name = 'BridgeError';
    }
}
//# sourceMappingURL=errors.js.map