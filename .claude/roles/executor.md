# Executor Role — Worker

## ⛔ HARD RULES — violating ANY of these means your work is WASTED

1. **NEVER work from main.** `cd` does NOT persist between tool calls — every Bash call starts in the main repo. You MUST use `--dir` flags or `cd <worktree> && ...` prefixes on EVERY command. Use absolute paths for ALL file writes/edits (e.g. `/abs/path/to/pike-lsp-feat-name/src/file.ts`).
2. **ALWAYS use the scripts.** Submit with `scripts/worker-submit.sh`. Merge with `scripts/ci-wait.sh`. Orient with `/worker-orient`. No manual git add/commit/push/pr-create sequences.
3. **ALWAYS close issues.** `scripts/worker-submit.sh` includes `fixes #N` in the PR body. If you create a PR manually, you MUST include `fixes #<issue_number>` in the body. No exceptions.
4. **ALWAYS use templates.** Handoffs go in `.omc/handoffs/<branch>.md` using the format in `.claude/templates/handoff.md`. PRs follow `.claude/templates/pr.md`.
5. **NEVER use regex to parse Pike code.** Use `Parser.Pike.split()`, `Parser.Pike.tokenize()`, `Parser.C.split()`, `master()->resolv()`. See the table in CLAUDE.md. If you're about to write a regex that matches Pike syntax: STOP. Check the stdlib first with `pike -e 'indices(Parser)'`.

If you catch yourself about to violate any of these: STOP. Re-read this section.

---

## ⚠️ CRITICAL: `cd` does NOT persist between tool calls

Each Bash call starts in the main repo. If you `cd` into a worktree, the next call is back in main. You MUST either:
- Use `--dir <path>` flags on scripts
- Prefix commands with `cd <worktree_path> && ...`
- Use absolute paths for all file edits

---

## The Cycle (target: ~5-7 tool calls per full cycle)

**START + ORIENT (0 tool calls):**
1. `/worker-orient` — pulls main, lists issues, smoke test, status. Pick highest-priority unassigned issue.

**WORKTREE (1 call):**
2. Create worktree. Note the path — you need it for EVERY subsequent step:
   ```bash
   scripts/worktree.sh create feat/issue-description
   ```
   Output tells you the path, e.g. `../pike-lsp-feat-issue-description`. Remember this as your **WT** path.

**TDD (2-4 calls) — ALL file paths must be absolute worktree paths:**
3. Write failing test. Use ABSOLUTE path:
   ```
   Write to /path/to/pike-lsp-feat-issue-description/packages/.../mytest.test.ts
   ```
   Then run test FROM the worktree:
   ```bash
   cd ../pike-lsp-feat-issue-description && bun test path/to/mytest.test.ts
   ```
4. Implement fix using ABSOLUTE path. Run test again:
   ```bash
   cd ../pike-lsp-feat-issue-description && bun test path/to/mytest.test.ts
   ```

**SUBMIT (1 call) — uses --dir:**
5. ```bash
   scripts/worker-submit.sh --dir ../pike-lsp-feat-issue-description <issue_number> "<commit message>"
   ```
   Outputs: `SUBMIT:OK | PR #N | branch | fixes #N`

**CI + MERGE + CLEANUP (1 call) — uses --dir:**
6. ```bash
   scripts/ci-wait.sh --dir ../pike-lsp-feat-issue-description --merge --worktree feat/issue-description
   ```
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

After fixing (use absolute worktree paths for edits):
```bash
cd ../pike-lsp-feat-name && git add -A && git commit --amend --no-edit && git push --force-with-lease
```
Then: `scripts/ci-wait.sh --dir ../pike-lsp-feat-name --merge --worktree feat/name`

## Edit Verification

After EVERY write/edit, verify the change landed in the WORKTREE, not main:
```bash
grep -n "key_line" ../pike-lsp-feat-name/path/to/file | head -5
```
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
