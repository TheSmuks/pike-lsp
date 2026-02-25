# Query Engine v2 Branching and Execution Policy

Status: Active

Last Updated: 2026-02-24

Related:

- `docs/specs/query-engine-v2-rfc.md`
- `docs/specs/query-engine-v2-protocol.md`
- `docs/specs/query-engine-v2-launch-runbook.md`
- `docs/specs/query-engine-v2-implementation-tracker.md`

## Decision

Develop query-engine-v2 work on a long-lived integration branch, not directly on `main`.

Primary branches:

- `main`: must remain releaseable and usable for alpha users.
- `rewrite/query-engine-v2`: integration branch for architecture rewrite.

Short-lived working branches:

- `qe2/phase-<n>-<topic>` (for example, `qe2/phase-2-cancel-propagation`).

## Why

- The rewrite can break internal contracts while in progress.
- `main` still needs to carry alpha fixes without rewrite instability.
- Phase-gated merges are easier to review and roll back than one large cutover.

## Branch Rules

1. Do not open rewrite PRs directly to `main` from feature branches.
2. Merge rewrite feature branches into `rewrite/query-engine-v2` first.
3. Promote from `rewrite/query-engine-v2` to `main` only when phase exit gates pass.
4. Keep rewrite branch fresh by merging `main` into rewrite on a fixed cadence.

## PR Flow

### Flow A: Rewrite implementation

1. Create branch from `rewrite/query-engine-v2`:
   - `qe2/phase-<n>-<topic>`
2. Open PR into `rewrite/query-engine-v2`.
3. Include tracker update in PR body.
4. Merge when tests for touched scope pass.

### Flow B: Phase promotion to main

1. Open PR from `rewrite/query-engine-v2` to `main`.
2. Confirm all phase exit-gate checkboxes in tracker are complete.
3. Attach evidence links (tests, perf, shadow diff, cancellation checks).
4. Merge only after gate review.

## Required Gate Evidence for rewrite -> main

- Correctness:
  - no stale publish in stress scenarios
  - deterministic snapshot behavior for migrated features
- Cancellation:
  - end-to-end cancel path works
  - post-cancel publish count is zero
- Performance:
  - p95 non-regression for migrated feature set
  - memory envelope remains within target
- Operational:
  - rollback controls validated
  - launch runbook checks complete for target stage

## Sync Policy

- Merge `main` into `rewrite/query-engine-v2` at least twice per week.
- Immediately sync rewrite after critical production or alpha hotfixes land in `main`.
- Resolve conflicts in rewrite branch first, not during phase-promotion PRs.

## Ownership Policy

- Assign one rewrite integration owner per week.
- Rewrite owner responsibilities:
  - keep tracker current
  - ensure branch sync cadence happens
  - enforce phase-gated promotion discipline

## Tracker Update Requirement

Every rewrite PR must include this section:

```text
Tracker Update
- Phase: <phase>
- Milestone: <what moved>
- Status delta: <from -> to>
- KPI impact: <metrics changed>
- Exit-gate impact: <checkboxes moved>
- Evidence: <tests, perf output, logs>
```

If this section is missing, PR is not ready for review.

## Start Commands

Create integration branch once:

```bash
git checkout main
git pull --ff-only
git checkout -b rewrite/query-engine-v2
git push -u origin rewrite/query-engine-v2
```

Create feature branch:

```bash
git checkout rewrite/query-engine-v2
git pull --ff-only
git checkout -b qe2/phase-<n>-<topic>
```

Sync rewrite with main:

```bash
git checkout rewrite/query-engine-v2
git fetch origin
git merge origin/main
git push
```
