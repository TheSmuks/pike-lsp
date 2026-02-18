#!/bin/bash
INPUT_JSON=$(cat)
TOOL=$(echo "$INPUT_JSON" | jq -r '.tool_name' 2>/dev/null)
INPUT=$(echo "$INPUT_JSON" | jq -r '.tool_input | tostring' 2>/dev/null)

# --- Block npm/npx/yarn (bun only) ---
if echo "$INPUT" | grep -qE "\bnpm |\bnpx |\byarn |\bpnpm "; then
  cat >&2 <<EOF
[HOOK:BLOCK] PACKAGE_MANAGER_FORBIDDEN
REASON: This project uses bun exclusively. npm/npx/yarn/pnpm are not permitted.
YOU_RAN: $(echo "$INPUT" | grep -oE "\b(npm|npx|yarn|pnpm)[^ ]* [^ ]*")
FIX: Replace with bun:
  npm install      → bun install
  npm run <script> → bun run <script>
  npm test         → bun test
  npx <tool>       → bunx <tool>
  pnpm install     → bun install
EOF
  exit 1
fi

# --- Block direct push to main ---
if echo "$INPUT" | grep -qE "push.*origin main|push.*main$"; then
  cat >&2 <<EOF
[HOOK:BLOCK] DIRECT_PUSH_TO_MAIN_FORBIDDEN
REASON: main is a protected branch. All changes must go through a PR with CI passing.
YOU_RAN: $(echo "$INPUT" | grep -oE "push[^\"']*")
FIX: Push to your feature branch instead:
  git push origin fix/issue-<number>
  Then open a PR with: gh pr create --base main
EOF
  exit 1
fi

# --- Block PR self-merge ---
if echo "$INPUT" | grep -qE "gh pr merge"; then
  cat >&2 <<EOF
[HOOK:BLOCK] PR_SELF_MERGE_FORBIDDEN
REASON: Agents must not merge their own PRs. Auto-merge triggers automatically when CI passes.
YOU_RAN: $(echo "$INPUT" | grep -oE "gh pr merge[^\"']*")
FIX: Do nothing. After pushing your PR, wait for CI to pass.
  Auto-merge is already enabled. The PR will merge itself.
  Proceed to Step 7a (cleanup) only after you receive merge confirmation.
EOF
  exit 1
fi

# --- Block gh issue create without --label safe ---
if echo "$INPUT" | grep -qE "gh issue create"; then
  if ! echo "$INPUT" | grep -q "\-\-label safe"; then
    cat >&2 <<EOF
[HOOK:BLOCK] ISSUE_CREATE_MISSING_SAFE_LABEL
REASON: All agent-created issues must have the 'safe' label.
YOU_RAN: $(echo "$INPUT" | grep -oE "gh issue create[^\"']*")
FIX: Add --label safe to your create command.
EOF
    exit 1
  fi
fi

if echo "$INPUT" | grep -qE "gh issue list"; then
  if ! echo "$INPUT" | grep -q "\-\-label safe"; then
    cat >&2 <<EOF
[HOOK:BLOCK] ISSUE_LIST_MISSING_SAFE_FILTER
REASON: Agents must only see issues labeled 'safe'. Listing without this filter exposes
  pending-review and unlabeled issues which agents must never interact with.
YOU_RAN: $(echo "$INPUT" | grep -oE "gh issue list[^\"']*")
FIX: Always use:
  gh issue list --label safe --state open --json number,title,assignees
EOF
    exit 1
  fi
fi

# --- Block gh search issues ---
if echo "$INPUT" | grep -qE "gh search issues"; then
  cat >&2 <<EOF
[HOOK:BLOCK] ISSUE_SEARCH_FORBIDDEN
REASON: gh search issues bypasses the --label safe filter.
YOU_RAN: $(echo "$INPUT" | grep -oE "gh search issues[^\"']*")
FIX: Use gh issue list --label safe instead.
EOF
  exit 1
fi

# --- Block all issue interaction on non-safe issues ---
check_issue_safe() {
  local issue_num=$1
  local matched_command=$2
  local LABELS
  if [ -n "$issue_num" ]; then
    LABELS=$(gh issue view "$issue_num" --json labels --jq '.labels[].name' 2>/dev/null)
    if ! echo "$LABELS" | grep -q "safe"; then
      CURRENT_LABELS=$(echo "$LABELS" | tr '\n' ',' | sed 's/,$//')
      cat >&2 <<EOF
[HOOK:BLOCK] ISSUE_NOT_SAFE
REASON: Agents may only interact with issues labeled 'safe'. This issue has label(s): [${CURRENT_LABELS:-none}].
YOU_RAN: $matched_command #$issue_num
FIX: Do not interact with this issue. Use: gh issue list --label safe --state open
EOF
      exit 1
    fi
  fi
}

for pattern in "gh issue view" "gh issue edit" "gh issue comment" "gh issue close" "gh issue assign" "gh issue develop"; do
  if echo "$INPUT" | grep -qE "$pattern"; then
    ISSUE_NUM=$(echo "$INPUT" | grep -oE 'gh issue [a-z]+ [0-9]+' | grep -oE '[0-9]+$')
    check_issue_safe "$ISSUE_NUM" "$pattern"
  fi
done

# --- Block gh pr create without required format ---
if echo "$INPUT" | grep -qE "gh pr create"; then

  # Must have linked issue
  if ! echo "$INPUT" | grep -qiE "(closes|fixes|resolves) #[0-9]+"; then
    cat >&2 <<EOF
[HOOK:BLOCK] PR_MISSING_LINKED_ISSUE
REASON: All PRs must reference a safe issue. check-safe-label CI will fail without this.
YOU_RAN: $(echo "$INPUT" | grep -oE "gh pr create[^\"']*")
FIX: Include one of these in your --body:
  Closes #<number>
  Fixes #<number>
  Resolves #<number>
EOF
    exit 1
  fi

  # Must have non-empty Summary section
  if ! echo "$INPUT" | grep -q "## Summary"; then
    cat >&2 <<EOF
[HOOK:BLOCK] PR_MISSING_SUMMARY
REASON: PR body must contain a ## Summary section with prose description.
  The check-acceptance-criteria CI job will fail without this.
YOU_RAN: $(echo "$INPUT" | grep -oE "gh pr create[^\"']*")
FIX: Add to your --body:
  ## Summary
  <what this PR does — 1-3 sentences of prose, not a list>
EOF
    exit 1
  fi

  # Must have Root Cause section
  if ! echo "$INPUT" | grep -q "## Root Cause"; then
    cat >&2 <<EOF
[HOOK:BLOCK] PR_MISSING_ROOT_CAUSE
REASON: PR body must explain the root cause. This proves understanding,
  not just patching. Reviewers and future agents need this context.
YOU_RAN: $(echo "$INPUT" | grep -oE "gh pr create[^\"']*")
FIX: Add to your --body:
  ## Root Cause
  <what caused the problem — be specific>
EOF
    exit 1
  fi

  # Must have Changes section
  if ! echo "$INPUT" | grep -q "## Changes"; then
    cat >&2 <<EOF
[HOOK:BLOCK] PR_MISSING_CHANGES
REASON: PR body must list what changed and why, per file.
YOU_RAN: $(echo "$INPUT" | grep -oE "gh pr create[^\"']*")
FIX: Add to your --body:
  ## Changes
  - <file>: <why it changed, not just what>
EOF
    exit 1
  fi

  # Must have Verification section
  if ! echo "$INPUT" | grep -q "## Verification"; then
    cat >&2 <<EOF
[HOOK:BLOCK] PR_MISSING_VERIFICATION
REASON: PR body must describe what you ran locally and the results.
  CI verifies independently — this section is for human reviewers.
YOU_RAN: $(echo "$INPUT" | grep -oE "gh pr create[^\"']*")
FIX: Add to your --body:
  ## Verification
  <list of commands run and their outcomes>
EOF
    exit 1
  fi

fi

# --- Block gh issue create without required sections ---
if echo "$INPUT" | grep -qE "gh issue create"; then
  for section in "## Description" "## Problem" "## Expected Behavior" \
                 "## Suggested Approach" "## Affected Files" "## Acceptance"; do
    if ! echo "$INPUT" | grep -q "$section"; then
      cat >&2 <<EOF
[HOOK:BLOCK] ISSUE_MISSING_REQUIRED_SECTION
REASON: Issue body is missing required section: $section
  Lazy issue descriptions produce lazy fixes. All sections are required
  so that workers have enough context to implement correctly.
YOU_RAN: $(echo "$INPUT" | grep -oE "gh issue create[^\"']*")
FIX: Your --body must contain ALL of these sections with real content:
  ## Description
  ## Problem
  ## Expected Behavior
  ## Suggested Approach
  ## Affected Files
  ## Acceptance
  ## Environment
EOF
      exit 1
    fi
  done
fi

exit 0
