/**
 * State Management (vscode-go pattern)
 *
 * Typed wrappers for VS Code's globalState and workspaceState.
 * Persist user preferences across sessions.
 *
 * Usage:
 *   import { getGlobalState, setGlobalState, getWorkspaceState, setWorkspaceState } from './state.js';
 *
 *   // Persist last-used Pike version
 *   setGlobalState('lastPikeVersion', '8.0.1116');
 *   const lastVersion = getGlobalState<string>('lastPikeVersion');
 */

import * as vscode from 'vscode';

let globalState: vscode.Memento;
let workspaceState: vscode.Memento;

/**
 * Initialize state managers. Call once during extension activation.
 */
export function initState(context: vscode.ExtensionContext): void {
  globalState = context.globalState;
  workspaceState = context.workspaceState;
}

/**
 * Get a value from global state (persists across all workspaces).
 */
export function getGlobalState<T>(key: string, defaultValue?: T): T | undefined {
  return globalState?.get<T>(key, defaultValue as T);
}

/**
 * Set a value in global state.
 */
export async function setGlobalState<T>(key: string, value: T): Promise<void> {
  await globalState?.update(key, value);
}

/**
 * Get a value from workspace state (persists per-workspace).
 */
export function getWorkspaceState<T>(key: string, defaultValue?: T): T | undefined {
  return workspaceState?.get<T>(key, defaultValue as T);
}

/**
 * Set a value in workspace state.
 */
export async function setWorkspaceState<T>(key: string, value: T): Promise<void> {
  await workspaceState?.update(key, value);
}

// ---------------------------------------------------------------------------
// Common state keys (centralized, avoid magic strings)
// ---------------------------------------------------------------------------

export const StateKeys = {
  /** Last detected Pike version */
  LAST_PIKE_VERSION: 'pike.lastVersion',
  /** Whether user dismissed the install prompt */
  PIKE_INSTALL_DISMISSED: 'pike.installDismissed',
  /** Last time health check ran */
  LAST_HEALTH_CHECK: 'pike.lastHealthCheck',
  /** Server restart count (for crash detection) */
  RESTART_COUNT: 'pike.restartCount',
} as const;
