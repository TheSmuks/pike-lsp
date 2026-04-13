/**
 * Inlay Hints Handler
 *
 * Provides parameter name and type hints in code.
 *
 * Features:
 * - Parameter names at call sites (e.g., `func(value)` → `func(x: value)`)
 * - Parameter types when available (e.g., `func(value)` → `func(x: int value)`)
 * - Configurable via inlayHints settings
 */

import { Connection, InlayHint, InlayHintKind } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { InlayHintsSettings } from '../../core/types.js';
import { Logger } from '@pike-lsp/core';
import { collectCallContexts } from '../navigation/call-context-resolver.js';

/**
 * Register inlay hints handler.
 */
export function registerInlayHintsHandler(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache, bridge } = services;
  const log = new Logger('Advanced');

  /**
   * Extract type information from argTypes array.
   * argTypes comes from Pike's symbol->argtypes and contains type strings.
   */
  function getParamType(argTypes: unknown[] | undefined, index: number): string | undefined {
    if (!argTypes || index >= argTypes.length) return undefined;

    const typeInfo = argTypes[index];
    if (typeof typeInfo === 'string') {
      return typeInfo;
    }
    if (typeof typeInfo === 'object' && typeInfo !== null) {
      const typeRec = typeInfo as Record<string, unknown>;
      return typeRec['type'] as string | undefined;
    }
    return undefined;
  }

  /**
   * Get parameter name from argNames array, handling undefined elements.
   */
  function getParamName(argNames: string[] | undefined, index: number): string {
    if (!argNames || index >= argNames.length) return `arg${index}`;
    const name = argNames[index];
    return name || `arg${index}`;
  }

  function isVarargsType(typeInfo: unknown): boolean {
    if (!typeInfo) {
      return false;
    }
    if (typeof typeInfo === 'string') {
      return typeInfo.includes('...');
    }
    if (typeof typeInfo !== 'object') {
      return false;
    }
    const record = typeInfo as Record<string, unknown>;
    const name = (record['name'] ?? record['kind']) as string | undefined;
    return name === 'varargs';
  }

  function resolveParameterForArgument(
    argNames: string[] | undefined,
    argTypes: unknown[] | undefined,
    argumentIndex: number
  ): { paramName: string; paramType: string | undefined } | null {
    if (!argNames || argNames.length === 0) {
      return null;
    }

    if (argumentIndex < argNames.length) {
      const typeInfo = argTypes?.[argumentIndex];
      const isVarargs = isVarargsType(typeInfo);
      return {
        paramName: `${isVarargs ? '...' : ''}${getParamName(argNames, argumentIndex).replace(/^\.{3}/, '')}`,
        paramType: getParamType(argTypes, argumentIndex),
      };
    }

    const lastIndex = argNames.length - 1;
    const lastType = argTypes?.[lastIndex];
    if (!isVarargsType(lastType)) {
      return null;
    }

    return {
      paramName: `...${getParamName(argNames, lastIndex).replace(/^\.{3}/, '')}`,
      paramType: getParamType(argTypes, lastIndex),
    };
  }

  /**
   * Format inlay hint label with parameter name and optional type.
   * Examples:
   * - "x:" (parameter name only)
   * - "x: int" (parameter name with type)
   */
  function formatHintLabel(
    paramName: string,
    paramType: string | undefined,
    config?: InlayHintsSettings
  ): string {
    // Only include type if typeHints is enabled
    if (paramType && config?.typeHints) {
      return `${paramName}: ${paramType}`;
    }
    return `${paramName}:`;
  }

  /**
   * Inlay Hints - show parameter names and types at call sites.
   */
  connection.languages.inlayHint.on(async (params): Promise<InlayHint[] | null> => {
    log.debug('Inlay hints request', { uri: params.textDocument.uri });
    try {
      // Check if inlay hints are enabled
      const config = services.globalSettings?.inlayHints;
      if (!config?.enabled) {
        return null;
      }
      if (!config.parameterNames) {
        return null;
      }

      const uri = params.textDocument.uri;
      const cached = documentCache.get(uri);
      const document = documents.get(uri);

      if (!cached || !document) {
        return null;
      }

      const hints: InlayHint[] = [];
      const text = document.getText();

      const methods = cached.symbols.filter(s => s.kind === 'method');
      const tokens = bridge?.isRunning?.() ? await bridge.tokenize(text) : [];
      const calls = collectCallContexts(text, tokens);

      for (const call of calls) {
        const method =
          methods.find(
            s =>
              s.name === call.target.name &&
              (call.target.isMemberCall || !(s as { inherited?: boolean }).inherited)
          ) ?? methods.find(s => s.name === call.target.name);

        if (!method) {
          continue;
        }

        const methodRec = method as unknown as Record<string, unknown>;
        const argNames = methodRec['argNames'] as string[] | undefined;
        const argTypes = methodRec['argTypes'] as unknown[] | undefined;

        for (let index = 0; index < call.argumentRanges.length; index++) {
          const argumentRange = call.argumentRanges[index]!;
          const parameter = resolveParameterForArgument(argNames, argTypes, index);
          if (!parameter) {
            continue;
          }

          hints.push({
            position: document.positionAt(argumentRange.start),
            label: formatHintLabel(parameter.paramName, parameter.paramType, config),
            kind: InlayHintKind.Parameter,
            paddingRight: true,
          });
        }
      }

      return hints.length > 0 ? hints : null;
    } catch (err) {
      log.error(
        `Inlay hints failed for ${params.textDocument.uri}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  });

  /**
   * Inlay Hint resolve handler - can provide additional info lazily.
   * Currently not used, but kept for future enhancements (e.g., tooltips).
   */
  connection.languages.inlayHint.resolve?.((hint): InlayHint => {
    // Could add tooltip with full type info here
    return hint;
  });
}
