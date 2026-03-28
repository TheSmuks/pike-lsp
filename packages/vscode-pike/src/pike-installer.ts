/**
 * Pike Installation Detection (vscode-go pattern)
 *
 * Detects Pike installation, prompts user if missing, provides
 * actionable options (install, configure path, detect again).
 *
 * Inspired by vscode-go's promptForMissingTool() and maybeInstallImportantTools().
 *
 * Usage:
 *   import { ensurePikeInstalled } from './pike-installer.js';
 *   const pikePath = await ensurePikeInstalled();
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import { getGlobalState, setGlobalState, StateKeys } from './state.js';

export interface PikeDetectionResult {
  /** Path to Pike executable */
  path: string;
  /** Pike version string */
  version: string;
  /** How Pike was found */
  source: 'path' | 'config' | 'which' | 'common';
}

/**
 * Detect Pike installation using multiple strategies.
 * Returns null if Pike is not found.
 */
export async function detectPike(): Promise<PikeDetectionResult | null> {
  // Strategy 1: Check user-configured path
  const config = vscode.workspace.getConfiguration('pike');
  const configuredPath = config.get<string>('pikePath', '');
  if (configuredPath) {
    const version = await getPikeVersion(configuredPath);
    if (version) {
      return { path: configuredPath, version, source: 'config' };
    }
  }

  // Strategy 2: Check PATH
  const pathVersion = await getPikeVersion('pike');
  if (pathVersion) {
    return { path: 'pike', version: pathVersion, source: 'path' };
  }

  // Strategy 3: Check common install locations
  const commonPaths = [
    '/usr/local/bin/pike',
    '/usr/bin/pike',
    '/opt/pike/bin/pike',
    `${process.env['HOME']}/pike-install/pike/8.0.1116/bin/pike`,
    `${process.env['HOME']}/.local/bin/pike`,
  ];

  for (const candidate of commonPaths) {
    const version = await getPikeVersion(candidate);
    if (version) {
      return { path: candidate, version, source: 'common' };
    }
  }

  return null;
}

/**
 * Ensure Pike is installed. Prompts user if not found.
 * Returns the Pike path or null if user declined.
 */
export async function ensurePikeInstalled(): Promise<string | null> {
  const detected = await detectPike();

  if (detected) {
    await setGlobalState(StateKeys.LAST_PIKE_VERSION, detected.version);
    return detected.path;
  }

  // Check if user previously dismissed
  const dismissed = getGlobalState<boolean>(StateKeys.PIKE_INSTALL_DISMISSED);
  if (dismissed) {
    return null;
  }

  // Show actionable prompt
  const action = await vscode.window.showWarningMessage(
    'Pike not found. The Pike Language Server requires Pike to analyze your code.',
    'Configure Path',
    'Install Pike',
    'Not Now'
  );

  switch (action) {
    case 'Configure Path':
      await vscode.commands.executeCommand('workbench.action.openSettings', 'pike.pikePath');
      return null;

    case 'Install Pike':
      await vscode.env.openExternal(vscode.Uri.parse('https://pike.lysator.liu.se/download/'));
      return null;

    case 'Not Now':
      await setGlobalState(StateKeys.PIKE_INSTALL_DISMISSED, true);
      return null;

    default:
      return null;
  }
}

/**
 * Get Pike version from a given executable path.
 */
async function getPikeVersion(pikePath: string): Promise<string | null> {
  return new Promise(resolve => {
    const proc = cp.spawn(pikePath, ['--version']);
    let output = '';
    proc.stderr?.on('data', (data: Buffer) => {
      output += data.toString();
    });
    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });
    proc.on('close', () => {
      const match = output.match(/Pike v(\d+\.\d+(?:\.\d+)?)/);
      resolve(match?.[1] ?? null);
    });
    proc.on('error', () => resolve(null));
    // Timeout after 5 seconds
    setTimeout(() => {
      proc.kill();
      resolve(null);
    }, 5000);
  });
}
