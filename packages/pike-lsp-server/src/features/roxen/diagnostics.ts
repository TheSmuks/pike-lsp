/**
 * Roxen diagnostics provider
 */

import type { Diagnostic } from 'vscode-languageserver';
import { Logger } from '@pike-lsp/core';

type RoxenRawDiagnostic = {
  line?: number;
  column?: number;
  severity?: string;
  message?: string;
};

type RoxenValidationBridge = {
  roxenValidate(code: string, filename: string): Promise<{ diagnostics?: RoxenRawDiagnostic[] }>;
};

type PendingDebounce = {
  timeout: ReturnType<typeof setTimeout> | null;
  resolve: (value: Diagnostic[]) => void;
};

const pendingDebounces = new Map<string, PendingDebounce>();
const log = new Logger('RoxenDiagnostics');

export async function provideRoxenDiagnostics(
  uri: string,
  code: string,
  bridge: RoxenValidationBridge,
  debounceMs = 500
): Promise<Diagnostic[]> {
  return new Promise(resolve => {
    const pending: PendingDebounce = {
      timeout: null,
      resolve,
    };

    const existing = pendingDebounces.get(uri);
    if (existing && existing.timeout !== null) {
      clearTimeout(existing.timeout);
      existing.resolve([]);
      pendingDebounces.delete(uri);
    }

    const timeout = setTimeout(async () => {
      try {
        const result = await bridge.roxenValidate(code, uri);
        const diagnostics = result.diagnostics || [];

        resolve(
          diagnostics.map(d => {
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
          })
        );
      } catch (error) {
        log.warn('Roxen diagnostics validation failed', {
          uri,
          error: error instanceof Error ? error.message : String(error),
        });
        resolve([]);
      } finally {
        if (pendingDebounces.get(uri) === pending) {
          pendingDebounces.delete(uri);
        }
      }
    }, debounceMs);

    pending.timeout = timeout;
    pendingDebounces.set(uri, pending);
  });
}
