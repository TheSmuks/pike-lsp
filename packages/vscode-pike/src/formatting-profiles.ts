import * as vscode from 'vscode';

export interface FormattingOptions {
  maxLineLength: number;
  braceStyle: 'same-line' | 'new-line';
  spaceAroundOperators: boolean;
  blankLinesBetweenFunctions: number;
}

export function getFormattingOptions(): FormattingOptions {
  const config = vscode.workspace.getConfiguration('pike');

  return {
    maxLineLength: config.get<number>('formatting.maxLineLength', 0),
    braceStyle: config.get<'same-line' | 'new-line'>('formatting.braceStyle', 'same-line'),
    spaceAroundOperators: config.get<boolean>('formatting.spaceAroundOperators', true),
    blankLinesBetweenFunctions: config.get<number>('formatting.blankLinesBetweenFunctions', 1),
  };
}

export function formatCode(document: vscode.TextDocument, range: vscode.Range): vscode.TextEdit[] {
  const profile = getFormattingOptions();
  const edits: vscode.TextEdit[] = [];
  const text = document.getText(range);

  // Basic formatting - apply settings
  let formatted = text;

  // Apply brace style
  if (profile.braceStyle === 'new-line') {
    formatted = formatted.replace(/\)\s*\{/g, ')\n{');
  }

  // Apply operator spacing
  if (profile.spaceAroundOperators) {
    formatted = formatted.replace(/([a-zA-Z0-9])([+\-*/%=<>!&|])([a-zA-Z0-9])/g, '$1 $2 $3');
  }

  // Apply line length limit
  if (profile.maxLineLength > 0) {
    const lines = formatted.split('\n');
    const wrapped: string[] = [];

    for (const line of lines) {
      if (line.length <= profile.maxLineLength) {
        wrapped.push(line);
      } else {
        wrapped.push(line.substring(0, profile.maxLineLength));
      }
    }

    formatted = wrapped.join('\n');
  }

  if (formatted !== text) {
    edits.push(vscode.TextEdit.replace(range, formatted));
  }

  return edits;
}
