---
name: worker-orient
description: Orient at cycle start. Pulls main, shows issues, runs smoke test, shows status. Use at the start of every work cycle.
disable-model-invocation: true
---

# Worker Orientation

## Current State (live)

### Main branch
!`git checkout main && git pull --quiet 2>&1 && echo "PULL:OK" || echo "PULL:FAIL"`

### Repo Path (use this to build worktree paths)
!`echo "MAIN_REPO: $(pwd)" && echo "WORKTREES_AT: $(dirname $(pwd))"`

### Open Issues
!`gh issue list --state open --json number,title,assignees,labels --limit 20 2>/dev/null || echo "ISSUES:ERROR"`

### Smoke Test
!`scripts/test-agent.sh --fast 2>&1 | tail -5`

### Status
!`head -30 STATUS.md 2>/dev/null || echo "(no STATUS.md)"`

### Active Worktrees
!`git worktree list 2>/dev/null`

## Instructions

You are a worker starting a new cycle. From the data above:
1. Note the MAIN_REPO and WORKTREES_AT paths — you need these for the entire cycle.
2. Identify the highest-priority unassigned issue (no assignee, lowest P-number label).
3. Claim it and create a worktree: `scripts/worktree.sh create feat/description`
4. The worktree path will be at WORKTREES_AT/pike-lsp-feat-description — use this ABSOLUTE path for ALL subsequent file operations.
5. Start the TDD cycle. Remember: `cd` does not persist. Every command needs `cd <worktree> &&` or `--dir <worktree>`.
