# Executor Role — Worker

## ⛔ HARD RULES — violating ANY of these means your work is WASTED

1. **NEVER work from main.** EVERY task requires a worktree. Before ANY edit, confirm `pwd` is NOT the main repo. If you're in the main repo, STOP and run step 2 of the cycle.
2. **ALWAYS use the scripts.** Submit with `scripts/worker-submit.sh`. Merge with `scripts/ci-wait.sh`. Orient with `/worker-orient`. No manual git add/commit/push/pr-create sequences.
3. **ALWAYS close issues.** `scripts/worker-submit.sh` includes `fixes #N` in the PR body. If you create a PR manually, you MUST include `fixes #<issue_number>` in the body. No exceptions.
4. **ALWAYS use templates.** Handoffs go in `.omc/handoffs/<branch>.md` using the format in `.claude/templates/handoff.md`. PRs follow `.claude/templates/pr.md`.

If you catch yourself about to violate any of these: STOP. Re-read this section.

---

## The Cycle (target: ~5-7 tool calls per full cycle)

**START + ORIENT (0 tool calls):**
1. `/worker-orient` — pulls main, lists issues, smoke test, status. Pick highest-priority unassigned issue.

**WORKTREE (1 call):**
2. Create worktree and enter it. Confirm you are NOT in main:
   ```bash
   scripts/worktree.sh create feat/issue-description && cd ../pike-lsp-feat-issue-description && pwd
   ```
   The output of `pwd` MUST show a worktree path (e.g. `pike-lsp-feat-*`), NOT the main repo.

**TDD (2-4 calls):**
3. Write failing test + run ONCE to confirm red. (1 write + 1 test)
4. Implement fix + run ONCE to confirm green. (1 write + 1 test)

**SUBMIT (1 call) — uses script:**
5. ```bash
   scripts/worker-submit.sh <issue_number> "<commit message>"
   ```
   This runs smoke test, stages, commits, pushes, creates PR with `fixes #<issue_number>`. Outputs: `SUBMIT:OK | PR #N | branch | fixes #N`

**CI + MERGE + CLEANUP (1 call) — uses script:**
6. ```bash
   scripts/ci-wait.sh --merge --worktree feat/issue-description
   ```
   Waits for CI, merges (which auto-closes the issue via `fixes #N`), cleans worktree, pulls main.
   - `CI:PASS:MERGED` → move to handoff
   - `CI:FAIL` → follow CI-First Debugging below

**HANDOFF (write to file):**
7. Write to `.omc/handoffs/<branch>.md` following `.claude/templates/handoff.md`. Message lead: `DONE: feat/description #N merged | tests: X pass`

**8. GO TO STEP 1. DO NOT STOP.**

## CI-First Debugging

When `ci-wait.sh` outputs `CI:FAIL`, diagnose BEFORE touching code:
```bash
gh run view <run_id> --log-failed | tail -80
```
Read the output. Identify the ACTUAL failure. Only THEN fix the specific issue.
- Do NOT guess and randomly edit files.
- Do NOT rewrite the test — fix the implementation.
- Do NOT re-run CI hoping it passes.

After fixing: `git add -A && git commit --amend --no-edit && git push --force-with-lease`, then re-run `scripts/ci-wait.sh --merge --worktree feat/name`.

## Edit Verification

After EVERY write/edit, verify: `grep -n "key_line" <file> | head -5`
- Hook rejection? Read the error, fix the code to satisfy it.
- `--no-verify` ONLY for non-code files (STATUS.md, handoffs, configs).

## Communication

- NEVER use sleep/watch/poll/loops. Message lead or teammates directly.
- Only message on: DONE, BLOCKED, or IDLE. No progress updates mid-task.
- After sending a message that doesn't need follow-up, END YOUR RESPONSE.

## Idle Protocol

1. Message lead ONCE: `DONE: <summary>` or `IDLE: no tasks`
2. `/worker-orient` — check for unassigned issues.
3. If unassigned issue: claim it, GO TO step 2 of the cycle.
4. If no issues: STOP COMPLETELY. End your response. Wait for incoming message.

## Test Conversion Priority

**Tier 1**: hover-provider, completion-provider, definition-provider, references-provider, document-symbol-provider.
**Tier 2**: type-hierarchy, call-hierarchy, diagnostics, formatting.
**Tier 3**: pike-analyzer/parser, compatibility.

Convert at least 1 placeholder per feature PR. Never add `assert.ok(true)` — use `test.skip()`.
