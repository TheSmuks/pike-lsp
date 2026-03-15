import type { RequestSchedulerMetrics } from '../../services/request-scheduler.js';

export function toSchedulerMetricsLogPayload(
  schedulerMetrics: RequestSchedulerMetrics
): Record<string, unknown> {
  return {
    maxConcurrent: schedulerMetrics.maxConcurrent,
    activeWorkers: schedulerMetrics.activeWorkers,
    queueDepth: schedulerMetrics.queueDepth,
    inFlightByClass: schedulerMetrics.inFlightByClass,
    scheduled: schedulerMetrics.scheduled,
    started: schedulerMetrics.started,
    completed: schedulerMetrics.completed,
    failed: schedulerMetrics.failed,
    canceled: schedulerMetrics.canceled,
  };
}
