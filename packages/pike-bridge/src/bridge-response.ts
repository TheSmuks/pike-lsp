/**
 * Bridge Response Handling
 *
 * Internal helpers for processing JSON-RPC responses from the Pike subprocess.
 * Handles response parsing, error detection, analyze response unwrapping,
 * and performance metadata attachment.
 */

import { PikeError } from '@pike-lsp/core';
import type { PikeResponse } from './types.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export type { PendingRequest };

/**
 * Reject a pending request with a PikeError wrapping the original message.
 */
export function rejectPendingRequest(pending: PendingRequest, message: string): void {
  const error = new PikeError(message || 'Pike request failed', new Error(message));
  pending.reject(error);
}

/**
 * Check if response is an analyze response (contains failures object).
 */
export function isAnalyzeResponse(response: PikeResponse): boolean {
  return (
    'failures' in response &&
    typeof (response as PikeResponse & { failures?: unknown }).failures === 'object'
  );
}

/**
 * Attach performance metadata to a result object if applicable.
 */
export function attachPerformanceMetadata(result: unknown, perf: Record<string, unknown>): void {
  if (typeof result === 'object' && result !== null && Object.keys(perf).length > 0) {
    (result as Record<string, unknown>)['_perf'] = perf;
  }
}

/**
 * Build the result object from a Pike response, attaching _perf metadata.
 */
export function buildResponseResult(response: PikeResponse): unknown {
  const perf = (response as PikeResponse & { _perf?: Record<string, unknown> })._perf || {};
  const result = response.result;

  if (isAnalyzeResponse(response)) {
    const fullResponse = {
      result,
      failures: (response as PikeResponse & { failures?: Record<string, unknown> }).failures || {},
      _perf: perf,
    };
    // Copy _perf into result as well for backward compatibility
    attachPerformanceMetadata(fullResponse.result, perf);
    return fullResponse;
  }

  // For other requests, return the result with _perf attached
  attachPerformanceMetadata(result, perf);
  return result;
}
