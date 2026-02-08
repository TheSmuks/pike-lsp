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
    children: []
  };

  if (moduleInfo.variables && moduleInfo.variables.length > 0) {
    roxenContainer.children!.push({
      name: 'Module Variables',
      kind: 2, // Module
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      children: moduleInfo.variables.map((v, i) => ({
        name: v.name,
        kind: 12, // Variable
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        detail: v.type
      }))
    });
  }

  if (moduleInfo.tags && moduleInfo.tags.length > 0) {
    roxenContainer.children!.push({
      name: 'RXML Tags',
      kind: 2, // Module
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      children: moduleInfo.tags.map((t, i) => ({
        name: t.name,
        kind: 5, // Function
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        detail: t.type
      }))
    });
  }

  return [roxenContainer, ...baseSymbols];
}
