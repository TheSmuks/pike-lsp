/**
 * Roxen diagnostics provider
 */

import type { Diagnostic } from 'vscode-languageserver';
import { Logger } from '@pike-lsp/core';
import type { RoxenDiagnostic, RoxenValidationResult } from './types.js';

type RoxenValidationBridge = {
  roxenValidate(
    code: string,
    filename: string,
    moduleInfo?: Record<string, unknown>
  ): Promise<RoxenValidationResult>;
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
  debounceMs = 500,
  moduleInfo?: Record<string, unknown>
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
        const result = await bridge.roxenValidate(code, uri, moduleInfo);

        if (result.error) {
          log.warn('Roxen validation returned error', {
            uri,
            code: result.error.code,
            message: result.error.message,
          });
          resolve([]);
          return;
        }

        const diagnostics: RoxenDiagnostic[] = result.diagnostics ?? [];

        resolve(
          diagnostics.map((d: RoxenDiagnostic) => {
            // Convert 1-based Pike line/column to 0-based LSP
            const line = Math.max(0, d.line - 1);
            const column = Math.max(0, d.column - 1);

            return {
              range: {
                start: { line, character: column },
                end: { line, character: column },
              },
              severity: d.severity === 'error' ? 1 : d.severity === 'warning' ? 2 : 3,
              message: d.message,
              source: 'roxen',
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
