---
name: worker-orient
description: Orient at cycle start. Pulls main, shows issues, runs smoke test, shows status. Use at the start of every work cycle.
disable-model-invocation: true
---

# Worker Orientation

## Current State (live)

### Main branch
!`git checkout main && git pull --quiet 2>&1 && echo "PULL:OK" || echo "PULL:FAIL"`

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
1. Identify the highest-priority unassigned issue (no assignee, lowest P-number label)
2. Claim it and create a worktree: `scripts/worktree.sh create feat/description`
3. Start the TDD cycle from your role file
