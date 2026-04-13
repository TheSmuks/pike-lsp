---
id: KB-WORKFLOW-TASK-LIFECYCLE
domain: WORKFLOWS
date: 2026-04-13
authors: [agent]
summary: DGA task lifecycle — from issue discovery to merged code.
---

# Task Lifecycle

## 1. Discovery
Architect agent analyzes the codebase, identifies structural problems, and creates GitHub issues with priority labels (`critical`, `high`, `normal`, `low`). Issues include affected files, root cause, and proposed fix strategy.

## 2. Triage
Maintainer reviews the issue. If safe for automated work, applies `safe` label. Issues without `safe` label are never picked up by automated workers.

## 3. Coding
Coordinator assigns the issue to a coder worker. The coder:
- Reads target files and related KB entries
- Makes edits following the project conventions
- Runs `pnpm typecheck` and relevant tests
- Writes a KB entry if the change introduces or updates architectural knowledge
- Opens a PR with a summary referencing the issue

## 4. Review
Reviewer agent reads the full PR diff and all changed files. Checks:
- Correct PikeBridge API usage (no direct subprocess calls)
- TypeScript strictness (no `any` casts, proper null handling)
- Test coverage for new behavior
- No regressions in existing tests

Approves or requests changes.

## 5. CI Fix
If CI fails after PR creation, a ci-fixer worker resolves build failures, type errors, or test regressions. Pushes fix commits directly to the PR branch.

## 6. Merge
Auto-merge is queued after approval. If the PR is stuck (merge conflict, stale branch), a maintainer force-merges after resolving conflicts.

## 7. Verification
If a coder reports an issue as "already resolved" without making changes, the issue receives a `needs-verification` label. A reviewer independently verifies the claim by checking the referenced code against the issue description before closing.
