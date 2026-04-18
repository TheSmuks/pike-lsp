import type { StdlibIndexManager, StdlibModuleInfo } from '../../stdlib-index.js';
import type { IntrospectedSymbol } from '@pike-lsp/pike-bridge';

/**
 * Create a mock StdlibIndexManager backed by a Map.
 * Optionally throws for modules in `failModules` to simulate load failures.
 */
export function createMockStdlibIndex(
  modules: Map<string, StdlibModuleInfo>,
  failModules?: Set<string>
): StdlibIndexManager {
  return {
    getModule: async (modPath: string) => {
      if (failModules?.has(modPath)) throw new Error(`Failed to load ${modPath}`);
      return modules.get(modPath) ?? null;
    },
    getAvailableModules: () => [...modules.keys()],
    getCachedModulePaths: () => [...modules.keys()],
  } as unknown as StdlibIndexManager;
}

/**
 * Build a StdlibModuleInfo with synthetic function symbols.
 */
export function makeModuleInfo(modulePath: string, symbolNames: string[]): StdlibModuleInfo {
  const symbols = new Map<string, IntrospectedSymbol>();
  for (const name of symbolNames) {
    symbols.set(name, {
      name,
      kind: 'function',
      type: { kind: 'mixed' },
    } as IntrospectedSymbol);
  }
  return { modulePath, symbols, lastAccessed: Date.now(), accessCount: 1, sizeBytes: 1024 };
}
