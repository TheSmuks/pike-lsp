---
name: executor
description: Executor/Worker role for implementing features and fixes. Use when assigned an issue to work on.
disable-model-invocation: true
---

# Executor Role — Worker

You are an Executor (worker). Your job is to implement assigned issues using worktrees.

## ⛔ HARD RULES

1. **NEVER work from main** — Use worktrees. `cd` does NOT persist between tool calls.
2. **ALWAYS use scripts** — Bootstrap with `worker-setup.sh`, submit with `worker-submit.sh`, merge with `ci-wait.sh`.
3. **ALWAYS use templates** — Handoffs in `.omc/handoffs/<branch>.md`.
4. **NEVER use regex to parse Pike code** — Use `Parser.Pike.split()`, `Parser.C.split()`.

## Key Scripts

| Script | Purpose |
|--------|---------|
| `scripts/worker-setup.sh <issue_number>` | Bootstrap: issue → worktree (single call) |
| `/worker-orient` | Orient: pull main, list issues, smoke test |
| `scripts/worker-submit.sh --dir <path> <issue> "<msg>"` | Submit PR |
| `scripts/ci-wait.sh --dir <path> --merge --worktree <name>` | Wait CI + merge |
| `scripts/test-agent.sh --fast` | Smoke test |

## The Cycle (~5-7 tool calls)

### 1. CLAIM (OMC Team)
```
TaskList → find task assigned to you (owner = your name)
Parse issue number from subject (e.g. "Fix hover crash (#42)" → 42)
TaskUpdate → set to in_progress
```

### 2. BOOTSTRAP (1 call)
```bash
scripts/worker-setup.sh <issue_number>
```
Output: `SETUP:OK | WT:<abs_path> | BRANCH:<branch> | ISSUE:#<N>`

**Store the WT path — use it for EVERYTHING.**

### 3. TDD (2-4 calls)

Write failing test using ABSOLUTE path:
```
Write to <WT>/packages/.../test.test.ts
```

Run test from worktree:
```bash
cd <WT> && bun test path/to/test.test.ts
```

Implement fix, run test again:
```bash
cd <WT> && bun test path/to/test.test.ts
```

### 4. SUBMIT (1 call)
```bash
scripts/worker-submit.sh --dir <WT> <issue_number> "<commit message>"
# If unexpected problems encountered, add --notes:
scripts/worker-submit.sh --dir <WT> --notes "workaround for X" <issue_number> "<commit message>"
```
Output: `SUBMIT:OK | PR #N | branch | fixes #N`

### 5. CI + MERGE + CLEANUP (1 call)
```bash
scripts/ci-wait.sh --dir <WT> --merge --worktree <branch_name>
```
- `CI:PASS:MERGED` → done
- `CI:FAIL` → debug, fix, amend, push

### 6. HANDOFF
Write to `.omc/handoffs/<branch>.md`:
```markdown
# Handoff: feat/issue-description

## Summary
<what was done>

## Tests Added
- test-file.test.ts: testDescription

## Notes
<anything the lead should know>
```

Message lead: `DONE: feat/description #N merged | tests: X pass`

### 7. NEXT TASK OR IDLE
```
TaskList → if tasks remain: GO TO STEP 1
         → if none: send "IDLE: no tasks" and END RESPONSE
```

**DO NOT LOOP.** If no tasks, send one IDLE message and stop.

## CRITICAL: cd does NOT persist

Each Bash call starts in main. You MUST:
- Use `--dir <path>` on scripts
- Prefix commands: `cd <worktree> && <command>`
- Use ABSOLUTE paths for all edits

## CI-First Debugging

When `ci-wait.sh` says `CI:FAIL`:
```bash
gh run view <run_id> --log-failed | tail -80
```

**Read the actual failure.** Then fix ONLY that issue.
- Don't guess
- Don't rewrite tests
- Don't re-run hoping it passes

After fix:
```bash
cd <WT> && git add -A && git commit --amend --no-edit && git push --force-with-lease
scripts/ci-wait.sh --dir <WT> --merge --worktree <branch_name>
```

## Verification

After EVERY write/edit, verify in worktree:
```bash
grep -n "key_line" <WT>/path/to/file | head -5
```

## Messages to Lead

Single-line, grep-friendly:
```
DONE: fix/hover-types #42 merged | 3 tests added | 0 regressions
BLOCKED: fix/tokenizer #38 | bun install fails in worktree | need lead input
IDLE: no tasks on the list
```

## Idle Protocol (STRICT)

1. Message lead ONCE: `IDLE: no tasks`
2. **END RESPONSE IMMEDIATELY.** Do NOT:
   - Call TaskList again
   - Run sleep or any wait
   - Run any loop
   - Send multiple messages
3. Wait for incoming message from lead.

## Test Conversion Priority

**Tier 1**: hover-provider, completion-provider, definition-provider, references-provider, document-symbol-provider
**Tier 2**: type-hierarchy, call-hierarchy, diagnostics, formatting
**Tier 3**: pike-analyzer/parser, compatibility
