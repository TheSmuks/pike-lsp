# Contributing Guide

This document is the single source of truth for coding agents working in this repository.
You are operating in an autonomous loop — follow the protocol below based on your role.

---

## Toolchain

This project uses **bun** exclusively. This is non-negotiable. npm, npx, yarn, and pnpm are blocked by a git hook.

| Wrong         | Correct       |
| ------------- | ------------- |
| `npm install` | `bun install` |
| `npm run x`   | `bun run x`   |
| `npx tool`    | `bunx tool`   |
| `yarn`        | `bun`         |
| `pnpm`        | `bun`         |

Issues and PRs must use bun terminology. Do not reference npm.
Do not create issues titled "update npm packages" — say "update bun dependencies".

---

## Branch Policy

### Default (non-rewrite work)

**Always sync before starting.** Main moves fast; working from a stale base causes merge conflicts, wasted effort, and duplicate fixes. If you find yourself resolving avoidable conflicts or re-implementing something already in main, this step was missed.

```bash
git checkout main && git pull origin main
git checkout -b fix/my-topic
```

Never commit directly to `main`.

### query-engine-v2 rewrite work

`main` stays releaseable. All rewrite work goes through a long-lived integration branch.

```
main (releaseable)
  └── rewrite/query-engine-v2 (integration)
        └── qe2/phase-<n>-<topic> (feature branches)
```

Rules:

- Feature branches merge into `rewrite/query-engine-v2`, never directly into `main`.
- Merge `main` into `rewrite/query-engine-v2` at least twice per week.
- Promote `rewrite/query-engine-v2` to `main` only when all exit gates pass.

Promotion gates:

- Correctness: no stale publish regressions.
- Cancellation: end-to-end cancel works, post-cancel publish count is zero.
- Performance: p95 non-regression for migrated feature set.
- Operations: rollback controls validated.

All rewrite PRs must update `docs/specs/query-engine-v2-implementation-tracker.md` and reference:

- `docs/specs/query-engine-v2-rfc.md`
- `docs/specs/query-engine-v2-protocol.md`
- `docs/specs/query-engine-v2-launch-runbook.md`
- `docs/specs/query-engine-v2-branching-and-execution-policy.md`

---

## Implementation Rules

- Keep changes scoped to one issue or one clearly scoped milestone.
- No drive-by refactors unless required for correctness.
- Match existing code patterns and naming conventions.
- TypeScript must stay strict.
- Pike parsing must use `Parser.Pike` — no regex shortcuts.
- Pike files should use `#pragma strict_types` when applicable.
- Do not exceed 500 lines per source file (tests excluded).
- Do not add abstractions "for future use."
- Do not add defensive code without a scenario requiring it.
- Do not touch files unrelated to your fix.

---

## Verification

Run relevant checks for changed areas. For significant cross-package changes, run all of these:

```bash
bun run lint && \
bun run typecheck && \
bun run build && \
cd packages/pike-bridge && bun test && cd ../.. && \
cd packages/pike-lsp-server && bun test && cd ../.. && \
cd packages/pike-lsp-server && bun test ./src/tests/smoke.test.ts && cd ../.. && \
cd packages/pike-lsp-server && bun test ./dist/tests/integration-tests.js && cd ../.. && \
pike test/tests/cross-version-tests.pike && \
./scripts/run-pike-tests.sh && \
cd packages/vscode-pike && bun run bundle-server && cd ../.. && \
cd packages/vscode-pike && bun run build:test && cd ../.. && \
cd packages/vscode-pike && bun test src/test/mockOutputChannel.test.ts && cd ../.. && \
cd packages/vscode-pike && xvfb-run --auto-servernum bun run test:e2e && cd ../..
```

Quality gate: `scripts/quality-gate.sh` (checks complexity, dead code, unused imports; runs in pre-commit hooks).

---

## Scenario-Driven Development

This project uses **scenario tests** instead of unit tests for behavior verification.

Scenarios simulate what an editor does: open files, make edits, check diagnostics.
Located in `src/scenarios/scenario-runner.test.ts`.

- **Before every commit**: run `bun test packages/pike-lsp-server/src/scenarios/` — must pass.
- **When fixing a bug**: add a scenario FIRST that reproduces it, then fix the code.
- **When adding a feature**: add a scenario describing the expected editor behavior.
- **Do not write unit tests for your own changes** — write scenarios instead.
- **Do not add code without a scenario** — if there's no scenario requiring it, don't add it.
- **PROVE THE FIX IS REAL**: Run `scripts/verify-fix.sh <scenario-name>` to verify the scenario
  fails before the fix and passes after. If it passes in both states, you cheated.

### What NOT to do

- Do not add abstractions "for future use"
- Do not add defensive code for edge cases without a scenario
- Do not refactor working code unless a scenario requires it
- Do not touch files unrelated to your fix
- Do not exceed 500 lines per source file (tests excluded)

---

## Test Standards

### Imports (strict)

```typescript
// ✅ CORRECT — use these EXACT imports
import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import {
  createMockDocuments,
  createMockBridge,
  createMockServices,
  makeCachedEntry,
} from '../helpers/test-helpers.js';

// ❌ WRONG — do not use any of these
import * as assert from 'node:assert/strict'; // use default import
import { describe, expect, it } from 'bun:test'; // use assert, not expect
import assert from 'node:assert'; // use strict
const { describe, it } = require('bun:test'); // never use require
```

### Mocks

Use the shared helpers from `tests/helpers/test-helpers.ts`:

- `createMockDocuments()` — for document state
- `createMockBridge(config)` — for Pike bridge simulation
- `createMockConnection()` — for LSP connection
- `makeCachedEntry(text, options)` — for cache entries
- `createMockServices(uri, bridge, entry)` — for full services mock

Do NOT create inline mock factories. If the shared helpers don't cover your case,
extend the helpers file instead of creating new ones.

### Naming

- Files: `kebab-case.test.ts`, one test file per feature.
- Blocks: `describe('Feature Name', ...)` with `it('should do X when Y', ...)`.
- Always use `it()`, never `test()`.

---

## Issue Requirements

Issues labeled `safe` are enforced by CI (`enforce-issue-template.yml`). Missing sections get `needs-template` label and fail.

Required sections (all must have substantive content, not placeholders or HTML comments):

- `## Description` — what needs improvement and why
- `## Problem` — current state, what is wrong or missing
- `## Expected Behavior` — what should happen instead
- `## Suggested Approach` — concrete steps or pointers to files/functions
- `## Affected Files` — list files or packages likely involved
- `## Acceptance` — checklist of completion criteria

Required labels (exactly one of each):

| Category | Options                                                                                    |
| -------- | ------------------------------------------------------------------------------------------ |
| Priority | `P0-broken`, `P1-tests`, `P2-feature`, `P3-refactor`, `P4-perf`                            |
| Type     | `type:bug`, `type:feature`, `type:performance`, `type:test`, `type:tech-debt`, `type:docs` |

Template: `.github/ISSUE_TEMPLATE/improvement.md`

When creating issues:

1. Use the template at `.github/ISSUE_TEMPLATE/improvement.md`
2. Fill ALL sections with real content (not placeholders or HTML comments)
3. Add exactly one priority label and one type label
4. Add the `safe` label only when approved

---

## PR Requirements

CI enforces (`enforce-acceptance-criteria.yml`): non-empty Summary section AND linked issue keyword. PRs missing either get `needs-acceptance-criteria` label and fail.

PR body must follow `.github/PULL_REQUEST_TEMPLATE.md`:

```
## Summary          — 1-2 sentences, prose not bullets
## Linked Issue     — must include closes #N / fixes #N / resolves #N
## Root Cause       — what caused the bug / why the feature is needed
## Changes          — one bullet per file, explain WHY not WHAT
## Verification     — actual commands run + their results
## Checklist        — check all applicable items
```

Every PR must include meaningful tests:

- **Features**: cover primary functional requirements and edge cases.
- **Bug fixes**: cover the specific regression to prevent recurrence.

### Commit discipline

- Frequent, scoped commits — one logical milestone per commit.
- Do not accumulate large uncommitted batches.
- Concise, imperative commit messages.

---

## Merge Conflict Handling

1. Rebase on latest target branch.
2. Resolve conflicts intentionally — do not blindly choose ours/theirs.
3. Re-run verification after rebase.
4. Push with `--force-with-lease`.

---

## Cleanup

- Remove stale local branches/worktrees after merge.
- Delete stale remote branches when no longer needed.
- Keep git state clean to avoid CI and release drift.

---

## Architecture

### Monorepo build order

```
@pike-lsp/core -> @pike-lsp/pike-bridge -> @pike-lsp/pike-lsp-server -> vscode-pike
```

Each package depends on the previous. Build must follow this order.

### Pike subprocess model

The Pike subprocess runs a **synchronous read-process-write loop** — it reads one JSON-RPC request from stdin, processes it completely (parse, compile, introspect — all blocking), writes one response to stdout, then reads the next. This means:

- **Sending concurrent `analyze()` calls to a single `PikeBridge` instance achieves ZERO speedup** — requests simply queue in stdin and execute serially.
- **True parallelism requires multiple `PikeBridge` instances** (`BridgePool`), each backed by its own independent Pike subprocess.
- The `BridgePool` utility at `packages/pike-bridge/src/test-utils/bridge-pool.ts` manages N bridges with per-worker assignment and concurrency-limited dispatch.

### CI pipeline

- **test.yml**: 6 jobs with dependency chain. `test` + `pike-test` (matrix x2) -> `build-extension` + `vscode-e2e-category` (matrix x4) + `vscode-e2e-source-trees` -> `vscode-e2e` (aggregate gate).
- **bench.yml**: Performance benchmarks on push + PR. Includes branch comparison gate on PRs.
- **release.yml**: Tag-triggered release + VSIX publish to GitHub Releases.
- Cross-version testing (Pike 8.0.1116 + latest) is MANDATORY on main.
- `continue-on-error: true` for latest Pike version — failures are warnings, not blocks.

### CI workflow modification rules

When modifying `.github/workflows/` files:

1. **Token scope**: Pushing workflow changes requires a PAT with `workflow` scope. Standard tokens are refused.
2. **Validate YAML syntax**: Always run `bunx yaml-lint <file>` after editing. Invalid YAML silently breaks pipelines.
3. **Two enforcement workflows run automatically**:
   - `enforce-issue-template.yml` — Issues labeled `safe` must have all template sections filled with substantive content. Empty or comment-only sections fail.
   - `enforce-acceptance-criteria.yml` — PRs must have a non-empty `## Summary` section and a linked issue (`closes #N`, `fixes #N`, `resolves #N`). Missing either adds `needs-acceptance-criteria` label and fails CI.
4. **Step ordering matters**: The `test` job runs strict_types check and build BEFORE Pike install (these are pure bash/TypeScript — no Pike needed). They serve as fast early-gate checks. Do not move them after Pike install.
5. **Lockfile checks**: `scripts/check-lockfiles.sh` is idempotent and cheap. It runs in entry-point jobs (`test`, `pike-test`). Downstream jobs with `needs:` dependencies inherit the guarantee and do not need to re-check.
6. **Pike from-source build**: Uses `make -j$(nproc)` for parallel compilation. Do not revert to `make -j1`.

### Test infrastructure

- bun test runner (tests run in parallel by default)
- Scenario tests (LSP behavior simulations) in `src/scenarios/`
- Cross-version Pike handler tests in `test/tests/cross-version-tests.pike`
- VSCode E2E tests split into categories by matrix grep
- Source-tree E2E tests require `PIKE_SRC` + `ROXEN_SRC` env vars
- Corpus test uses `BridgePool` (configurable via `PIKE_CORPUS_CONCURRENCY`)
- Source-tree E2E uses `batchParse()` + `BridgePool` (configurable via `PIKE_SOURCE_TREE_CONCURRENCY`)

---

## Creating a Release

### 1. Determine versions

```bash
gh release list --limit 1
cat package.json | grep '"version"'
git describe --tags --abbrev=0
```

### 2. Bump versions

Update in both `package.json` and `packages/vscode-pike/package.json`.

### 3. Update CHANGELOG.md

Add new section with date and changes. Keep only the latest two releases.

### 4. Commit and tag

```bash
git add -A
git commit -m "chore: bump version to alpha.NEW"
git tag -a v0.1.0-alpha.NEW -m "Release v0.1.0-alpha.NEW"
```

### 5. Push

```bash
git push origin v0.1.0-alpha.NEW
```

The release workflow (`.github/workflows/release.yml`) automatically builds, tests, creates the VSIX, and publishes the GitHub Release with auto-generated notes.

### 6. Verify

```bash
gh release view v0.1.0-alpha.NEW
```

### Fix a bad release

```bash
gh release delete v0.1.0-alpha.NEW --yes
gh release create v0.1.0-alpha.NEW \
  --target <commit-sha> \
  --generate-notes \
  --notes-start-tag v0.1.0-alpha.PREVIOUS \
  --title "Release v0.1.0-alpha.NEW"
```

Always create actual GitHub Releases, not just git tags. GitHub's auto-generated notes compare against the last published Release — bare tags cause bloated changelogs.

---

## Forbidden

- npm, npx, yarn, pnpm.
- Pushing directly to `main`.
- Skipping verification for risky changes.
- Destructive git commands unless explicitly requested.
- Unit tests instead of scenarios for behavior verification.
- Code without a scenario requiring it.
