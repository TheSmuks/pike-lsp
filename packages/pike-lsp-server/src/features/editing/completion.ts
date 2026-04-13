/**
 * Code Completion Handler
 *
 * Provides code completion suggestions for Pike code.
 * Delegates to:
 * - completion-qe.ts — query engine path + shared helpers
 * - completion-scope.ts — :: scope operator resolution
 * - completion-member-access.ts — obj->, Module., member access
 * - completion-resolve.ts — onCompletionResolve handler
 * - completion-auto-import.ts — auto-import suggestions
 * - completion-symbols.ts — general symbol resolution + builtins
 * - completion-helpers.ts — shared item building utilities
 */

import {
  Connection,
  CompletionItem,
  CompletionItemKind,
  CompletionList,
  TextDocuments,
  MarkupKind,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import { getAutoDocCompletion } from './autodoc.js';
import { PIKE_PREDEFINED_MACROS } from '../navigation/keywords.js';
import { provideRoxenCompletions } from '../roxen/index.js';
import { RequestScheduler } from '../../services/request-scheduler.js';
import {
  detectRXMLStrings,
  findRXMLStringAtPosition,
  getRXMLTagCompletions,
  getRXMLAttributeCompletions,
} from '../rxml/mixed-content.js';
import { toSchedulerMetricsLogPayload } from '../utils/scheduler-metrics.js';
import { resolveScopeCompletions } from './completion-scope.js';
import { resolvePikeContextMemberAccess } from './completion-member-access.js';
import { registerCompletionResolveHandler } from './completion-resolve.js';
import {
  handleQueryEngineCompletion,
  getWordAtPosition,
  getCompletionContext,
} from './completion-qe.js';
import { addAutoImportCompletions } from './completion-auto-import.js';

/** Regex to match a Pike scoped access expression (e.g., Module::member). */
const SCOPED_ACCESS = /([\w.]+)::(\w*)$/;

import { collectGeneralCompletions, addBuiltinCompletions } from './completion-symbols.js';

const useQueryEngineCompletions = process.env['PIKE_LSP_QE2_COMPLETION'] !== '0';

/**
 * Add Pike predefined macros to completions.
 */
function addMacrosToCompletions(
  completions: CompletionItem[],
  existingNames: Set<string>,
  prefix: string
): void {
  const prefixLower = prefix.toLowerCase();
  for (const macro of PIKE_PREDEFINED_MACROS) {
    if (existingNames.has(macro.name)) continue;
    if (prefix && !macro.name.toLowerCase().startsWith(prefixLower)) continue;
    completions.push({
      label: macro.name,
      kind: CompletionItemKind.Constant,
      detail: `${macro.expandedValue} — Pike predefined macro`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `**${macro.name}** — ${macro.description}\n\nExpanded type: \`${macro.expandedValue}\``,
      },
    });
    existingNames.add(macro.name);
  }
}

/**
 * Register code completion handlers.
 */
export function registerCompletionHandlers(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { logger, documentCache, moduleContext } = services;
  const completionScheduler = new RequestScheduler({ logger });
  const COMPLETION_SCHEDULER_LOG_EVERY = 50;
  let completionRequestsObserved = 0;

  function maybeLogCompletionSchedulerMetrics(uri: string, outcome: string): void {
    completionRequestsObserved += 1;
    if (completionRequestsObserved % COMPLETION_SCHEDULER_LOG_EVERY !== 0) return;
    const schedulerMetrics = completionScheduler.snapshotMetrics();
    logger.debug('Completion scheduler metrics', {
      uri,
      outcome,
      samples: completionRequestsObserved,
      ...toSchedulerMetricsLogPayload(schedulerMetrics),
    });
  }

  function toCompletionList(items: CompletionItem[]): CompletionList {
    return { isIncomplete: items.length > 50, items };
  }

  function dedupeCompletionItems(items: CompletionItem[]): CompletionItem[] {
    const seen = new Set<string>();
    const deduped: CompletionItem[] = [];
    for (const item of items) {
      const key = `${item.label}:${item.kind ?? 0}:${item.detail ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }
    return deduped;
  }

  interface CompletionTrigger {
    kind: 'invoked' | 'triggerCharacter' | 'triggerForIncomplete';
    character?: string;
  }

  function parseCompletionTrigger(context?: {
    triggerKind: number;
    triggerCharacter?: string;
  }): CompletionTrigger {
    if (!context) return { kind: 'invoked' };
    if (context.triggerKind === 2 && context.triggerCharacter) {
      return { kind: 'triggerCharacter', character: context.triggerCharacter };
    } else if (context.triggerKind === 3) {
      return { kind: 'triggerForIncomplete' };
    }
    return { kind: 'invoked' };
  }

  /**
   * Code completion handler
   */
  connection.onCompletion(async (params, cancellationToken): Promise<CompletionList> => {
    const bridge = services.bridge;
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const cached = documentCache.get(uri);

    if (!document) {
      logger.debug('Completion request - no document found', { uri });
      return toCompletionList([]);
    }

    if (cancellationToken?.isCancellationRequested) {
      return toCompletionList([]);
    }

    // Try query engine path
    if (useQueryEngineCompletions) {
      const qeResult = await handleQueryEngineCompletion(
        params,
        document,
        uri,
        cached,
        cancellationToken,
        services,
        completionScheduler,
        toCompletionList,
        dedupeCompletionItems,
        (completions, p) => addAutoImportCompletions(completions, p, services),
        addMacrosToCompletions,
        maybeLogCompletionSchedulerMetrics
      );
      if (qeResult) return qeResult;
    }

    if (!cached) {
      logger.debug('Completion request - no cached document', { uri });
      return toCompletionList([]);
    }

    logger.debug('Completion request', { uri, symbolCount: cached.symbols.length });

    const trigger = parseCompletionTrigger(params.context);
    logger.debug('Completion trigger', { trigger });

    const completions: CompletionItem[] = [];
    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // AutoDoc trigger
    const autoDocItems = getAutoDocCompletion(document, params.position);
    if (autoDocItems.length > 0) {
      return toCompletionList(autoDocItems);
    }

    logger.debug('Completion triggered', {
      kind: trigger.kind,
      character: trigger.character,
      uri: params.textDocument.uri,
      position: params.position,
    });

    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineText = text.slice(lineStart, offset);
    const completionContext = getCompletionContext(lineText);
    logger.debug('Completion context', {
      context: completionContext,
      lineText: lineText.slice(-50),
    });

    // Type attribute completion: __attribute__(...)
    const attributeArgMatch = lineText.match(/__attribute__\(\s*"?([a-zA-Z_]*)$/);
    if (attributeArgMatch) {
      const attrPrefix = (attributeArgMatch[1] ?? '').toLowerCase();
      for (const attr of ['deprecated', 'experimental', 'unused', 'strict_types']) {
        if (!attrPrefix || attr.startsWith(attrPrefix)) {
          completions.push({
            label: attr,
            kind: CompletionItemKind.Property,
            detail: 'Pike type attribute',
            insertText: `"${attr}"`,
          });
        }
      }
      return toCompletionList(completions);
    }

    // Scope operator (::)
    const scopeMatch = lineText.match(SCOPED_ACCESS);
    if (scopeMatch) {
      const scopeName = scopeMatch[1] ?? '';
      const prefix = scopeMatch[2] ?? '';
      logger.debug('Scope access completion', { scopeName, prefix });

      const scopeCompletions = await resolveScopeCompletions(
        scopeName,
        prefix,
        cached,
        services,
        params.position.line,
        completionContext,
        logger
      );
      if (scopeCompletions) {
        return toCompletionList(scopeCompletions);
      }
    }

    // Pike tokenizer context
    let pikeContext: import('@pike-lsp/pike-bridge').CompletionContext | null = null;
    if (bridge) {
      try {
        pikeContext = await bridge.getCompletionContext(
          text,
          params.position.line + 1,
          params.position.character,
          uri,
          document.version
        );
        logger.debug('Pike completion context', { context: pikeContext });
      } catch (err) {
        logger.debug('Failed to get Pike context', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Pike tokenizer member/scope access
    if (pikeContext?.context === 'member_access' || pikeContext?.context === 'scope_access') {
      const memberResult = await resolvePikeContextMemberAccess(
        pikeContext,
        cached,
        services,
        documentCache,
        completionContext,
        logger
      );
      if (memberResult) {
        return toCompletionList(memberResult);
      }
      return toCompletionList([]);
    }
    // General completion
    const generalCompletions = await collectGeneralCompletions(
      text,
      offset,
      uri,
      cached,
      services,
      { logger, documentCache, moduleContext }
    );
    completions.push(...generalCompletions);

    // Roxen/RXML completion
    try {
      if (bridge) {
        const rxmlStrings = await detectRXMLStrings(text, uri, bridge);
        const inRXMLString = findRXMLStringAtPosition(params.position, rxmlStrings);

        if (inRXMLString) {
          logger.debug('Completion inside RXML string', {
            confidence: inRXMLString.confidence,
            markerCount: inRXMLString.markers.length,
          });

          const beforeCursorInString = getBeforeCursorInRXMLString(text, offset, inRXMLString);

          const tagMatch = beforeCursorInString.match(/<([a-z0-9_]*)$/i);
          if (tagMatch) {
            const tagNames = getRXMLTagCompletions(inRXMLString, params.position);
            for (const tagName of tagNames) {
              completions.push({
                label: tagName,
                kind: CompletionItemKind.Function,
                detail: 'RXML tag',
              });
            }
            return toCompletionList(completions);
          }

          const attrMatch = beforeCursorInString.match(/<[a-z0-9_]+\s+([a-z0-9_]*)$/i);
          if (attrMatch) {
            const tagNameMatch = beforeCursorInString.match(/<([a-z0-9_]+)/);
            if (tagNameMatch) {
              const tagName = tagNameMatch[1] ?? '';
              const attrNames = getRXMLAttributeCompletions(tagName);
              for (const attrName of attrNames) {
                completions.push({
                  label: attrName,
                  kind: CompletionItemKind.Property,
                  detail: `RXML attribute for <${tagName}>`,
                });
              }
              return toCompletionList(completions);
            }
          }
        }
      }

      const roxenCompletions = provideRoxenCompletions(lineText, params.position);
      if (roxenCompletions && roxenCompletions.length > 0) {
        completions.push(...roxenCompletions);
      }
    } catch (err) {
      logger.debug('Roxen/RXML completion failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Built-in keywords and types
    const prefix = await getWordAtPosition(
      text,
      offset,
      services.bridge?.tokenize ? (t: string) => services.bridge!.tokenize(t) : async () => []
    );
    addBuiltinCompletions(completions, prefix);

    await addAutoImportCompletions(
      completions,
      {
        uri,
        prefix,
        text,
        lineText,
        localSymbols: cached.symbols,
      },
      services
    );

    const existingNames = new Set(completions.map(c => c.label));
    addMacrosToCompletions(completions, existingNames, prefix ?? '');
    return toCompletionList(dedupeCompletionItems(completions));
  });

  // Register the resolve handler
  registerCompletionResolveHandler(connection, services);
}

/** Get the text before cursor position within an RXML string */
function getBeforeCursorInRXMLString(
  text: string,
  offset: number,
  rxmlString: import('../rxml/mixed-content.js').RXMLStringLiteral
): string {
  const stringStartOffset = text.indexOf(rxmlString.content, Math.max(0, offset - 1000));
  if (stringStartOffset < 0) return '';

  const contentOffset = offset - stringStartOffset;
  if (contentOffset < 0 || contentOffset > rxmlString.content.length) return '';

  return rxmlString.content.slice(0, contentOffset);
}
