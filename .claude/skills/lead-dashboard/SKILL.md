---
name: lead-dashboard
description: Full project dashboard for the lead. Shows issues, PRs, branches, CI, worktrees. Use to check team state.
disable-model-invocation: true
---

# Lead Dashboard

## Open Issues (by priority)
!`gh issue list --state open --json number,title,assignees,labels --limit 50 2>/dev/null || echo "ISSUES:ERROR"`

## Open PRs
!`gh pr list --state open --json number,title,headRefName,statusCheckRollup,author --limit 20 2>/dev/null || echo "PRS:ERROR"`

## Recently Merged (last 5)
!`gh pr list --state merged --limit 5 --json number,title,mergedAt 2>/dev/null || echo "MERGED:ERROR"`

## Unmerged Remote Branches
!`git branch -r --no-merged main 2>/dev/null | grep -v HEAD || echo "(none)"`

## Active Worktrees
!`git worktree list 2>/dev/null`

## Main CI Status
!`gh run list --branch main -L 3 --json status,conclusion,name,headBranch 2>/dev/null || echo "CI:ERROR"`

## Instructions

You are the lead. From the data above:
1. Identify PRs ready to merge (all checks passing) — merge them.
2. Identify PRs with failing checks — message the assigned teammate.
3. Identify unassigned issues — assign to idle teammates.
4. Identify orphaned branches (no open PR) — create PR or delete.
5. If fewer than 8 open issues: create new work (see Feature Discovery in your role file).
