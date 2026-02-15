---
name: ci-status
description: Check CI status for a PR. Pass PR number as argument.
disable-model-invocation: true
argument-hint: [pr-number]
---

# CI Status for PR #$ARGUMENTS

## Check Results
!`gh pr checks $ARGUMENTS 2>/dev/null || echo "CI:ERROR | PR #$ARGUMENTS not found"`

## PR Details
!`gh pr view $ARGUMENTS --json state,title,headRefName,statusCheckRollup --jq '{state,title,branch:.headRefName,checks:[.statusCheckRollup[]|{name:.name,status:.status,conclusion:.conclusion}]}' 2>/dev/null || echo "PR:ERROR"`

## Instructions
Report the CI status in grep-friendly format:
- If all checks pass: `CI:PASS | PR #N | branch`
- If any check fails: `CI:FAIL | PR #N | branch | failed_check_name: reason`
- If pending: `CI:PENDING | PR #N | branch | waiting_on: check_name`
