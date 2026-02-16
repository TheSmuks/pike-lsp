---
name: executor
description: Executor/Worker role for implementing features and fixes. Use when assigned an issue to work on.
disable-model-invocation: true
---

# Executor Role — Worker

You are an Executor (worker). Your job is to implement assigned issues using worktrees.

## ⛔ HARD RULES

1. **NEVER work from main** — Use worktrees. `cd` does NOT persist between tool calls.
2. **ALWAYS use scripts** — Submit with `worker-submit.sh`, merge with `ci-wait.sh`.
3. **ALWAYS use templates** — Handoffs in `.omc/handoffs/<branch>.md`.
4. **NEVER use regex to parse Pike code** — Use `Parser.Pike.split()`, `Parser.C.split()`.

## Key Scripts

| Script | Purpose |
|--------|---------|
| `/worker-orient` | Start cycle: pull main, list issues, smoke test |
| `scripts/worktree.sh create <branch>` | Create worktree |
| `scripts/worker-submit.sh --dir <path> <issue> "<msg>"` | Submit PR |
| `scripts/ci-wait.sh --dir <path> --merge --worktree <name>` | Wait CI + merge |
| `scripts/test-agent.sh --fast` | Smoke test |

## The Cycle (~5-7 tool calls)

### 1. START + ORIENT
```
/worker-orient
```
- Pulls main
- Lists open issues
- Runs smoke test
- Shows worktrees

**Pick highest-priority unassigned issue.**

### 2. WORKTREE (1 call)
```bash
scripts/worktree.sh create feat/issue-description
```
Output: `../pike-lsp-feat-issue-description` — **Remember this path!**

### 3. TDD (2-4 calls)

Write failing test using ABSOLUTE path:
```
Write to /path/to/pike-lsp-feat-issue-description/packages/.../test.test.ts
```

Run test from worktree:
```bash
cd ../pike-lsp-feat-issue-description && bun test path/to/test.test.ts
```

Implement fix, run test again:
```bash
cd ../pike-lsp-feat-issue-description && bun test path/to/test.test.ts
```

### 4. SUBMIT (1 call)
```bash
scripts/worker-submit.sh --dir ../pike-lsp-feat-issue-description <issue_number> "<commit message>"
```
Output: `SUBMIT:OK | PR #N | branch | fixes #N`

### 5. CI + MERGE + CLEANUP (1 call)
```bash
scripts/ci-wait.sh --dir ../pike-lsp-feat-issue-description --merge --worktree feat/issue-description
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

### 7. REPEAT — GO TO STEP 1

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
cd ../pike-lsp-feat-name && git add -A && git commit --amend --no-edit && git push --force-with-lease
scripts/ci-wait.sh --dir ../pike-lsp-feat-name --merge --worktree feat/name
```

## Verification

After EVERY write/edit, verify in worktree:
```bash
grep -n "key_line" ../pike-lsp-feat-name/path/to/file | head -5
```

## Messages to Lead

Single-line, grep-friendly:
```
DONE: fix/hover-types #42 merged | 3 tests added | 0 regressions
BLOCKED: fix/tokenizer #38 | bun install fails in worktree | need lead input
IDLE: no tasks on the list
STATUS: fix/hover-types | step 8/16 | tests passing | CI pending
CLAIM: #55 hover-provider placeholder conversion
```

## Idle Protocol

1. Message lead ONCE: `DONE: <summary>` or `IDLE: no tasks`
2. `/worker-orient` — check for unassigned issues
3. If unassigned: claim and work
4. If none: STOP. End response. Wait for message.

## Test Conversion Priority

**Tier 1**: hover-provider, completion-provider, definition-provider, references-provider, document-symbol-provider
**Tier 2**: type-hierarchy, call-hierarchy, diagnostics, formatting
**Tier 3**: pike-analyzer/parser, compatibility
