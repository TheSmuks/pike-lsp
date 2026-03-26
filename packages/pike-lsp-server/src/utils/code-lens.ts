import type { Command, Position } from 'vscode-languageserver';

export function buildCodeLensCommand(
  refCount: number,
  uri: string,
  position: Position,
  symbolName: string
): Command {
  return {
    title: `${refCount} reference${refCount !== 1 ? 's' : ''}`,
    command: 'pike.showReferences',
    arguments: [uri, position, symbolName],
  };
}

export function buildRunnableCodeLensCommand(
  kind: 'run-file' | 'run-test',
  uri: string,
  symbolName: string
): Command {
  if (kind === 'run-test') {
    return {
      title: '▶ Run Test',
      command: 'pike.lsp.runTest',
      arguments: [uri, symbolName],
    };
  }

  return {
    title: '▶ Run',
    command: 'pike.lsp.runFile',
    arguments: [uri, symbolName],
  };
}
