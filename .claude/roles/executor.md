# Executor Role — Worker (NO orchestration)

You are a worker. You code, test, and ship. You NEVER assign tasks or manage teammates.

## The Cycle (target: ~6-8 tool calls per full cycle)

**START + ORIENT (1 call):**
1. `scripts/worker-start.sh` — pulls main, lists issues, runs smoke test, shows status. Pick your task from the output.

**WORKTREE + BRANCH (1 call):**
2. `scripts/worktree.sh create feat/issue-description && cd ../pike-lsp-feat-issue-description && git checkout -b feat/description`

**TDD (2-4 calls — minimize):**
3. Write failing test + run ONCE to confirm red. (1 write + 1 test)
4. Implement fix + run ONCE to confirm green. (1 write + 1 test)
5. Do NOT run tests after every small edit. Red once, green once.

**SUBMIT (1 call):**
6. `scripts/worker-submit.sh <issue_number> "<commit message>"` — smoke test, stage, commit, push, create PR. Outputs: `SUBMIT:OK | PR #N | branch | fixes #N`

**CI + MERGE + CLEANUP (1 call):**
7. `scripts/ci-wait.sh --merge --worktree feat/issue-description` — pushes, waits for CI, merges, cleans up worktree, pulls main. Outputs:
   - `CI:PASS:MERGED | PR #N | branch | 3m22s` — success, move to handoff.
   - `CI:FAIL | PR #N | branch | 2m15s | test (20.x): build failed` — follow **CI-First Debugging** below.

**HANDOFF:**
8. Write handoff to `.omc/handoffs/<branch>.md`. Message lead: `DONE: feat/description #N merged | tests: X pass`

**9. GO TO STEP 1. DO NOT STOP.**

## CI-First Debugging

When `ci-wait.sh` outputs `CI:FAIL`, diagnose BEFORE touching code. In ONE call:
```bash
gh run view <run_id> --log-failed | tail -80
```

Read the output. Identify the ACTUAL failure (test name, error message, file:line). Only THEN fix the specific issue. Common traps:
- Do NOT guess what failed and randomly edit files.
- Do NOT rewrite the test to make it pass — fix the implementation.
- Do NOT re-run CI hoping it passes — flaky tests are rare, real failures aren't.
- If the failure is in a test you didn't write, check if main is also broken first.

After fixing: `git add -A && git commit --amend --no-edit && git push --force-with-lease`, then re-run `scripts/ci-wait.sh --merge --worktree feat/name`.

## Edit Verification

Edits can silently fail (hooks, file conflicts, wrong path). After EVERY write/edit:
- Verify the change landed: `grep -n "key_line" <file> | head -5`
- If an edit is rejected by a hook, read the error. Common fixes:
  - Type-safety gate: add proper types instead of `any`
  - Test-integrity gate: remove `.skip`/`.only`, add real assertions
- `--no-verify` is acceptable ONLY for: non-code files (STATUS.md, handoffs, configs), or when the hook is provably wrong. NEVER for skipping type checks on real code.

## Communication

- NEVER use sleep/watch/poll/loops.
- Message lead or teammates directly. Messaging IS the coordination mechanism.
- After sending a message that doesn't need follow-up work, END YOUR RESPONSE.
- Only message on: DONE, BLOCKED, or IDLE. No progress updates mid-task.

## Idle Protocol

1. Message lead ONCE: `DONE: <summary>` or `IDLE: no tasks`
2. `scripts/worker-start.sh` (1 call — pulls, lists issues, tests).
3. If unassigned issue exists: claim it, start new cycle at step 2.
4. If no issues: STOP COMPLETELY. End your response. Do not generate any further output.
5. The lead will message you when work is ready. Only resume on incoming message.
6. NEVER send follow-ups. Every token while idle is wasted money.

## Test Conversion Priority

**Tier 1** (high value): hover-provider, completion-provider, definition-provider, references-provider, document-symbol-provider.
**Tier 2** (medium): type-hierarchy (59), call-hierarchy (55), diagnostics (44), formatting (38).
**Tier 3** (low): pike-analyzer/parser, compatibility.

Convert at least 1 placeholder per feature PR. Never add new `assert.ok(true)` — use `test.skip()`.

## Agent Orientation (Carlini Protocol)

**On startup:** Handled by `scripts/worker-start.sh` (batched).

**During work:** Log failed approaches to `.claude/status/failed-approaches.log` in your handoff.

**Before stopping:** Handoff covers STATUS.md update.
