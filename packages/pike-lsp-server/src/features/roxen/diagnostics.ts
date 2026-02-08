/**
 * Roxen diagnostics provider
 */

import type { Diagnostic } from 'vscode-languageserver';
import type { PikeBridge } from '@pike-lsp/pike-bridge';

const debounceTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

export async function provideRoxenDiagnostics(
  uri: string,
  code: string,
  bridge: PikeBridge,
  debounceMs = 500
): Promise<Diagnostic[]> {
  return new Promise((resolve) => {
    const existingTimeout = debounceTimeouts.get(uri);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(async () => {
      try {
        const result = await bridge.roxenValidate(code, uri);
        const diagnostics = result.diagnostics || [];

        resolve(diagnostics.map(d => {
          // Convert 1-based Pike line/column to 0-based LSP
          const line = Math.max(0, (d.line ?? 1) - 1);
          const column = Math.max(0, (d.column ?? 1) - 1);

          return {
            range: {
              start: { line, character: column },
              end: { line, character: column },
            },
            severity: d.severity === 'error' ? 1 : d.severity === 'warning' ? 2 : 3,
            message: d.message || '',
            source: 'roxen', // Hardcoded - Pike doesn't return source
          };
        }));
      } catch (error) {
        resolve([]);
      }
    }, debounceMs);
    
    debounceTimeouts.set(uri, timeout);
  });
}
