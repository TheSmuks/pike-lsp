/**
 * Services Bundle
 *
 * Provides a single Services interface that feature handlers
 * will receive for accessing all server dependencies.
 */

import type { Logger } from '@pike-lsp/core';
import type { DocumentCache } from './document-cache.js';
import type { BridgeManager } from './bridge-manager.js';
import type { IncludeResolver } from './include-resolver.js';
import type { WorkspaceScanner } from './workspace-scanner.js';
import type { TypeDatabase } from '../type-database.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import type { StdlibIndexManager } from '../stdlib-index.js';
import type { PikeSettings } from '../core/types.js';

/**
 * Services interface bundles all service dependencies.
 *
 * Feature handlers receive this interface to access all
 * server services without needing to know their initialization.
 */
export interface Services {
    /** Bridge manager for Pike subprocess communication (null until initialized) */
    bridge: BridgeManager | null;
    /** Logger for diagnostic output */
    logger: Logger;
    /** Document cache for parsed document state */
    documentCache: DocumentCache;
    /** Type database for compiled program information */
    typeDatabase: TypeDatabase;
    /** Workspace index for symbol search across files */
    workspaceIndex: WorkspaceIndex;
    /** Stdlib index manager for standard library symbols */
    stdlibIndex: StdlibIndexManager | null;
    /** Include resolver for #include dependency tracking (null until initialized) */
    includeResolver: IncludeResolver | null;
    /** Workspace scanner for finding all Pike files in the workspace */
    workspaceScanner: WorkspaceScanner;
    /** Global LSP settings (mutable, updated by configuration changes) */
    globalSettings: PikeSettings;
    /** Include paths for module resolution (mutable, updated by configuration changes) */
    includePaths: string[];
}

// Re-export for convenience
export { DocumentCache } from './document-cache.js';
export { BridgeManager, type HealthStatus } from './bridge-manager.js';
export { WorkspaceScanner } from './workspace-scanner.js';
