# Pike Query Engine v2 Protocol Specification

Status: Active (Accepted)

Protocol Version: 2.0.0

Last Updated: 2026-04-02

## Purpose

Define the ratified wire contract between the TypeScript LSP adapter and Pike query engine for snapshot-based, cancellable, deterministic query execution.

## Ratification Artifacts

- Protocol contract snapshot: `docs/specs/query-engine-v2-protocol-contract.v2.0.0.json`
- Acceptance tests: `packages/pike-bridge/src/bridge.test.ts` (`query-engine-v2 protocol acceptance` block)

## Design Principles (Normative)

1. Pike remains authoritative for semantic state.
2. Mutations are explicit and serialized through one revision clock.
3. Reads are snapshot-based and side-effect free.
4. Correlation ids and cancellation are mandatory.

## Version Handshake (Normative)

Handshake method is `get_protocol_info`.

Request envelope:

```json
{
  "id": 1,
  "method": "get_protocol_info",
  "params": {}
}
```

Response envelope:

```json
{
  "id": 1,
  "result": {
    "protocol": "query-engine-v2",
    "version": "2.0.0",
    "major": 2,
    "minor": 0,
    "build_id": "<string>",
    "capabilities": ["snapshot", "cancellation", "analyze"]
  }
}
```

Compatibility rule:

- Adapter must require `protocol === "query-engine-v2"` and `major === 2`.
- `minor` and additional fields are additive-compatible.
- Mismatched major is incompatible and must be rejected.

## Base Envelope

All RPC calls use:

```json
{
  "id": 123,
  "method": "<method_name>",
  "params": { "...": "..." }
}
```

Success response:

```json
{
  "id": 123,
  "result": { "...": "..." }
}
```

Top-level error response (used for cancellation path):

```json
{
  "id": 123,
  "error": {
    "code": -32800,
    "message": "Request cancelled"
  }
}
```

## Concrete Message Schemas

### 1) Mutations

Methods:

- `engine_open_document`
- `engine_change_document`
- `engine_close_document`
- `engine_update_config`
- `engine_update_workspace`

Mutation ack schema (all mutation methods):

```json
{
  "revision": 42,
  "snapshotId": "snp-42"
}
```

Required constraints:

- `revision`: integer >= 1
- `snapshotId`: string matching `^snp-[0-9]+$`

Input examples:

```json
{
  "id": 10,
  "method": "engine_open_document",
  "params": {
    "uri": "file:///ws/src/main.pike",
    "languageId": "pike",
    "version": 1,
    "text": "int x = 1;\n"
  }
}
```

```json
{
  "id": 11,
  "method": "engine_change_document",
  "params": {
    "uri": "file:///ws/src/main.pike",
    "version": 2,
    "changes": [
      {
        "range": {
          "start": { "line": 0, "character": 4 },
          "end": { "line": 0, "character": 5 }
        },
        "text": "y"
      }
    ]
  }
}
```

### 2) Queries

Method: `engine_query`

Request params schema:

```json
{
  "feature": "completion",
  "requestId": "req-abc-123",
  "snapshot": {
    "mode": "latest"
  },
  "queryParams": {
    "uri": "file:///ws/src/main.pike",
    "filename": "/ws/src/main.pike",
    "version": 2,
    "position": { "line": 0, "character": 1 }
  }
}
```

Supported snapshot selectors:

- `{"mode":"latest"}`
- `{"mode":"fixed","snapshotId":"snp-42"}`

Response schema:

```json
{
  "requestId": "req-abc-123",
  "snapshotIdUsed": "snp-42",
  "result": {
    "feature": "completion",
    "revision": 42,
    "items": [{ "label": "foo" }]
  },
  "metrics": {
    "durationMs": 8.4
  }
}
```

### 3) Cancellation

Method: `engine_cancel_request`

Request params schema:

```json
{
  "requestId": "req-abc-123"
}
```

Ack schema:

```json
{
  "accepted": true
}
```

Cancellation result semantics:

- Canceled query path responds with top-level JSON-RPC error `code = -32800`.
- Normal `result` payload must not be published for that canceled request id.

## Error Model

Two currently ratified error forms:

1. **Top-level numeric JSON-RPC error** (currently cancellation):
   - `-32800` (`Request cancelled`)
2. **Result-envelope string code** (domain contract errors):
   - `SNAPSHOT_NOT_FOUND`
   - `INVALID_PARAMS`

## Eight Ratified Protocol Invariants and Test Criteria

| ID     | Invariant                                                     | Test Criteria                                                                                               | Acceptance Test                                                                |
| ------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| INV-01 | Mutation revisions are monotonic and globally ordered.        | Consecutive mutation acks strictly increase `revision` and return `snapshotId = snp-<revision>`.            | `should advance revision for query-engine mutations`                           |
| INV-02 | Every read response binds to one immutable snapshot.          | Query response always includes one `snapshotIdUsed`; fixed-snapshot reads return requested id.              | `should pin query results to fixed snapshot state across document changes`     |
| INV-03 | Fixed-snapshot query execution is deterministic.              | Identical fixed-snapshot query inputs produce deep-equal `result` payloads.                                 | `should return deterministic payload for identical fixed-snapshot queries`     |
| INV-04 | Cancellation is terminal for a request id.                    | Canceled request returns top-level cancellation error and omits normal result payload.                      | `should return contract-defined cancellation top-level error code`             |
| INV-05 | Unknown fixed snapshot ids fail with typed domain code.       | Missing fixed snapshot returns result-envelope error with `code = SNAPSHOT_NOT_FOUND`.                      | `should return contract-defined snapshot-not-found result-envelope code`       |
| INV-06 | Handshake enforces protocol major compatibility.              | Peer protocol compatibility requires `query-engine-v2` and major `2`; major mismatch is rejected.           | `should reject incompatible peer major version during compatibility check`     |
| INV-07 | Incremental range edits are applied before snapshot reads.    | Range changes persist in stored doc state and query output reflects updated symbols.                        | `should apply ranged incremental changes to stored query-engine document text` |
| INV-08 | Query responses contain required metadata + timing telemetry. | Diagnostics query payload includes `requestId`, `snapshotIdUsed`, query `result`, and `metrics.durationMs`. | `should return analyzeResult for diagnostics engine queries`                   |

## Compatibility and Drift Policy

- Contract source of truth: `docs/specs/query-engine-v2-protocol-contract.v2.0.0.json`.
- Any breaking change requires a new contract artifact version and protocol major bump.
- CI/test drift guard: bridge acceptance tests validate runtime handshake and error/schema semantics against this artifact.
