/**
 * Pike Configuration - Auto-detection and path management
 */

import { OutputChannel, workspace, window, ConfigurationTarget, Uri } from 'vscode';
import { detectPike, getModulePathSuggestions, PikeDetectionResult } from './pike-detector';
import { ensurePikeInstalled } from './pike-installer';

export async function autoDetectPikeConfigurationIfNeeded(
  outputChannel: OutputChannel
): Promise<void> {
  const config = workspace.getConfiguration('pike');
  const pikePath = config.get<string>('pikePath', 'pike');
  const pikeModulePath = config.get<string[]>('pikeModulePath', []);

  if (pikePath !== 'pike' || pikeModulePath.length > 0) {
    outputChannel.appendLine(
      `[Pike] Using configured Pike paths: ${JSON.stringify({ pikePath, pikeModulePath })}`
    );
    return;
  }

  outputChannel.appendLine('[Pike] No configuration found, running auto-detection...');
  const result = await detectPike();

  if (result) {
    outputChannel.appendLine(`[Pike] Auto-detected Pike: ${JSON.stringify(result)}`);
    await applyDetectedPikeConfiguration(result, outputChannel);
  } else {
    outputChannel.appendLine('[Pike] Pike not found in common locations');
  }
}

export async function autoDetectPikeConfiguration(outputChannel: OutputChannel): Promise<void> {
  outputChannel.appendLine('Detecting Pike installation...');
  outputChannel.show(true);

  const result = await detectPike();

  if (result) {
    outputChannel.appendLine(`Found Pike v${result.version}:`);
    outputChannel.appendLine(`  Executable: ${result.pikePath}`);
    outputChannel.appendLine(`  Module path: ${result.modulePath || '(not found)'}`);
    outputChannel.appendLine(`  Include path: ${result.includePath || '(not found)'}`);

    const applied = await applyDetectedPikeConfiguration(result, outputChannel);
    if (applied) {
      window.showInformationMessage(`Pike v${result.version} detected and configured!`);
    } else {
      window.showInformationMessage('Pike detected but configuration already up to date.');
    }
  } else {
    outputChannel.appendLine('Pike not found on system.');
    window.showWarningMessage(
      'Could not detect Pike installation automatically. Please configure Pike paths manually in settings.'
    );
  }
}

export async function applyDetectedPikeConfiguration(
  result: PikeDetectionResult,
  outputChannel: OutputChannel
): Promise<boolean> {
  const config = workspace.getConfiguration('pike');
  let updated = false;

  const currentPikePath = config.get<string>('pikePath', 'pike');
  if (currentPikePath === 'pike' && result.pikePath !== 'pike') {
    await config.update('pikePath', result.pikePath, ConfigurationTarget.Workspace);
    updated = true;
    outputChannel.appendLine(`[Pike] Updated pikePath to: ${result.pikePath}`);
  }

  const currentModulePath = config.get<string[]>('pikeModulePath', []);
  const newModulePaths: string[] = [];

  if (result.modulePath && !currentModulePath.includes(result.modulePath)) {
    newModulePaths.push(result.modulePath);
  }

  if (result.includePath && !currentModulePath.includes(result.includePath)) {
    newModulePaths.push(result.includePath);
  }

  const suggestions = await getModulePathSuggestions(result.pikePath);
  for (const suggestion of suggestions) {
    if (!currentModulePath.includes(suggestion) && !newModulePaths.includes(suggestion)) {
      newModulePaths.push(suggestion);
    }
  }

  if (newModulePaths.length > 0) {
    const updatedModulePath = [...currentModulePath, ...newModulePaths];
    await config.update('pikeModulePath', updatedModulePath, ConfigurationTarget.Workspace);
    updated = true;
    outputChannel.appendLine(`[Pike] Added module paths: ${JSON.stringify(newModulePaths)}`);
  }

  return updated;
}

export async function promptForMissingPikeIfNeeded(): Promise<void> {
  const config = workspace.getConfiguration('pike');
  const pikePath = config.get<string>('pikePath', 'pike');
  if (pikePath === 'pike') {
    const detection = await detectPike();
    if (!detection) {
      const promptForMissingPike = config.get<boolean>('promptForMissingPike', true);
      if (promptForMissingPike) {
        void ensurePikeInstalled();
      }
    }
  }
}

export function getExpandedModulePaths(outputChannel: OutputChannel): string[] {
  const config = workspace.getConfiguration('pike');
  const paths = config.get<string[]>('pikeModulePath', []);
  return expandPaths(paths, outputChannel);
}

export function getExpandedIncludePaths(outputChannel: OutputChannel): string[] {
  const config = workspace.getConfiguration('pike');
  const paths = config.get<string[]>('pikeIncludePath', []);
  return expandPaths(paths, outputChannel);
}

export function getExpandedProgramPaths(outputChannel: OutputChannel): string[] {
  const config = workspace.getConfiguration('pike');
  const paths = config.get<string[]>('pikeProgramPath', []);
  return expandPaths(paths, outputChannel);
}

export function getExpandedDefineFiles(outputChannel: OutputChannel): string[] {
  const config = workspace.getConfiguration('pike');
  const files = config.get<string[]>('analysis.defineFiles', []);
  return expandPaths(files, outputChannel);
}

function expandPaths(paths: string[], outputChannel: OutputChannel): string[] {
  const workspaceFolder = workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return paths;
  }

  const expanded: string[] = [];
  for (const p of paths) {
    if (p.includes('${workspaceFolder}')) {
      const expandedPath = p.replace('${workspaceFolder}', workspaceFolder.uri.fsPath);
      expanded.push(expandedPath);
    } else if (p.startsWith('~/')) {
      const home = process.env['HOME'] || process.env['USERPROFILE'];
      if (home) {
        expanded.push(p.replace('~', home));
      } else {
        outputChannel.appendLine(`[Pike] Warning: Cannot expand home directory in path: ${p}`);
        expanded.push(p);
      }
    } else {
      expanded.push(p);
    }
  }
  return expanded;
}

export async function addToModulePath(uri: Uri): Promise<boolean> {
  const config = workspace.getConfiguration('pike');
  const pikeModulePath = config.get<string[]>('pikeModulePath', []);
  let modulePath = uri.fsPath;

  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    const f = workspace.workspaceFolders[0]!.uri.fsPath;
    modulePath = modulePath.replace(f, '${workspaceFolder}');
  }

  if (!pikeModulePath.includes(modulePath)) {
    const updatedPath = [...pikeModulePath, modulePath];
    await config.update('pikeModulePath', updatedPath, ConfigurationTarget.Workspace);
    return true;
  }
  return false;
}

export async function addToProgramPath(uri: Uri): Promise<boolean> {
  const config = workspace.getConfiguration('pike');
  const pikeProgramPath = config.get<string[]>('pikeProgramPath', []);
  let programPath = uri.fsPath;

  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    const f = workspace.workspaceFolders[0]!.uri.fsPath;
    programPath = programPath.replace(f, '${workspaceFolder}');
  }

  if (!pikeProgramPath.includes(programPath)) {
    const updatedPath = [...pikeProgramPath, programPath];
    await config.update('pikeProgramPath', updatedPath, ConfigurationTarget.Workspace);
    return true;
  }
  return false;
}
