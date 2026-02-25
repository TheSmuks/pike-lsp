# Pike Query Engine v2 Protocol Specification

Status: Draft

Last Updated: 2026-02-24

## Purpose

Define the wire contract between the TypeScript LSP adapter and Pike query engine for snapshot-based, cancellable, deterministic query execution.

## Design Principles

- Pike is authoritative for semantic state.
- All mutations are explicit and serialized through host APIs.
- All reads are snapshot-based and side-effect free.
- Request/response correlation is mandatory.
- Cancellation must be propagated and observable.

## Terms

- `revision`: monotonic engine input-state version.
- `snapshotId`: immutable read view identifier derived from revisioned host state.
- `requestId`: unique request correlation id from adapter.

## Envelope

All protocol messages use a JSON-RPC-like envelope:

```json
{
  "id": 123,
  "method": "engine/query/definition",
  "params": {}
}
```

Responses:

```json
{
  "id": 123,
  "result": {},
  "error": null
}
```

## Mutation Methods

### engine/openDocument

Input:

```json
{
  "uri": "file:///ws/src/main.pike",
  "languageId": "pike",
  "version": 1,
  "text": "..."
}
```

Output:

```json
{
  "revision": 41,
  "snapshotId": "snp-41"
}
```

### engine/changeDocument

Input:

```json
{
  "uri": "file:///ws/src/main.pike",
  "version": 2,
  "changes": [
    {
      "range": { "start": { "line": 10, "character": 4 }, "end": { "line": 10, "character": 9 } },
      "text": "newName"
    }
  ]
}
```

Output:

```json
{
  "revision": 42,
  "snapshotId": "snp-42"
}
```

### engine/closeDocument

Input:

```json
{
  "uri": "file:///ws/src/main.pike"
}
```

Output:

```json
{
  "revision": 43,
  "snapshotId": "snp-43"
}
```

### engine/updateConfig

Input:

```json
{
  "settings": {
    "includePaths": ["/ws/include"],
    "modulePaths": ["/ws/modules"]
  }
}
```

Output:

```json
{
  "revision": 44,
  "snapshotId": "snp-44"
}
```

### engine/updateWorkspace

Input:

```json
{
  "roots": ["file:///ws"],
  "added": ["file:///ws/new_file.pike"],
  "removed": []
}
```

Output:

```json
{
  "revision": 45,
  "snapshotId": "snp-45"
}
```

## Query Methods

Query methods follow naming:

- `engine/query/diagnostics`
- `engine/query/definition`
- `engine/query/references`
- `engine/query/completion`
- `engine/query/hover`

Request shape:

```json
{
  "requestId": "req-abc-123",
  "snapshot": {
    "mode": "latest"
  },
  "params": {
    "uri": "file:///ws/src/main.pike",
    "position": { "line": 12, "character": 8 }
  }
}
```

Alternate snapshot mode:

```json
{
  "requestId": "req-abc-124",
  "snapshot": {
    "mode": "fixed",
    "snapshotId": "snp-45"
  },
  "params": {}
}
```

Response shape:

```json
{
  "requestId": "req-abc-123",
  "snapshotIdUsed": "snp-45",
  "result": {},
  "metrics": {
    "durationMs": 8.4,
    "cache": {
      "hit": true
    }
  }
}
```

## Cancellation

### engine/cancelRequest

Input:

```json
{
  "requestId": "req-abc-123",
  "reason": "client_cancel"
}
```

Output:

```json
{
  "accepted": true
}
```

Rules:

- Cancellation must be checked at cooperative query checkpoints.
- Canceled work may return a cancellation error but must not publish normal result payloads.
- Adapter must treat cancellation as terminal for that `requestId`.

## Error Model

Error payload:

```json
{
  "code": "CANCELLED",
  "message": "Request cancelled",
  "requestId": "req-abc-123",
  "snapshotIdUsed": "snp-45",
  "details": {}
}
```

Standard codes:

- `CANCELLED`
- `INVALID_PARAMS`
- `SNAPSHOT_NOT_FOUND`
- `ENGINE_BUSY`
- `INTERNAL_ERROR`

## Adapter Rules

- Attach unique `requestId` to every query.
- Track latest known `snapshotId` per request stream.
- Drop stale responses where `snapshotIdUsed` is older than stream target.
- Never synthesize semantic data in adapter layer.
- Log all drops and cancellation outcomes with correlation ids.

## Versioning and Compatibility

- Protocol name: `query-engine-v2`.
- Handshake capability includes protocol version.
- New fields must be additive and optional by default.
- Breaking changes require version bump.

## Telemetry Contract

Every query response should emit:

- `requestId`
- `revision` or `snapshotIdUsed`
- duration
- cancellation status
- cache hit/miss
- queue wait time (if queued)

## Acceptance Tests for Protocol

1. Snapshot monotonicity under rapid `changeDocument`.
2. Deterministic response for same fixed snapshot inputs.
3. Cancellation prevents normal result publication.
4. Stale response dropping under overlapping requests.
5. Version negotiation rejects incompatible protocol peers.
