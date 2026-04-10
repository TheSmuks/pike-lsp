/**
 * Bridge Query Engine API Methods
 *
 * Methods for the query engine v2: document lifecycle management,
 * configuration updates, workspace tracking, queries, and cancellation.
 * Also includes batch parsing with chunking support.
 */

import type { RequestSender } from './bridge-analysis.js';
import type {
  QueryEngineMutationAck,
  QueryEngineCancelAck,
  QueryEngineQueryResponse,
  QueryEngineSnapshotSelector,
} from './types.js';
import { BATCH_PARSE_MAX_SIZE } from './constants.js';

/**
 * PERF-007: Metrics for batch parse operations
 */
export interface BatchParseMetrics {
  totalMs: number;
  chunkingMs: number;
  ipcMs: number;
  chunkCount: number;
  fileCount: number;
}

// --- Document lifecycle ---

export async function engineOpenDocument(
  sender: RequestSender,
  params: {
    uri: string;
    languageId: string;
    version: number;
    text: string;
  }
): Promise<QueryEngineMutationAck> {
  return sender.sendRequest<QueryEngineMutationAck>('engine_open_document', params);
}

export async function engineChangeDocument(
  sender: RequestSender,
  params: {
    uri: string;
    version: number;
    changes: Array<Record<string, unknown>>;
  }
): Promise<QueryEngineMutationAck> {
  return sender.sendRequest<QueryEngineMutationAck>('engine_change_document', params);
}

export async function engineCloseDocument(
  sender: RequestSender,
  params: { uri: string }
): Promise<QueryEngineMutationAck> {
  return sender.sendRequest<QueryEngineMutationAck>('engine_close_document', params);
}

export async function engineUpdateConfig(
  sender: RequestSender,
  params: {
    settings: Record<string, unknown>;
  }
): Promise<QueryEngineMutationAck> {
  return sender.sendRequest<QueryEngineMutationAck>('engine_update_config', params);
}

export async function engineUpdateWorkspace(
  sender: RequestSender,
  params: {
    roots: string[];
    added: string[];
    removed: string[];
  }
): Promise<QueryEngineMutationAck> {
  return sender.sendRequest<QueryEngineMutationAck>('engine_update_workspace', params);
}

export async function engineQuery(
  sender: RequestSender,
  params: {
    feature: string;
    requestId: string;
    snapshot: QueryEngineSnapshotSelector;
    queryParams: Record<string, unknown>;
  }
): Promise<QueryEngineQueryResponse> {
  return sender.sendRequest<QueryEngineQueryResponse>('engine_query', params);
}

export async function engineCancelRequest(
  sender: RequestSender,
  params: { requestId: string }
): Promise<QueryEngineCancelAck> {
  return sender.sendRequest<QueryEngineCancelAck>('engine_cancel_request', params);
}

// --- Batch parsing ---

export async function batchParse(
  sender: RequestSender,
  files: Array<{ code: string; filename: string }>,
  onMetrics: (metrics: BatchParseMetrics) => void
): Promise<import('./types.js').BatchParseResult> {
  const totalStart = performance.now();
  const metrics: BatchParseMetrics = {
    totalMs: 0,
    chunkingMs: 0,
    ipcMs: 0,
    chunkCount: 0,
    fileCount: files.length,
  };

  // Limit batch size to prevent memory issues
  if (files.length > BATCH_PARSE_MAX_SIZE) {
    const chunkingStart = performance.now();
    const chunks: Array<typeof files> = [];
    for (let i = 0; i < files.length; i += BATCH_PARSE_MAX_SIZE) {
      chunks.push(files.slice(i, i + BATCH_PARSE_MAX_SIZE));
    }
    const chunkingEnd = performance.now();
    metrics.chunkingMs = chunkingEnd - chunkingStart;
    metrics.chunkCount = chunks.length;

    const allResults: import('./types.js').BatchParseFileResult[] = [];
    for (const chunk of chunks) {
      const ipcStart = performance.now();
      const result = await sender.sendRequest<import('./types.js').BatchParseResult>(
        'batch_parse',
        {
          files: chunk,
        }
      );
      const ipcEnd = performance.now();
      metrics.ipcMs += ipcEnd - ipcStart;
      allResults.push(...result.results);
    }

    metrics.totalMs = performance.now() - totalStart;
    onMetrics(metrics);

    return {
      results: allResults,
      count: allResults.length,
    };
  }

  // Single batch IPC
  const ipcStart = performance.now();
  const result = await sender.sendRequest<import('./types.js').BatchParseResult>('batch_parse', {
    files,
  });
  const ipcEnd = performance.now();

  metrics.totalMs = performance.now() - totalStart;
  metrics.ipcMs = ipcEnd - ipcStart;
  metrics.chunkCount = 1;
  onMetrics(metrics);

  return result;
}
