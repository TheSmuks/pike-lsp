/**
 * Completion Scope Resolution
 *
 * Handles :: scope operator completions (this_program::, this::, ParentClass::).
 */

import { CompletionItem } from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from '../../services/index.js';
import { buildCompletionItem } from './completion-helpers.js';

/**
 * Get the classname field from a Pike symbol, if present.
 */
export function getSymbolClassname(symbol: PikeSymbol): string | undefined {
  if ('classname' in symbol && typeof symbol.classname === 'string') {
    return symbol.classname;
  }
  return undefined;
}

/**
 * Resolve scope-access completions for the :: operator.
 *
 * Handles:
 * - `this_program::` / `this::` — local class members
 * - `ParentClass::` — members from a named parent class (stdlib)
 *
 * Returns completions array, or null if the scope cannot be resolved.
 */
export async function resolveScopeCompletions(
  scopeName: string,
  prefix: string,
  cached: { symbols: PikeSymbol[] } | undefined,
  services: Services,
  cursorLine: number,
  completionContext: 'type' | 'expression',
  logger: Services['logger']
): Promise<CompletionItem[] | null> {
  if (scopeName === 'this_program' || scopeName === 'this') {
    return resolveThisProgramScope(prefix, cached, services, cursorLine, completionContext, logger);
  }

  // ParentClass:: — resolve from stdlib
  if (services.stdlibIndex) {
    try {
      const parentModule = await services.stdlibIndex.getModule(scopeName);
      if (parentModule?.symbols) {
        const completions: CompletionItem[] = [];
        for (const [name, symbol] of parentModule.symbols) {
          if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
            completions.push(
              buildCompletionItem(name, symbol, `From ${scopeName}`, undefined, completionContext)
            );
          }
        }
        return completions;
      }
    } catch (err) {
      logger.debug('Failed to resolve scope module', {
        scopeName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return null;
}

/**
 * Resolve this_program:: / this:: scope — show local class members.
 */
async function resolveThisProgramScope(
  prefix: string,
  cached: { symbols: PikeSymbol[] } | undefined,
  services: Services,
  cursorLine: number,
  completionContext: 'type' | 'expression',
  logger: Services['logger']
): Promise<CompletionItem[]> {
  const completions: CompletionItem[] = [];

  if (!cached) {
    logger.debug('[COMPLETION:Q.1] Document not cached for this_program::');
    return completions;
  }

  const classSymbols = cached.symbols.filter(s => s.kind === 'class');
  const enclosingClass = findEnclosingClassSymbol(cached.symbols, cursorLine);

  logger.debug('[COMPLETION:Q.1] this_program:: scope resolution', {
    cursorLine,
    totalSymbols: cached.symbols.length,
    classCount: classSymbols.length,
    classes: classSymbols.map(c => ({
      name: c.name,
      positionLine: c.position?.line,
      hasChildren: !!c.children,
      childrenCount: c.children?.length ?? 0,
    })),
    foundEnclosingClass: enclosingClass
      ? {
          name: enclosingClass.name,
          hasChildren: !!enclosingClass.children,
          childrenCount: enclosingClass.children?.length ?? 0,
        }
      : null,
  });

  if (enclosingClass && enclosingClass.kind === 'class' && enclosingClass.children) {
    logger.debug('[COMPLETION:Q.1] Found enclosing class for this_program::', {
      className: enclosingClass.name,
      memberCount: enclosingClass.children.length,
    });

    for (const member of enclosingClass.children) {
      if (!member.name) continue;
      if (member.kind === 'inherit') continue;

      if (!prefix || member.name.toLowerCase().startsWith(prefix.toLowerCase())) {
        completions.push(
          buildCompletionItem(member.name, member, 'Local member', undefined, completionContext)
        );
      }
    }

    // Add inherited members from parent classes
    const inherits = enclosingClass.children.filter(s => s.kind === 'inherit');
    if (services.stdlibIndex) {
      for (const inheritSymbol of inherits) {
        const parentName = getSymbolClassname(inheritSymbol) ?? inheritSymbol.name;
        if (parentName) {
          try {
            const parentModule = await services.stdlibIndex.getModule(parentName);
            if (parentModule?.symbols) {
              for (const [name, symbol] of parentModule.symbols) {
                if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
                  completions.push(
                    buildCompletionItem(
                      name,
                      symbol,
                      `Inherited from ${parentName}`,
                      undefined,
                      completionContext
                    )
                  );
                }
              }
            }
          } catch (err) {
            logger.debug('Failed to get inherited members', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }
  } else {
    logger.debug('[COMPLETION:Q.1] No enclosing class found for this_program::', {
      line: cursorLine,
      hasEnclosingClass: !!enclosingClass,
      isClass: enclosingClass?.kind === 'class',
      hasChildren: !!enclosingClass?.children,
    });
  }

  return completions;
}

/**
 * Find the enclosing class symbol that contains the given line position.
 * Returns the class symbol if found, null otherwise.
 *
 * Strategy:
 * 1. If position has line info: Find class with latest start line still <= cursor line
 * 2. Fallback: Return the most recent/last class in the symbol list
 */
export function findEnclosingClassSymbol(symbols: PikeSymbol[], line: number): PikeSymbol | null {
  let bestMatch: PikeSymbol | null = null;
  let bestMatchLine = -1;
  let lastClass: PikeSymbol | null = null;

  for (const symbol of symbols) {
    if (symbol.kind === 'class' && symbol.name) {
      lastClass = symbol;

      if (symbol.position) {
        const startLine = (symbol.position.line ?? 1) - 1; // Convert to 0-indexed

        if (startLine <= line && startLine > bestMatchLine) {
          bestMatch = symbol;
          bestMatchLine = startLine;
        }
      }
    }
  }

  const enclosingClass = bestMatch || lastClass;

  // Check for nested classes
  if (enclosingClass && enclosingClass.children) {
    const nestedClass = findEnclosingClassSymbol(enclosingClass.children, line);
    return nestedClass || enclosingClass;
  }

  return enclosingClass;
}
