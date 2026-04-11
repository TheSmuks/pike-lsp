/**
 * Module and Member Resolution
 *
 * Resolves module paths (Stdio.File), member access (variable->method),
 * and module members (Parser.Pike.split) to their definition locations.
 * Extracted from definition.ts for maintainability.
 */

import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Location } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { DocumentCacheEntry } from '../../core/types.js';
import type { ExpressionInfo, PikeSymbol } from '@pike-lsp/pike-bridge';
import { Logger } from '@pike-lsp/core';

/**
 * Resolve a module path to its file location.
 * Handles dotted module paths like "Stdio.File" or "Parser.Pike".
 */
export async function resolveModulePath(
  services: Services,
  expr: ExpressionInfo,
  _document: TextDocument,
  _currentUri: string
): Promise<Location | null> {
  const { stdlibIndex, bridge } = services;

  if (!stdlibIndex || !bridge) {
    return null;
  }

  // Build the module path to resolve
  let modulePath = expr.base;
  if (expr.operator === '.' && !expr.isModulePath && expr.member) {
    // For simple dot access like "Stdio.File", use the full path
    modulePath = expr.fullPath;
  }

  try {
    const moduleInfo = await stdlibIndex.getModule(modulePath);
    if (!moduleInfo) {
      return null;
    }

    // Use filePath (without line number) for the URI, and line for the position
    const filePath = moduleInfo.filePath ?? moduleInfo.resolvedPath;
    if (!filePath) {
      return null;
    }

    // Convert file path to URI
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;

    // Get the line number (0-based) from module info, default to 0
    const line = moduleInfo.line ?? 0;

    // Find the specific symbol within the module if a member was requested
    // Note: IntrospectedSymbol doesn't have position info, so we return the module file
    if (expr.member && moduleInfo.symbols) {
      const memberSymbol = moduleInfo.symbols.get(expr.member);
      if (memberSymbol) {
        // Return the module file location at the module's line
        return {
          uri,
          range: {
            start: { line, character: 0 },
            end: { line, character: 0 },
          },
        };
      }
    }

    // Return the module file location at the parsed line number
    return {
      uri,
      range: {
        start: { line, character: 0 },
        end: { line, character: 0 },
      },
    };
  } catch (error) {
    const log = new Logger('Navigation');
    log.debug('Module path resolution failed', {
      modulePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Resolve member access (variable->member) to its definition.
 * First resolves the variable's type, then finds the member within that type.
 */
export async function resolveMemberAccess(
  services: Services,
  expr: ExpressionInfo,
  cached: DocumentCacheEntry,
  _currentUri: string
): Promise<Location | null> {
  const { stdlibIndex } = services;

  if (!stdlibIndex || !expr.base || !expr.member) {
    return null;
  }

  try {
    // Find the base variable in local symbols to get its type
    const baseSymbol = cached.symbols?.find((s: PikeSymbol) => s.name === expr.base);
    let typeName: string | null = null;

    if (baseSymbol) {
      // Try to get type from introspection result
      if (baseSymbol.type) {
        const type = baseSymbol.type;
        if (type.kind === 'object' && type.className) {
          typeName = type.className;
        } else if (type.kind === 'program' && type.className) {
          typeName = type.className;
        }
      }
    }

    // If no type from symbol, try extracting from the first use
    if (!typeName && baseSymbol?.position) {
      // Could add more sophisticated type inference here
      // For now, try to find type annotations in the code
    }

    if (!typeName) {
      return null;
    }

    // Resolve the type module
    const moduleInfo = await stdlibIndex.getModule(typeName);
    if (!moduleInfo || !moduleInfo.symbols) {
      return null;
    }

    // Find the member in the module
    const memberSymbol = moduleInfo.symbols.get(expr.member);
    if (!memberSymbol) {
      return null;
    }

    // Use filePath (without line number) for the URI
    const filePath = moduleInfo.filePath ?? moduleInfo.resolvedPath;
    if (!filePath) {
      return null;
    }

    // Build URI from module path
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;

    // Use the module's line number (0-based) if available
    const line = moduleInfo.line ?? 0;
    return {
      uri,
      range: {
        start: { line, character: 0 },
        end: { line, character: expr.member.length },
      },
    };
  } catch (error) {
    const log = new Logger('Navigation');
    log.debug('Member access resolution failed', {
      base: expr.base,
      member: expr.member,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Resolve a module member (e.g., "Parser.Pike.split").
 * Resolves the base module, then finds the member within it.
 */
export async function resolveModuleMember(
  services: Services,
  expr: ExpressionInfo,
  _document: TextDocument
): Promise<Location | null> {
  const { stdlibIndex } = services;

  if (!stdlibIndex || !expr.base || !expr.member) {
    return null;
  }

  try {
    // Resolve the base module
    const moduleInfo = await stdlibIndex.getModule(expr.base);
    if (!moduleInfo || !moduleInfo.symbols) {
      return null;
    }

    // Find the member in the module
    const memberSymbol = moduleInfo.symbols.get(expr.member);
    if (!memberSymbol) {
      return null;
    }

    // Use filePath (without line number) for the URI
    const filePath = moduleInfo.filePath ?? moduleInfo.resolvedPath;
    if (!filePath) {
      return null;
    }

    // Build URI from module path
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;

    // Use the module's line number (0-based) if available
    const line = moduleInfo.line ?? 0;
    return {
      uri,
      range: {
        start: { line, character: 0 },
        end: { line, character: expr.member.length },
      },
    };
  } catch (error) {
    const log = new Logger('Navigation');
    log.debug('Module member resolution failed', {
      base: expr.base,
      member: expr.member,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
