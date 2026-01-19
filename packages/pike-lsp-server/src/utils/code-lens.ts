import type { Command, Position } from 'vscode-languageserver';

export function buildCodeLensCommand(
    refCount: number,
    uri: string,
    position: Position
): Command {
    return {
        title: `${refCount} reference${refCount !== 1 ? 's' : ''}`,
        command: 'pike.showReferences',
        arguments: [{ uri, position }]
    };
}
