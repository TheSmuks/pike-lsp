import * as vscode from 'vscode';
import * as path from 'path';

interface ImportStatement {
  text: string;
  range: vscode.Range;
  type: 'include' | 'import' | 'inherit';
  path: string;
}

interface GroupedImports {
  stdlib: ImportStatement[];
  thirdParty: ImportStatement[];
  local: ImportStatement[];
}

interface InheritDependency {
  file: string;
  inheritsFrom: string[];
}

export async function organizeImports(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
  const config = vscode.workspace.getConfiguration('pike');
  const mode = config.get<string>('imports.mode', 'grouped');
  const inheritAware = config.get<boolean>('imports.inheritAwareOrdering', true);

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

    if (inheritAware) {
      await applyInheritAwareOrdering(grouped, document);
    }

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
  const importPattern = /^(?:\s*)import\s+([^;]+);\s*$/gm;
  const inheritPattern = /^(?:\s*)inherit\s+["']([^"']+)["']\s*;?\s*$/gm;

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
    const impPath = match[1];
    if (!impPath) continue;
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);
    imports.push({
      text: match[0].trim(),
      range: new vscode.Range(startPos, endPos),
      type: 'import',
      path: impPath.trim(),
    });
  }

  while ((match = inheritPattern.exec(text)) !== null) {
    const inheritPath = match[1];
    if (!inheritPath) continue;
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);
    imports.push({
      text: match[0].trim(),
      range: new vscode.Range(startPos, endPos),
      type: 'inherit',
      path: inheritPath.trim(),
    });
  }

  return imports;
}

async function applyInheritAwareOrdering(
  grouped: GroupedImports,
  document: vscode.TextDocument
): Promise<void> {
  if (grouped.local.length === 0) {
    return;
  }

  const inheritImports = grouped.local.filter(imp => imp.type === 'inherit');
  if (inheritImports.length === 0) {
    return;
  }

  const dependencies = await detectInheritDependencies(inheritImports, document);

  if (dependencies.length > 0) {
    const ordered = topologicalSortWithCircularDetection(dependencies, inheritImports);

    if (ordered.circular) {
      const circularWarning = `Circular inheritance detected: ${ordered.circularChain?.join(' -> ')}. Using alphabetical ordering.`;
      void vscode.window.showWarningMessage(circularWarning);
    }

    const nonInheritLocal = grouped.local.filter(imp => imp.type !== 'inherit');
    grouped.local = [...nonInheritLocal, ...ordered.sorted];
  }
}

async function detectInheritDependencies(
  inheritImports: ImportStatement[],
  document: vscode.TextDocument
): Promise<InheritDependency[]> {
  const dependencies: InheritDependency[] = [];
  const documentDir = path.dirname(document.uri.fsPath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

  for (const imp of inheritImports) {
    const dep: InheritDependency = {
      file: imp.path,
      inheritsFrom: [],
    };

    try {
      let targetPath: string;

      if (path.isAbsolute(imp.path)) {
        targetPath = imp.path;
      } else if (imp.path.startsWith('./') || imp.path.startsWith('../')) {
        targetPath = path.resolve(documentDir, imp.path);
      } else {
        const searchPaths = workspaceFolder
          ? await getPikeSearchPaths(workspaceFolder.uri.fsPath)
          : [documentDir];

        targetPath =
          (await findFileInPaths(imp.path, searchPaths)) || path.resolve(documentDir, imp.path);
      }

      if (await fileExists(targetPath)) {
        const inherits = await parseInheritStatements(targetPath);
        const relativeInherits = inherits.map(inheritedPath =>
          normalizeInheritPath(inheritedPath, documentDir, targetPath)
        );
        dep.inheritsFrom = relativeInherits;
      }
    } catch (error) {
      console.warn(`Could not analyze inherit dependencies for ${imp.path}:`, error);
    }

    dependencies.push(dep);
  }

  return dependencies;
}

async function getPikeSearchPaths(workspaceRoot: string): Promise<string[]> {
  const paths: string[] = [];
  const config = vscode.workspace.getConfiguration('pike');

  const modulePath = config.get<string[]>('pikeModulePath', []);
  const programPath = config.get<string[]>('pikeProgramPath', []);

  paths.push(...modulePath.map(p => path.resolve(workspaceRoot, p)));
  paths.push(...programPath.map(p => path.resolve(workspaceRoot, p)));
  paths.push(path.join(workspaceRoot, 'lib'));
  paths.push(path.join(workspaceRoot, 'modules'));

  return paths.filter((p, i, arr) => arr.indexOf(p) === i);
}

async function findFileInPaths(
  filename: string,
  searchPaths: string[]
): Promise<string | undefined> {
  for (const searchPath of searchPaths) {
    const fullPath = path.join(searchPath, filename);
    if (await fileExists(fullPath)) {
      return fullPath;
    }

    const withPikeExt = fullPath + '.pike';
    if (await fileExists(withPikeExt)) {
      return withPikeExt;
    }

    const withPmodExt = fullPath + '.pmod';
    if (await fileExists(withPmodExt)) {
      return withPmodExt;
    }
  }
  return undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    return true;
  } catch {
    return false;
  }
}

async function parseInheritStatements(filePath: string): Promise<string[]> {
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const text = doc.getText();

    const inherits: string[] = [];
    const inheritPattern = /^(?:\s*)inherit\s+["']([^"']+)["']\s*;?\s*$/gm;
    let match: RegExpExecArray | null;

    while ((match = inheritPattern.exec(text)) !== null) {
      const path = match[1];
      if (path && !inherits.includes(path)) {
        inherits.push(path);
      }
    }

    return inherits;
  } catch (error) {
    console.warn(`Could not parse inherit statements from ${filePath}:`, error);
    return [];
  }
}

function normalizeInheritPath(
  inheritPath: string,
  documentDir: string,
  currentFilePath: string
): string {
  if (inheritPath.startsWith('./') || inheritPath.startsWith('../')) {
    const currentDir = path.dirname(currentFilePath);
    const resolvedPath = path.resolve(currentDir, inheritPath);
    const relativeToDoc = path.relative(documentDir, resolvedPath);

    if (!relativeToDoc.startsWith('..')) {
      return './' + relativeToDoc.replace(/\\/g, '/');
    }
    return relativeToDoc.replace(/\\/g, '/');
  }

  return inheritPath;
}

interface SortResult {
  sorted: ImportStatement[];
  circular: boolean;
  circularChain: string[] | undefined;
}

function topologicalSortWithCircularDetection(
  dependencies: InheritDependency[],
  imports: ImportStatement[]
): SortResult {
  const graph = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  for (const dep of dependencies) {
    if (!graph.has(dep.file)) {
      graph.set(dep.file, new Set());
      inDegree.set(dep.file, 0);
    }
  }

  for (const dep of dependencies) {
    for (const parent of dep.inheritsFrom) {
      if (!graph.has(parent)) {
        graph.set(parent, new Set());
        inDegree.set(parent, 0);
      }

      if (!graph.get(parent)?.has(dep.file)) {
        graph.get(parent)?.add(dep.file);
        inDegree.set(dep.file, (inDegree.get(dep.file) || 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [file, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(file);
    }
  }

  const result: string[] = [];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    processed.add(current);

    const children = graph.get(current) || new Set();
    for (const child of children) {
      const newDegree = (inDegree.get(child) || 0) - 1;
      inDegree.set(child, newDegree);
      if (newDegree === 0 && !processed.has(child)) {
        queue.push(child);
      }
    }
  }

  const circular = result.length < dependencies.length;
  let circularChain: string[] | undefined;

  if (circular) {
    const remaining = dependencies.filter(d => !processed.has(d.file));
    if (remaining.length > 0) {
      circularChain = remaining.map(r => r.file);
    }
  }

  const importMap = new Map(imports.map(imp => [imp.path, imp]));
  const sortedImports: ImportStatement[] = [];

  for (const filePath of result) {
    const imp = importMap.get(filePath);
    if (imp) {
      sortedImports.push(imp);
    }
  }

  for (const imp of imports) {
    if (!sortedImports.includes(imp)) {
      sortedImports.push(imp);
    }
  }

  if (circular) {
    sortedImports.sort((a, b) => a.text.localeCompare(b.text));
  }

  return {
    sorted: sortedImports,
    circular,
    circularChain,
  };
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
