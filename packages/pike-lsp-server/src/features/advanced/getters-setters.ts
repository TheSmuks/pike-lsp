/**
 * Generate Getter/Setter Code Actions
 */
import { CodeAction, CodeActionKind, Range } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { PikeSymbol } from '@pike-lsp/pike-bridge';
import { formatPikeType } from '../utils/pike-type-formatter.js';

export function getGenerateGetterSetterActions(
  document: TextDocument,
  uri: string,
  range: Range,
  symbols: PikeSymbol[],
  onlyKinds?: string[] // Optional filter for context.only
): CodeAction[] {
  // Early exit if filter excludes RefactorRewrite
  if (onlyKinds && onlyKinds.length > 0) {
    const matches = onlyKinds.some(only => {
      // Check if filter includes Refactor or RefactorRewrite
      // RefactorRewrite is 'refactor.rewrite', which starts with 'refactor.'
      return (
        CodeActionKind.RefactorRewrite === only ||
        CodeActionKind.RefactorRewrite.startsWith(only + '.') ||
        only.startsWith(CodeActionKind.Refactor + '.')
      );
    });
    if (!matches) {
      return []; // Filtered out
    }
  }

  const actions: CodeAction[] = [];

  // We operate on the line of the selection start
  const startLine = range.start.line;

  // Helper to find symbol recursively that matches the line
  function findSymbol(symbols: PikeSymbol[]): PikeSymbol | null {
    for (const sym of symbols) {
      // Check if line is within symbol range
      // PikeSymbol from bridge usually has `position` object with `line`.
      const symPos = sym.position;
      const symLine = symPos?.line;

      // Pike uses 1-based line numbers, LSP uses 0-based
      if (symLine === startLine + 1) {
        return sym;
      }

      if (sym.children) {
        const found = findSymbol(sym.children);
        if (found) return found;
      }
    }
    return null;
  }

  const symbol = findSymbol(symbols);

  if (!symbol || symbol.kind !== 'variable') {
    return [];
  }

  // We found a variable.
  const name = symbol.name;
  const typeStr = formatPikeType(symbol.type);

  // Determine naming convention
  let baseName = name;
  if (baseName.startsWith('_')) {
    baseName = baseName.substring(1);
  } else if (baseName.endsWith('_')) {
    baseName = baseName.substring(0, baseName.length - 1);
  }

  const getterName = `get_${baseName}`;
  const setterName = `set_${baseName}`;

  // Determine indentation
  const lineText = document.getText({
    start: { line: startLine, character: 0 },
    end: { line: startLine + 1, character: 0 },
  });
  const match = lineText.match(/^(\s*)/);
  const lineIndent = match ? match[1] : '';

  // Determine where to insert (next line)
  const insertLine = startLine + 1;
  const insertPos = { line: insertLine, character: 0 };

  // Generate Code
  // We add an extra newline at the start to separate from variable
  // And ensure indentation is correct for body

  // Detect indentation unit (assuming 4 spaces if we can't tell, but here we use lineIndent)
  // For body indentation, we assume standard 4 spaces or 2 spaces?
  // We can try to guess from the file?
  // For now, let's just add 4 spaces to the lineIndent.
  const bodyIndent = lineIndent + '    ';

  const getterCode = `
${lineIndent}//! Gets the ${baseName}.
${lineIndent}${typeStr} ${getterName}() {
${bodyIndent}return ${name};
${lineIndent}}
`;

  const setterCode = `
${lineIndent}//! Sets the ${baseName}.
${lineIndent}void ${setterName}(${typeStr} value) {
${bodyIndent}${name} = value;
${lineIndent}}
`;

  // Action: Generate Getter
  actions.push({
    title: `Generate Getter '${getterName}'`,
    kind: CodeActionKind.RefactorRewrite,
    edit: {
      changes: {
        [uri]: [
          {
            range: { start: insertPos, end: insertPos },
            newText: getterCode,
          },
        ],
      },
    },
  });

  // Action: Generate Setter
  actions.push({
    title: `Generate Setter '${setterName}'`,
    kind: CodeActionKind.RefactorRewrite,
    edit: {
      changes: {
        [uri]: [
          {
            range: { start: insertPos, end: insertPos },
            newText: setterCode,
          },
        ],
      },
    },
  });

  // Action: Generate Both
  actions.push({
    title: `Generate Getter and Setter`,
    kind: CodeActionKind.RefactorRewrite,
    edit: {
      changes: {
        [uri]: [
          {
            range: { start: insertPos, end: insertPos },
            newText: getterCode + setterCode,
          },
        ],
      },
    },
  });

  return actions;
}
