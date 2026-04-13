/**
 * Completion Member Access Resolution
 *
 * Handles completions for member access patterns:
 * - obj->meth (arrow access)
 * - Module.sub (dot access)
 * - Pike tokenizer-detected member_access / scope_access
 */
import { CompletionItem } from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from '../../services/index.js';
import type { DocumentCacheEntry } from '../../core/types.js';
import { buildCompletionItem, extractTypeName } from './completion-helpers.js';
import { getSymbolClassname } from './completion-scope.js';

/**
 * Try to resolve obj-> completions using a local symbol's type.
 * Returns completions if resolved, or null if the pattern doesn't match.
 * Used as a fallback when the Pike tokenizer does not detect member_access.
 */
export async function resolveArrowWorkaround(
  lineText: string,
  cursorChar: number,
  cached: DocumentCacheEntry | undefined,
  services: Services,
  documentCache: Services['documentCache'],
  completionContext: 'type' | 'expression',
  logger: Services['logger']
): Promise<CompletionItem[] | null> {
  const beforeCursor = lineText.substring(0, cursorChar);
  const arrowMatch = beforeCursor.match(/(\w+)\s*->\s*$/);
  if (!arrowMatch || !arrowMatch[1]) {
    return null;
  }

  const objectRef = arrowMatch[1];
  const prefixAfterCursor = lineText.substring(cursorChar).match(/^(\w*)/)?.[1] || '';
  logger.debug('Detected obj-> pattern (workaround fallback)', {
    objectRef,
    prefixAfterCursor,
    beforeCursor: beforeCursor.slice(-10),
  });

  if (!cached) return null;

  const localSymbol = cached.symbols.find(s => s.name === objectRef);
  if (!localSymbol?.type) return null;

  const typeName = extractTypeName(localSymbol.type);
  if (!typeName) return null;

  logger.debug('Extracted type from obj-> workaround', { objectRef, typeName });

  const completions: CompletionItem[] = [];

  // Try stdlib first
  const stdlibResult = await resolveMembersFromStdlib(
    typeName,
    prefixAfterCursor,
    services,
    completionContext,
    logger
  );
  if (stdlibResult) return stdlibResult;

  // Then try workspace documents
  const workspaceResult = resolveMembersFromWorkspace(
    typeName,
    prefixAfterCursor,
    documentCache,
    completionContext
  );
  if (workspaceResult) return workspaceResult;

  return completions;
}

/**
 * Try to resolve Module. completions (dot access workaround).
 * Returns completions if resolved, or null if not applicable.
 * Used as a fallback when the Pike tokenizer does not detect scope_access.
 */
export async function resolveModuleDotWorkaround(
  lineText: string,
  services: Services,
  completionContext: 'type' | 'expression',
  logger: Services['logger']
): Promise<CompletionItem[] | null> {
  const moduleDotMatch = lineText.match(/([A-Z][a-zA-Z0-9_]*)\.\s*$/);
  if (!moduleDotMatch || !moduleDotMatch[1] || !services.stdlibIndex) {
    return null;
  }

  const moduleName = moduleDotMatch[1];
  logger.debug('Detected Module. pattern (workaround fallback)', { moduleName, lineText });

  try {
    const testModule = await services.stdlibIndex.getModule(moduleName);
    if (testModule?.symbols && testModule.symbols.size > 0) {
      logger.debug('Module. workaround succeeded', {
        moduleName,
        count: testModule.symbols.size,
      });
      const completions: CompletionItem[] = [];
      for (const [name, symbol] of testModule.symbols) {
        completions.push(
          buildCompletionItem(name, symbol, `From ${moduleName}`, undefined, completionContext)
        );
      }
      return completions;
    }
  } catch (err) {
    logger.debug('Module. workaround failed', {
      moduleName,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}

export async function resolvePikeContextMemberAccess(
  pikeContext: import('@pike-lsp/pike-bridge').CompletionContext,
  cached: DocumentCacheEntry | undefined,
  services: Services,
  documentCache: Services['documentCache'],
  completionContext: 'type' | 'expression',
  logger: Services['logger']
): Promise<CompletionItem[] | null> {
  const objectRef = pikeContext.objectName;
  const prefix = pikeContext.prefix.trim();

  logger.debug('Member/scope access completion', {
    objectRef,
    operator: pikeContext.operator,
    prefix,
  });

  let typeName: string | null = null;

  // Strategy 1: Fully qualified module (e.g., "Stdio.File")
  if (objectRef.includes('.')) {
    typeName = objectRef;
    logger.debug('Using fully qualified name', { typeName });
  }
  // Strategy 2: Top-level stdlib module
  else if (services.stdlibIndex) {
    try {
      const testModule = await services.stdlibIndex.getModule(objectRef);
      if (testModule?.symbols && testModule.symbols.size > 0) {
        typeName = objectRef;
        logger.debug('Resolved as stdlib module', { typeName, count: testModule.symbols.size });
      }
    } catch (err) {
      logger.debug('Not a stdlib module', {
        objectRef,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Strategy 3: Look up local symbol type
  if (!typeName && cached) {
    const localSymbol = cached.symbols.find(s => s.name === objectRef);
    if (localSymbol?.type) {
      typeName = extractTypeName(localSymbol.type);
      logger.debug('Extracted type from local symbol', { objectRef, typeName });
    }
  }

  if (!typeName) {
    logger.debug('Could not resolve type for member access', { objectRef });
    return [];
  }

  // Try stdlib resolution
  const stdlibResult = await resolveMembersFromStdlib(
    typeName,
    prefix,
    services,
    completionContext,
    logger
  );
  if (stdlibResult) return stdlibResult;

  // Try workspace documents
  logger.debug('Searching workspace documents', { typeName });
  for (const [docUri, doc] of documentCache.entries()) {
    const classSymbol = doc.symbols.find(s => s.kind === 'class' && s.name === typeName);
    if (classSymbol) {
      logger.debug('Found class in workspace', {
        typeName,
        uri: docUri,
        childrenCount: classSymbol.children?.length || 0,
      });
      return resolveWorkspaceClassMembers(
        typeName,
        classSymbol,
        doc,
        prefix,
        completionContext,
        logger
      );
    }
  }

  logger.debug('Could not resolve type for member access', { objectRef });
  return [];
}

// ---- Internal helpers ----

async function resolveMembersFromStdlib(
  typeName: string,
  prefix: string,
  services: Services,
  completionContext: 'type' | 'expression',
  logger: Services['logger']
): Promise<CompletionItem[] | null> {
  if (!services.stdlibIndex) return null;

  try {
    const module = await services.stdlibIndex.getModule(typeName);
    if (module?.symbols) {
      logger.debug('Found stdlib type members', { typeName, count: module.symbols.size });
      const completions: CompletionItem[] = [];
      for (const [name, symbol] of module.symbols) {
        if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
          completions.push(
            buildCompletionItem(name, symbol, `From ${typeName}`, undefined, completionContext)
          );
        }
      }
      return completions;
    }
  } catch (err) {
    logger.debug('Type not in stdlib', {
      typeName,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}

function resolveMembersFromWorkspace(
  typeName: string,
  prefix: string,
  documentCache: Services['documentCache'],
  completionContext: 'type' | 'expression'
): CompletionItem[] | null {
  for (const [, doc] of documentCache.entries()) {
    const classSymbol = doc.symbols.find(s => s.kind === 'class' && s.name === typeName);
    if (classSymbol?.children) {
      const allMembers = collectClassMembers(classSymbol, doc);
      const completions: CompletionItem[] = [];

      for (const member of allMembers) {
        if (!member.name) continue;
        if (!prefix || member.name.toLowerCase().startsWith(prefix.toLowerCase())) {
          completions.push(
            buildCompletionItem(
              member.name,
              member,
              `Member of ${typeName}`,
              undefined,
              completionContext
            )
          );
        }
      }
      return completions;
    }
  }

  return null;
}
function resolveWorkspaceClassMembers(
  typeName: string,
  classSymbol: PikeSymbol,
  doc: DocumentCacheEntry,
  prefix: string,
  completionContext: 'type' | 'expression',
  logger: Services['logger']
): CompletionItem[] {
  const allMembers = collectClassMembers(classSymbol, doc);
  logger.debug('Class members from parse', { typeName, count: allMembers.length });

  // Build deprecated lookup from introspection
  const deprecatedMap = new Map<string, boolean>();
  if (doc.introspection?.symbols) {
    for (const sym of doc.introspection.symbols) {
      if (sym.deprecated || sym.documentation?.deprecated) {
        deprecatedMap.set(sym.name, true);
      }
    }
  }

  const completions: CompletionItem[] = [];
  for (const member of allMembers) {
    if (!member.name) continue;
    if (!prefix || member.name.toLowerCase().startsWith(prefix.toLowerCase())) {
      const isDeprecated =
        member.deprecated || deprecatedMap.has(member.name) || member.documentation?.deprecated;
      const memberWithDeprecated =
        isDeprecated && !member.deprecated ? { ...member, deprecated: true } : member;

      completions.push(
        buildCompletionItem(
          member.name,
          memberWithDeprecated,
          `Member of ${typeName}`,
          undefined,
          completionContext
        )
      );
    }
  }
  return completions;
}

/**
 * Collect all members from a class symbol, including inherited members.
 */
function collectClassMembers(classSymbol: PikeSymbol, doc: DocumentCacheEntry): PikeSymbol[] {
  const allMembers: PikeSymbol[] = [];

  // Add direct members (skip inherit statements)
  for (const member of classSymbol.children || []) {
    if (member.kind !== 'inherit') {
      allMembers.push(member);
    }
  }

  // Add inherited members: resolve parent classes in the same document
  const inheritChildren = (classSymbol.children || []).filter(c => c.kind === 'inherit');
  for (const inheritChild of inheritChildren) {
    const parentClassName = getSymbolClassname(inheritChild) ?? inheritChild.name;
    if (parentClassName) {
      const parentClass = doc.symbols.find(s => s.kind === 'class' && s.name === parentClassName);
      if (parentClass?.children) {
        for (const parentMember of parentClass.children) {
          if (parentMember.kind !== 'inherit' && parentMember.name) {
            allMembers.push({
              ...parentMember,
              inherited: true,
              inheritedFrom: parentClassName,
            });
          }
        }
      }
    }
  }

  return allMembers;
}
