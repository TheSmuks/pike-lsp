/**
 * ExtensionInfo (vscode-go pattern)
 *
 * Centralized metadata about the extension and its environment.
 * Single source of truth for version, preview mode, cloud IDE detection.
 *
 * Usage:
 *   import { extensionInfo } from './extension-info.js';
 *   console.log(extensionInfo.version);  // "0.1.0-alpha.34"
 *   console.log(extensionInfo.isPreview); // true for pre-release
 *   console.log(extensionInfo.isInCloudIDE); // true for Codespaces/Gitpod
 */

import * as vscode from 'vscode';

export class ExtensionInfo {
  /** Extension version from package.json */
  readonly version: string | undefined;

  /** Application name (e.g., "VS Code", "VSCodium") */
  readonly appName: string;

  /** True if running a prerelease/preview version */
  readonly isPreview: boolean;

  /** True if running in a cloud IDE (Codespaces, Gitpod, etc.) */
  readonly isInCloudIDE: boolean;

  /** Pike language ID(s) this extension handles */
  readonly languageIds: readonly string[] = ['pike', 'pike-rxml'] as const;

  constructor() {
    const packageJSON = vscode.extensions.getExtension('smuks.pike-language')?.packageJSON;
    this.version = packageJSON?.version;
    this.appName = vscode.env.appName;

    // Preview = prerelease version (contains alpha, beta, rc)
    this.isPreview = /alpha|beta|rc|dev|nightly/i.test(this.version ?? '');

    // Cloud IDE detection
    this.isInCloudIDE =
      !!process.env['CODESPACES'] ||
      !!process.env['GITPOD_WORKSPACE_ID'] ||
      !!process.env['CLOUD_SHELL'] ||
      !!process.env['CODEBERG_WORKSPACES'];
  }

  /** Short display string for logs/messages */
  get displayString(): string {
    return `Pike LSP v${this.version ?? 'unknown'} (${this.appName})`;
  }
}

/** Singleton instance — import and use directly */
export const extensionInfo = new ExtensionInfo();
