import { TextDocument } from 'vscode-languageserver';
import { PikeBridge } from '@pike-lsp/pike-bridge';
import type { RoxenModuleInfo } from './types.js';

const cache = new Map<string, { version: number; info: RoxenModuleInfo | null }>();

function hasMarkers(code: string): boolean {
  return code.includes('inherit "module"') && code.includes('#include <module.h>');
}

export async function detectRoxenModule(
  document: TextDocument,
  bridge: PikeBridge
): Promise<RoxenModuleInfo | null> {
  const { uri, version } = document;
  const code = document.getText();

  if (!hasMarkers(code)) return null;

  const cached = cache.get(uri);
  if (cached && cached.version === version) return cached.info;

  try {
    const result = await bridge.roxenDetect(code, uri);
    const info = result.is_roxen_module === 1 ? result : null;
    cache.set(uri, { version, info });
    return info;
  } catch {
    return null;
  }
}

export function invalidateCache(uri: string): void {
  cache.delete(uri);
}
