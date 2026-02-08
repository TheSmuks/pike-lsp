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
        
        resolve(diagnostics.map(d => ({
          range: {
            start: { line: d.range.start.line, character: d.range.start.character },
            end: { line: d.range.end.line, character: d.range.end.character },
          },
          severity: d.severity === 'error' ? 1 : d.severity === 'warning' ? 2 : 3,
          message: d.message || '',
          source: 'roxen',
        })));
      } catch (error) {
        resolve([]);
      }
    }, debounceMs);
    
    debounceTimeouts.set(uri, timeout);
  });
}
