import type { ProtocolInfo } from '@pike-lsp/pike-bridge';

export const QUERY_ENGINE_PROTOCOL = 'query-engine-v2';
export const QUERY_ENGINE_MAJOR_VERSION = 2;

export interface SnapshotRef {
  snapshotId: string;
}

export interface RevisionRef {
  revision: number;
}

export interface MutationAck extends SnapshotRef, RevisionRef {}

export interface QueryMeta extends SnapshotRef {
  requestId: string;
}

export function isProtocolCompatible(info: ProtocolInfo): boolean {
  return info.protocol === QUERY_ENGINE_PROTOCOL && info.major === QUERY_ENGINE_MAJOR_VERSION;
}

export function formatProtocolVersion(info: ProtocolInfo): string {
  return `${info.protocol}@${info.version}`;
}
