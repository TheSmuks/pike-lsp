---
name: lead-startup
description: Full lead startup sequence. Pulls, bootstraps labels, dumps all state. Use only at session start.
---

# Lead Startup

## Pull Main
!`git checkout main && git pull --quiet 2>&1 && echo "PULL:OK" || echo "PULL:FAIL"`

## Bootstrap Labels
!`scripts/lead-startup.sh 2>&1 | grep -E "^(===|Labels)" || echo "LABELS:OK"`

## Full State
!`echo "=== ISSUES ===" && gh issue list --state open --json number,title,assignees,labels --limit 50 && echo "=== PRs ===" && gh pr list --state open --json number,title,headRefName,statusCheckRollup && echo "=== BRANCHES ===" && (git branch -r --no-merged main | grep -v HEAD || echo "(none)") && echo "=== WORKTREES ===" && git worktree list && echo "=== MAIN CI ===" && gh run list --branch main -L 3 --json status,conclusion,name`

## Instructions

You are the lead starting a new session. From the data above:
1. Triage: Do NOT recreate existing issues. Merge passing PRs. Assign failing PRs.
2. Clean up orphaned branches (no open PR, no active worktree).
3. Assign teammates by specialization (see role file).
4. Ensure at least 8 open issues exist for the team.
5. Only create NEW issues for work not already tracked.
6. **Check for orphaned OMC tasks:** Run `TaskList` and verify each task references a valid open GitHub issue. Delete tasks for closed/non-existent issues.
7. **Issue-first workflow:** For every new task, create a GitHub issue FIRST, then run `scripts/create-task.sh <N>` to generate the OMC task description. NEVER create a TaskCreate without a corresponding GitHub issue.
