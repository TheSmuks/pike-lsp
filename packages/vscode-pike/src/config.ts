/**
 * Config Manager (vscode-go pattern)
 *
 * Typed, URI-aware config helpers. All settings access goes through here.
 * Inspired by vscode-go's getGoConfig() / getGoplsConfig() pattern.
 *
 * Usage:
 *   import { getPikeConfig, getServerConfig } from './config.js';
 *
 *   const config = getPikeConfig();
 *   const pikePath = config.get<string>('pikePath', 'pike');
 *
 *   // Per-folder override:
 *   const config = getPikeConfig(document.uri);
 */

import * as vscode from 'vscode';

/** Pike extension settings shape */
export interface PikeSettings {
  pikePath: string;
  maxNumberOfProblems: number;
  diagnosticDelay: number;
  modulePaths: string[];
  includePaths: string[];
  enableRoxen: boolean;
  trace: { server: 'off' | 'messages' | 'verbose' };
}

/** Default settings values */
export const defaultPikeSettings: PikeSettings = {
  pikePath: 'pike',
  maxNumberOfProblems: 100,
  diagnosticDelay: 300,
  modulePaths: [],
  includePaths: [],
  enableRoxen: false,
  trace: { server: 'off' },
};

/**
 * Get Pike configuration, optionally scoped to a specific document URI.
 *
 * Declared as a const (not function) so it can be stubbed in tests.
 */
export const getPikeConfig = (uri?: vscode.Uri): vscode.WorkspaceConfiguration => {
  return vscode.workspace.getConfiguration('pike', uri ?? null);
};

/**
 * Get server-specific configuration.
 */
export const getServerConfig = (uri?: vscode.Uri): vscode.WorkspaceConfiguration => {
  return vscode.workspace.getConfiguration('pike.server', uri ?? null);
};

/**
 * Read all Pike settings as a typed object.
 * Respects per-folder overrides when URI is provided.
 */
export function readPikeSettings(uri?: vscode.Uri): PikeSettings {
  const config = getPikeConfig(uri);
  return {
    pikePath: config.get<string>('pikePath', defaultPikeSettings.pikePath),
    maxNumberOfProblems: config.get<number>(
      'maxNumberOfProblems',
      defaultPikeSettings.maxNumberOfProblems
    ),
    diagnosticDelay: config.get<number>('diagnosticDelay', defaultPikeSettings.diagnosticDelay),
    modulePaths: config.get<string[]>('modulePaths', defaultPikeSettings.modulePaths),
    includePaths: config.get<string[]>('includePaths', defaultPikeSettings.includePaths),
    enableRoxen: config.get<boolean>('enableRoxen', defaultPikeSettings.enableRoxen),
    trace: config.get<{ server: 'off' | 'messages' | 'verbose' }>(
      'trace',
      defaultPikeSettings.trace
    ),
  };
}

/**
 * Listen for configuration changes and call back with new settings.
 * Returns a disposable to unsubscribe.
 */
export function onConfigChanged(callback: (settings: PikeSettings) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('pike')) {
      callback(readPikeSettings());
    }
  });
}
