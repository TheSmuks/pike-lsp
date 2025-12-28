/**
 * Configuration constants for Pike Bridge.
 *
 * MAINT-004: Centralized configuration values.
 */

/**
 * Default timeout for Pike bridge requests in milliseconds.
 *
 * @remarks
 * Requests that take longer than this will be rejected with a timeout error.
 * Can be overridden via {@link PikeBridgeOptions.timeout}.
 */
export const BRIDGE_TIMEOUT_DEFAULT = 30000;

/**
 * Maximum number of files to process in a single batch parse request.
 *
 * @remarks
 * Larger batches are automatically split into chunks to prevent memory issues.
 * This value balances IPC overhead reduction with memory constraints.
 */
export const BATCH_PARSE_MAX_SIZE = 50;
