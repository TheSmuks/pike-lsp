import { DocumentSymbol } from 'vscode-languageserver';
import type { RoxenModuleInfo } from './types.js';

export function enhanceRoxenSymbols(
  baseSymbols: DocumentSymbol[],
  moduleInfo: RoxenModuleInfo | null
): DocumentSymbol[] {
  if (!moduleInfo || moduleInfo.is_roxen_module !== 1) {
    return baseSymbols;
  }

  const roxenContainer: DocumentSymbol = {
    name: 'Roxen Module',
    kind: 2, // Module
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 13 } },
    children: []
  };

  if (moduleInfo.variables && moduleInfo.variables.length > 0) {
    const variablesGroup: DocumentSymbol = {
      name: 'Module Variables',
      kind: 2, // Module
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 17 } },
      children: moduleInfo.variables.map((v) => {
        // Convert 1-based Pike line/column to 0-based LSP
        const line = Math.max(0, (v.position?.line ?? 1) - 1);
        const column = Math.max(0, (v.position?.column ?? 1) - 1);

        return {
          name: v.name,
          kind: 12, // Variable
          range: { start: { line, character: column }, end: { line, character: column } },
          selectionRange: { start: { line, character: column }, end: { line, character: column + v.name.length } },
          detail: v.type
        };
      })
    };
    roxenContainer.children!.push(variablesGroup);
  }

  if (moduleInfo.tags && moduleInfo.tags.length > 0) {
    const tagsGroup: DocumentSymbol = {
      name: 'RXML Tags',
      kind: 2, // Module
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 11 } },
      children: moduleInfo.tags.map((t) => {
        // Convert 1-based Pike line/column to 0-based LSP
        const line = Math.max(0, (t.position?.line ?? 1) - 1);
        const column = Math.max(0, (t.position?.column ?? 1) - 1);

        return {
          name: t.name,
          kind: 5, // Function
          range: { start: { line, character: column }, end: { line, character: column } },
          selectionRange: { start: { line, character: column }, end: { line, character: column + t.name.length } },
          detail: t.type
        };
      })
    };
    roxenContainer.children!.push(tagsGroup);
  }

  return [roxenContainer, ...baseSymbols];
}
