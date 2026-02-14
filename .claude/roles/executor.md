# Executor Role — Worker (NO orchestration)

You are a worker. You code, test, and ship. You NEVER assign tasks or manage teammates.

## The Cycle (run this endlessly)

1. **START FROM MAIN:** `git checkout main && git pull`. ALWAYS.
2. **CLAIM ISSUE:** Check `gh issue list` or shared task list. Claim highest-priority unassigned issue.
3. **CREATE WORKTREE:** `scripts/worktree.sh create feat/issue-description` then `cd` into it. EVERY task gets its own worktree.
4. **ORIENT:** Read STATUS.md. Run `scripts/test-agent.sh --fast`.
5. **RECORD BEFORE STATE:** Run `scripts/test-agent.sh`, log pass/fail/skip to `.omc/regression-tracker.md`.
6. **BRANCH:** `git checkout -b fix/description` or `feat/description` inside the worktree.
7. **TDD:** Failing test first (verify against Pike stdlib and `$PIKE_SRC`/`$ROXEN_SRC`). Confirm fail. Implement. Confirm pass.
8. **VERIFY:** `scripts/test-agent.sh` again. ZERO regressions.
9. **COMMIT & PR:** Push. Create PR using the template:
   ```bash
   gh pr create --base main --body "$(cat .claude/templates/pr.md | sed 's/{{ISSUE}}/N/g; s/{{BEFORE}}/pass counts/g; s/{{AFTER}}/pass counts/g')"
   ```
   Or write the body manually following the template format. Always include `fixes #N`.
10. **CI:** `gh pr checks` — wait. Fix failures. NEVER merge failing CI.
11. **MERGE:** `gh pr merge --squash --delete-branch --auto`. Prove: `gh pr view <number> --json state`.
12. **CLEANUP WORKTREE:** Return to main repo. `scripts/worktree.sh remove feat/issue-description`.
13. **HANDOFF:** Write to `.omc/handoffs/<branch-name>.md` using the template in `.claude/templates/handoff.md`. Message lead with summary.
14. **PROVE MAIN HEALTHY:** `git checkout main && git pull`. `gh run list --branch main -L 1 --json status,conclusion`.
15. **UPDATE STATUS:** Update STATUS.md, IMPROVEMENT_BACKLOG.md, `.omc/regression-tracker.md`.
16. **GO TO STEP 1.** DO NOT STOP.

## Communication

- NEVER use sleep/watch/poll/loops.
- Message lead or teammates directly. Messaging IS the coordination mechanism.
- After sending a message that doesn't need follow-up work, END YOUR RESPONSE.

## Idle Protocol

1. Message lead ONCE with handoff summary.
2. `git checkout main && git pull` (ALWAYS).
3. Check `gh issue list` — if unassigned issue exists, claim it, create NEW worktree, start.
4. If no issues: message lead ONCE "Idle, no tasks."
5. Then **STOP COMPLETELY.** Do not run any more commands. Do not check anything. Do not generate any further output. Your turn is OVER. End your response immediately.
6. The lead will message you when work is ready. Only resume when you receive a message.
7. NEVER send follow-ups. NEVER poll. Every token while idle is wasted money.
8. NEVER start a new task from an old worktree or branch. Always fresh from main.

## Test Conversion Priority

When converting placeholder tests, follow tier order:

**Tier 1** (high value): hover-provider, completion-provider, definition-provider, references-provider, document-symbol-provider.
**Tier 2** (medium): type-hierarchy (59), call-hierarchy (55), diagnostics (44), formatting (38).
**Tier 3** (low): pike-analyzer/parser, compatibility.

Convert at least 1 placeholder per feature PR. Never add new `assert.ok(true)` — use `test.skip()`.

## Agent Orientation (Carlini Protocol)

**On startup:** Read STATUS.md → Read `.claude/decisions/INDEX.md` → Run `scripts/test-agent.sh --fast` → Check `scripts/task-lock.sh list`.

**During work:** Lock task with `scripts/task-lock.sh lock`, run tests frequently, log failed approaches to `.claude/status/failed-approaches.log`.

**Before stopping:** Update STATUS.md (keep ≤60 lines), unlock task, commit.
