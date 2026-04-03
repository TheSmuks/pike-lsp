import * as vscode from 'vscode';

interface ImportStatement {
  text: string;
  range: vscode.Range;
  type: 'include' | 'import';
  path: string;
}

interface GroupedImports {
  stdlib: ImportStatement[];
  thirdParty: ImportStatement[];
  local: ImportStatement[];
}

export async function organizeImports(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
  const config = vscode.workspace.getConfiguration('pike');
  const mode = config.get<string>('imports.mode', 'grouped');

  if (mode === 'none') {
    return [];
  }

  const text = document.getText();
  const imports = parseImports(document, text);

  if (imports.length === 0) {
    return [];
  }

  const firstImport = imports[0];
  const lastImport = imports[imports.length - 1];

  if (!firstImport || !lastImport) {
    return [];
  }

  const edits: vscode.TextEdit[] = [];

  if (mode === 'grouped') {
    const grouped = categorizeImports(imports, config);
    const sorted = sortGroupedImports(grouped);
    const newText = formatGroupedImports(sorted);
    const replaceRange = new vscode.Range(firstImport.range.start, lastImport.range.end);
    edits.push(vscode.TextEdit.replace(replaceRange, newText));
  } else {
    const sorted = [...imports].sort((a, b) => a.text.localeCompare(b.text));
    const newText = sorted.map(i => i.text).join('\n');
    const replaceRange = new vscode.Range(firstImport.range.start, lastImport.range.end);
    edits.push(vscode.TextEdit.replace(replaceRange, newText));
  }

  return edits;
}

function parseImports(document: vscode.TextDocument, text: string): ImportStatement[] {
  const imports: ImportStatement[] = [];
  const includePattern = /^#include\s+["<]([^">]+)[">]\s*;?\s*$/gm;
  const importPattern = /^(?:\s*inherit\s+)?import\s+([^;]+);\s*$/gm;

  let match: RegExpExecArray | null;

  while ((match = includePattern.exec(text)) !== null) {
    const path = match[1];
    if (!path) continue;
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);
    imports.push({
      text: match[0].trim(),
      range: new vscode.Range(startPos, endPos),
      type: 'include',
      path,
    });
  }

  while ((match = importPattern.exec(text)) !== null) {
    const path = match[1];
    if (!path) continue;
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);
    imports.push({
      text: match[0].trim(),
      range: new vscode.Range(startPos, endPos),
      type: 'import',
      path: path.trim(),
    });
  }

  return imports;
}

function categorizeImports(
  imports: ImportStatement[],
  config: vscode.WorkspaceConfiguration
): GroupedImports {
  const localPrefixes = config.get<string[]>('imports.localPrefix', []);

  const grouped: GroupedImports = {
    stdlib: [],
    thirdParty: [],
    local: [],
  };

  for (const imp of imports) {
    if (isStdlibImport(imp)) {
      grouped.stdlib.push(imp);
    } else if (isLocalImport(imp, localPrefixes)) {
      grouped.local.push(imp);
    } else {
      grouped.thirdParty.push(imp);
    }
  }

  return grouped;
}

function isStdlibImport(imp: ImportStatement): boolean {
  const stdlibPatterns = [
    /^stdio\.h$/,
    /^stdlib\.h$/,
    /^string\.h$/,
    /^unistd\.h$/,
    /^sys\/.*\.h$/,
    /^Stdio$/,
    /^Tools\.\w+$/,
    /^Crypto\.\w+$/,
    /^Protocols\.\w+$/,
    /^Web\.\w+$/,
    /^Sql\.\w+$/,
    /^GTK\d?\.\w+$/,
  ];

  if (imp.type === 'include' && imp.text.includes('<')) {
    return true;
  }

  return stdlibPatterns.some(pattern => pattern.test(imp.path));
}

function isLocalImport(imp: ImportStatement, localPrefixes: string[]): boolean {
  if (localPrefixes.length === 0) {
    const firstChar = imp.path[0];
    return (
      imp.path.startsWith('./') ||
      imp.path.startsWith('../') ||
      (firstChar !== undefined && firstChar === firstChar.toUpperCase() && !imp.path.includes('.'))
    );
  }

  return localPrefixes.some(prefix => imp.path.startsWith(prefix));
}

function sortGroupedImports(grouped: GroupedImports): GroupedImports {
  return {
    stdlib: grouped.stdlib.sort((a, b) => a.text.localeCompare(b.text)),
    thirdParty: grouped.thirdParty.sort((a, b) => a.text.localeCompare(b.text)),
    local: grouped.local.sort((a, b) => a.text.localeCompare(b.text)),
  };
}

function formatGroupedImports(grouped: GroupedImports): string {
  const sections: string[] = [];

  if (grouped.stdlib.length > 0) {
    sections.push(grouped.stdlib.map(i => i.text).join('\n'));
  }

  if (grouped.thirdParty.length > 0) {
    sections.push(grouped.thirdParty.map(i => i.text).join('\n'));
  }

  if (grouped.local.length > 0) {
    sections.push(grouped.local.map(i => i.text).join('\n'));
  }

  return sections.join('\n\n');
}
