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

// Process Management Constants

/**
 * Delay in milliseconds to wait after spawning the Pike process before marking it as started.
 *
 * @remarks
 * This gives the process time to initialize and begin processing JSON-RPC requests.
 */
export const PROCESS_STARTUP_DELAY = 100;

/**
 * Delay in milliseconds to wait after stopping the Pike process for graceful shutdown.
 *
 * @remarks
 * This allows the process to clean up resources before termination.
 */
export const GRACEFUL_SHUTDOWN_DELAY = 100;
