---
id: KB-WORKFLOW-20260403-001
domain: WORKFLOW
date: 2026-04-03
summary: 'Diagnostics must use revision-owned publish rights to guarantee latest-wins behavior under overlapping validation triggers'
code_references: ref-diagnostics-latest-wins
---

# Diagnostics Revision Ownership

## Finding

Document version checks (`live.version === validatedVersion`) do not fully prevent stale diagnostics when multiple validation paths race on the same version (open/save/config/debounce).

## Required Pattern

1. Claim a monotonic per-URI diagnostics revision for every validation trigger.
2. Carry that revision through scheduling and validation.
3. Gate cache writes and `sendDiagnostics` on revision ownership (candidate revision equals latest claimed revision).
4. Remove per-URI revision state on close to avoid stale ownership carryover.

## Impact

Superseded or cancelled analyses cannot publish diagnostics, and latest revision deterministically owns publish rights.
