/**
 * Pull Diagnostics Request Handlers
 *
 * Handles LSP pull diagnostic requests (textDocument/diagnostic and workspace/diagnostic).
 * These support the diagnostic pull model where the client requests diagnostics on demand.
 *
 * Extracted from index.ts for maintainability (Issue #1289).
 */

import type {
  Connection,
  DocumentDiagnosticParams,
  WorkspaceDiagnosticParams,
  WorkspaceDocumentDiagnosticReport,
} from 'vscode-languageserver/node.js';
import type { DocumentCache } from '../../services/document-cache.js';
import type { WorkspaceIndex } from '../../workspace-index.js';
import { toProtocolDiagnostics } from '../../services/protocol-mappers.js';

interface PullDiagnosticState {
  pullDiagnosticResultIds: Map<string, string>;
}

/**
 * Compute a result ID for pull diagnostics based on cache state.
 * Used to determine if diagnostics have changed since the last pull.
 */
function computePullDiagnosticResultId(uri: string, documentCache: DocumentCache): string {
  const cached = documentCache.get(uri);
  const versionPart = cached?.version ?? 0;
  const hashPart = cached?.contentHash ?? `diag-${cached?.diagnostics.length ?? 0}`;
  return `${versionPart}:${hashPart}`;
}

/**
 * Register LSP pull diagnostic request handlers on the connection.
 * Supports both document-level and workspace-level pull diagnostics.
 */
export function registerPullDiagnosticHandlers(
  connection: Connection,
  documentCache: DocumentCache,
  workspaceIndex: WorkspaceIndex,
  state: PullDiagnosticState
): void {
  connection.onRequest('textDocument/diagnostic', async params => {
    const requestParams = (params ?? {}) as DocumentDiagnosticParams;
    const uri = requestParams.textDocument?.uri;
    if (!uri) {
      return { kind: 'full', items: [], resultId: '0:diag-0' };
    }

    await documentCache.waitFor(uri);
    const cached = documentCache.get(uri);
    const resultId = computePullDiagnosticResultId(uri, documentCache);
    state.pullDiagnosticResultIds.set(uri, resultId);

    if (requestParams.previousResultId && requestParams.previousResultId === resultId) {
      return {
        kind: 'unchanged',
        resultId,
      };
    }

    return {
      kind: 'full',
      items: toProtocolDiagnostics(cached?.diagnostics ?? []),
      resultId,
    };
  });

  connection.onRequest('workspace/diagnostic', async params => {
    const requestParams = (params ?? {}) as WorkspaceDiagnosticParams;
    const previousByUri = new Map<string, string>();
    const previousResultIds = Array.isArray(requestParams.previousResultIds)
      ? requestParams.previousResultIds
      : [];

    for (const previous of previousResultIds) {
      const uri = previous?.uri;
      const resultId = previous?.value;
      if (typeof uri === 'string' && typeof resultId === 'string') {
        previousByUri.set(uri, resultId);
      }
    }

    const uris = new Set<string>();
    for (const uri of documentCache.keys()) {
      uris.add(uri);
    }

    for (const uri of workspaceIndex.getAllDocumentUris()) {
      uris.add(uri);
    }

    const items: WorkspaceDocumentDiagnosticReport[] = [];
    for (const uri of uris) {
      await documentCache.waitFor(uri);
      const cached = documentCache.get(uri);
      const resultId = computePullDiagnosticResultId(uri, documentCache);
      state.pullDiagnosticResultIds.set(uri, resultId);

      if (previousByUri.get(uri) === resultId) {
        items.push({
          uri,
          version: cached?.version ?? null,
          kind: 'unchanged',
          resultId,
        });
      } else {
        items.push({
          uri,
          version: cached?.version ?? null,
          kind: 'full',
          items: toProtocolDiagnostics(cached?.diagnostics ?? []),
          resultId,
        });
      }
    }

    return { items };
  });
}
