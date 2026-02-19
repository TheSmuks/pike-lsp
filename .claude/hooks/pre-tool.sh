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

# --- Block gh issue create without complete template ---
if echo "$INPUT" | jq -e '.tool_input | tostring' 2>/dev/null | grep -qE "gh issue create" || \
   echo "$INPUT" | grep -qE "gh issue create"; then

  # Extract the full command being run for validation
  # Body content arrives JSON-escaped — unescape for reliable parsing
  # Extract command from INPUT_JSON - need to get the command field
  COMMAND=$(echo "$INPUT_JSON" | jq -r '.tool_input.command // .tool_input // ""' 2>/dev/null)

  # Use the extracted command as the raw body (already has real newlines from JSON parsing)
  BODY="$COMMAND"

  # Block missing safe label - use grep -F with -- to stop option parsing
  if ! echo "$BODY" | grep -F -q -- "--label safe"; then
    cat >&2 <<EOF
[HOOK:BLOCK] ISSUE_CREATE_MISSING_SAFE_LABEL
REASON: All agent-created issues must have the 'safe' label.
FIX: Add --label safe to your create command.
EOF
    exit 1
  fi

  # Block npm references in title
  if echo "$BODY" | grep -F -qi -- "--title" && echo "$BODY" | grep -F -qi "npm"; then
    cat >&2 <<EOF
[HOOK:BLOCK] ISSUE_REFERENCES_NPM
REASON: This project uses bun exclusively. Do not reference npm in issues.
FIX: Use bun terminology:
  'update npm packages' → 'update bun dependencies'
EOF
    exit 1
  fi

  # Enforce required sections with real content
  # Extract body argument - use everything after --body " as the issue body
  # Strip the leading --body " and trailing "
  ISSUE_BODY=$(echo "$BODY" | sed 's/.*--body\s*"//' | sed 's/"$//')

  # If we still can't extract body, use the full input for section checks
  if [ -z "$ISSUE_BODY" ] || [ "$ISSUE_BODY" = "$BODY" ]; then
    ISSUE_BODY="$BODY"
  fi

  for SECTION in \
    "## Description" \
    "## Problem" \
    "## Expected Behavior" \
    "## Suggested Approach" \
    "## Affected Files" \
    "## Acceptance"; do

    # Check section exists
    if ! echo "$ISSUE_BODY" | grep -q "$SECTION"; then
      cat >&2 <<EOF
[HOOK:BLOCK] ISSUE_MISSING_SECTION
REASON: Issue body is missing required section: $SECTION
  Every section must exist with substantive content.
  Vague issues produce vague fixes and waste worker cycles.
FIX: Your --body must contain ALL of these sections with REAL content
  (not placeholders, not HTML comments, not empty lines):

  ## Description
  <specific description of what needs doing — file paths, function names>

  ## Problem
  <what is wrong RIGHT NOW — include error messages, stack traces, logs>

  ## Expected Behavior
  <exactly what should happen after the fix>

  ## Suggested Approach
  <specific files to read, functions to change, patterns to follow>

  ## Affected Files
  - packages/<name>/src/<file>.ts: <why this file is involved>

  ## Acceptance
  <specific observable outcome that proves the fix worked>

  ## Environment
  - Pike binary: <pike --version output>
  - Bun version: <bun --version output>
  - \$PIKE_SRC set: YES
  - \$ROXEN_SRC set: YES
EOF
      exit 1
    fi

    # Extract content between this section and the next ## heading
    # Use awk for reliable multi-line extraction from potentially escaped input
    SECTION_CONTENT=$(echo "$ISSUE_BODY" | \
      awk "/^$SECTION/{found=1; next} found && /^## /{exit} found{print}" | \
      grep -v "^[[:space:]]*$" | \
      grep -v "^<!--" | \
      grep -v "^-->" | \
      head -3)

    if [ -z "$SECTION_CONTENT" ]; then
      cat >&2 <<EOF
[HOOK:BLOCK] ISSUE_EMPTY_SECTION
REASON: Section '$SECTION' exists but has no substantive content.
  Empty sections are not acceptable. The section header alone gives
  workers zero information to work with.
FIX: Write real content under '$SECTION'.
  NOT: HTML comments like <!-- what to write -->
  NOT: Placeholder text like 'TBD' or 'N/A'
  NOT: Empty lines
  YES: Specific file paths, error messages, function names, observations
EOF
      exit 1
    fi

    # Reject placeholder content
    if echo "$SECTION_CONTENT" | grep -qiE \
      "^[[:space:]]*(TBD|N\/A|TODO|FIXME|placeholder|none|unknown)[[:space:]]*$"; then
      cat >&2 <<EOF
[HOOK:BLOCK] ISSUE_PLACEHOLDER_CONTENT
REASON: Section '$SECTION' contains placeholder text.
  Writing 'TBD', 'N/A', 'TODO', etc. is not acceptable.
FIX: Replace placeholder text with real observations and findings.
EOF
      exit 1
    fi
  done

  # Enforce minimum body length — a complete issue cannot be under 200 chars
  BODY_LENGTH=$(echo "$ISSUE_BODY" | wc -c)
  if [ "$BODY_LENGTH" -lt 200 ]; then
    cat >&2 <<EOF
[HOOK:BLOCK] ISSUE_BODY_TOO_SHORT
REASON: Issue body is only $BODY_LENGTH characters. A properly filled
  template with 7 sections cannot be this short.
  This indicates most sections are empty or placeholder.
FIX: Fill all sections with real, substantive content.
  Minimum expected: 200 characters. A good issue is 400+.
EOF
    exit 1
  fi
fi

if echo "$INPUT" | grep -qE "gh issue list"; then
  if ! echo "$INPUT" | grep -F -q -- "--label safe"; then
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
    LABELS=$(gh issue view "$issue_num" --repo TheSmuks/pike-lsp --json labels --jq '.labels[].name' 2>/dev/null)

    if ! echo "$LABELS" | grep -q "^safe$"; then
      CURRENT_LABELS=$(echo "$LABELS" | tr '\n' ',' | sed 's/,$//')
      cat >&2 <<EOF
[HOOK:BLOCK] ISSUE_NOT_SAFE
REASON: Issue #$issue_num does not have the 'safe' label.
  Current labels: [${CURRENT_LABELS:-none}]
YOU_RAN: $matched_command #$issue_num
FIX: Only interact with issues labeled 'safe':
  gh issue list --label safe --state open --json number,title,assignees
EOF
      exit 1
    fi

    if echo "$LABELS" | grep -q "^needs-template$"; then
      cat >&2 <<EOF
[HOOK:BLOCK] ISSUE_NEEDS_TEMPLATE
REASON: Issue #$issue_num has the 'needs-template' label — its body
  is incomplete or missing required sections. Working on it wastes
  your cycle and produces a poor fix.
YOU_RAN: $matched_command #$issue_num
FIX: Do not work on this issue. Find a properly formatted one:
  gh issue list --label safe --state open --json number,title,assignees
  If all safe issues need-template, report to TheSmuks before proceeding.
EOF
      exit 1
    fi
  fi
}

for pattern in "gh issue view" "gh issue edit" "gh issue comment" "gh issue close" "gh issue assign" "gh issue develop"; do
  if echo "$INPUT" | grep -qE "$pattern"; then
    ISSUE_NUM=$(echo "$INPUT" | grep -oE "gh issue [a-z]+ [0-9]+" | grep -oE "[0-9]+$")
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
REASON: PR body must contain a ## Summary section with proper description.
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

exit 0
