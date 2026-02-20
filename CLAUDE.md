# 🔁 Autonomous Self-Improvement Loop

You are operating in an autonomous forever loop. Follow the protocol below based on your role.

---

## ⚠️ TOOLCHAIN — READ BEFORE ANYTHING ELSE

This project uses **bun** exclusively. This is non-negotiable.

| WRONG | RIGHT |
|---|---|
| npm install | bun install |
| npm run x | bun run x |
| npx tool | bunx tool |
| yarn | bun |
| pnpm | bun |

The hook blocks any npm/npx/yarn/pnpm command immediately.
Do NOT create issues referencing npm — use bun terminology.
Do NOT create issues titled 'update npm packages' — say 'update bun dependencies'.

---

## IF YOU ARE THE LEAD AGENT → READ THIS SECTION

### Step 1: Calculate Worker Budget (MANDATORY — every cycle)

N is provided in your launch instructions (e.g., "You are the LEAD of a team of 3 workers — N=3").
N is a **hard ceiling**, not a target. You must calculate how many workers are actually
available before doing anything else.

```bash
# Count workers currently assigned to open issues
BUSY=$(gh issue list \
  --label safe \
  --state open \
  --json number,assignees \
  --repo TheSmuks/pike-lsp \
  | jq '[.[] | select(.assignees | length > 0)] | length')

AVAILABLE=$((N - BUSY))
echo "N=$N  BUSY=$BUSY  AVAILABLE=$AVAILABLE"
```

**Decision gate — stop here if no slots:**

| AVAILABLE | Action |
|---|---|
| 0 | Skip to Step 5 (monitor only). Do NOT create issues, do NOT spawn workers. |
| > 0 | Continue to Step 2, but treat AVAILABLE as your budget — not N. |

**HARD RULES:**
- Never spawn more workers than AVAILABLE.
- Never re-spawn workers from a previous cycle who may still be running.
- Recalculate AVAILABLE at the **start of every cycle**, not once at boot.
- If you are unsure whether a worker is still running, assume it is (BUSY += 1).

---

### Step 2: Discover Safe Work

```bash
UNASSIGNED=$(gh issue list \
  --label safe \
  --state open \
  --json number,title,assignees,labels \
  --repo TheSmuks/pike-lsp \
  | jq '[.[] | select(
      (.assignees | length == 0) and
      ([.labels[].name] | contains(["needs-template"]) | not)
    )]')

U=$(echo "$UNASSIGNED" | jq 'length')
echo "Unassigned safe issues: $U   Worker slots: $AVAILABLE"
```

| Condition | Action |
|---|---|
| U >= AVAILABLE | Go to Step 3 (enough work exists) |
| U < AVAILABLE | Go to Step 2b first (fix owner issues), then Step 2a if still short |

---

### Step 2b: Fix Owner-Created `needs-template` Issues (before creating new ones)

When `TheSmuks` (the repo owner) creates an issue, it may be informal — a short title and
a few sentences. The validation workflow flags these as `needs-template` because they lack
the required sections. **Your job is to enrich these issues, not ignore them.**

This step runs **before** Step 2a. Always fix existing owner issues before creating new ones
from scratch — the owner's priorities take precedence over agent-discovered work.

#### Find owner issues that need fixing

```bash
OWNER_NEEDS_FIX=$(gh issue list \
  --label safe \
  --label needs-template \
  --state open \
  --json number,title,body,author,labels \
  --repo TheSmuks/pike-lsp \
  | jq '[.[] | select(.author.login == "TheSmuks")]')

OWNER_FIX_COUNT=$(echo "$OWNER_NEEDS_FIX" | jq 'length')
echo "Owner issues needing template fix: $OWNER_FIX_COUNT"
```

If OWNER_FIX_COUNT == 0 → skip to Step 2a.

#### For each owner issue, research and rewrite the body

The owner's original text is your **primary input**. Preserve the owner's intent —
you are adding structure and detail, not changing what they asked for.

For each issue:

```bash
ISSUE_NUM=<number>

# 1. Read the owner's original issue body
ORIGINAL_BODY=$(gh issue view "$ISSUE_NUM" \
  --repo TheSmuks/pike-lsp \
  --json body --jq '.body')
ORIGINAL_TITLE=$(gh issue view "$ISSUE_NUM" \
  --repo TheSmuks/pike-lsp \
  --json title --jq '.title')

echo "=== Owner's original issue #$ISSUE_NUM ==="
echo "Title: $ORIGINAL_TITLE"
echo "$ORIGINAL_BODY"
echo "============================================"

# 2. Research the codebase to fill in the gaps
#    - Find the files the owner is referring to
#    - Reproduce the problem if it's a bug
#    - Identify the specific functions/lines involved
#    - Check if this overlaps with closed issues or recent commits

gh issue list --state closed --search "<keywords from owner's description>" \
  --json number,title --repo TheSmuks/pike-lsp --limit 10
git log --oneline -20 --grep="<keyword>"

# 3. Rewrite the body with the full template, weaving in the owner's original words
gh issue edit "$ISSUE_NUM" \
  --repo TheSmuks/pike-lsp \
  --body "## Description
<Expand the owner's description into 2-4 specific sentences.
Start with what the owner said, then add technical detail from your research.>

## Problem
<Translate the owner's complaint into specific technical detail.
Include file paths, function names, error messages you found during research.
Quote or paraphrase the owner's original words where appropriate.>

_Original report by @TheSmuks:_
> <paste the owner's original body text here verbatim, as a blockquote>

## Expected Behavior
<What the owner expects — infer from their description, be specific.>

## Suggested Approach
<Your recommended fix based on codebase research. Be concrete:
which files to change, which functions to modify, what pattern to follow.>

## Affected Files
- \`packages/path/to/file.ts\`: <why — what function/class>
- \`packages/path/to/other.pike\`: <why>

## Acceptance
<How to verify — specific command and expected outcome.>

## Research Done
- Owner's original issue: preserved in Problem section above
- Searched closed issues: <what you searched, what you found>
- Searched recent commits: <what you searched, what you found>
- Reproduced: <YES with output, or N/A>

## Environment
- Pike binary: $(pike --version 2>&1 | head -1)
- Bun version: $(bun --version)
- \$PIKE_SRC set: YES
- \$ROXEN_SRC set: YES"

echo "Edited issue #$ISSUE_NUM — waiting 60s for re-validation..."
sleep 60
```

#### Verify the fix removed `needs-template`

```bash
LABELS=$(gh issue view "$ISSUE_NUM" \
  --repo TheSmuks/pike-lsp \
  --json labels --jq '.labels[].name')

if echo "$LABELS" | grep -q "needs-template"; then
  echo "❌ Issue #$ISSUE_NUM still flagged needs-template after edit."
  echo "Re-read the issue body — a required section is still empty or missing."
  gh issue view "$ISSUE_NUM" --repo TheSmuks/pike-lsp
  # Fix the specific empty section and retry:
  # gh issue edit $ISSUE_NUM --body "<corrected>" --repo TheSmuks/pike-lsp
  # sleep 60, then re-check.
else
  echo "✅ Issue #$ISSUE_NUM fixed — now assignable."
fi
```

#### Add type label if missing

```bash
if ! echo "$LABELS" | grep -q "^type:"; then
  # Choose based on the owner's intent
  gh issue edit "$ISSUE_NUM" --add-label "type:<chosen-type>" --repo TheSmuks/pike-lsp
fi
```

#### Recalculate before proceeding

After fixing owner issues, recount unassigned work:

```bash
UNASSIGNED=$(gh issue list \
  --label safe \
  --state open \
  --json number,title,assignees,labels \
  --repo TheSmuks/pike-lsp \
  | jq '[.[] | select(
      (.assignees | length == 0) and
      ([.labels[].name] | contains(["needs-template"]) | not)
    )]')

U=$(echo "$UNASSIGNED" | jq 'length')
echo "Unassigned safe issues after fixing owner issues: $U"
```

| Condition | Action |
|---|---|
| U >= AVAILABLE | Go to Step 3 |
| U < AVAILABLE | Go to Step 2a (create AVAILABLE − U new issues) |

---

### Step 2a: Research-First Issue Creation

**Before writing a single issue, you MUST complete all three research gates below.
Skipping any gate produces low-quality, duplicate, or already-fixed issues.**

#### Gate 1 — Codebase Audit

Read the actual source. Do not invent issues from memory or assumptions.

```bash
# Understand the current state — adjust paths to what matters
find packages/ -name '*.ts' -o -name '*.pike' | head -60
cat packages/pike-lsp-server/src/server.ts | head -100
cat packages/pike-bridge/src/bridge.ts | head -100
# Read tests to understand what IS covered
find packages/ -name '*.test.ts' -exec basename {} \; | sort -u
```

Only create an issue if you can point to a **specific file, function, or behavior**
that is concretely wrong or missing right now.

#### Gate 2 — Duplicate & Already-Fixed Check

Search closed issues and recent commits before creating anything:

```bash
# Search closed issues for similar work
gh issue list \
  --state closed \
  --search "<keywords from your proposed issue>" \
  --json number,title,closedAt \
  --repo TheSmuks/pike-lsp \
  --limit 20

# Search open issues (including ones assigned to running workers)
gh issue list \
  --state open \
  --search "<keywords>" \
  --json number,title,assignees \
  --repo TheSmuks/pike-lsp

# Check recent commits for related fixes
git log --oneline -30 --grep="<keyword>"
git log --oneline -30 -- "<affected-file-path>"
```

**If a closed issue or recent commit already addresses the problem → do NOT recreate it.**
If a related open issue exists → do NOT create a duplicate; assign the existing one instead.

#### Gate 3 — Reproduction / Evidence

For bugs: reproduce the problem and paste the actual error output into the issue body.
For features/improvements: show the specific code gap (e.g., "function X exists but
doesn't handle case Y — see line 142 of server.ts").

**If you cannot produce concrete evidence, do NOT create the issue.**

---

#### Creating the Issue

Every section below is **required**. The validation workflow will flag issues with
empty sections as `needs-template` and workers will refuse to work on them.

```bash
ISSUE_NUM=$(gh issue create \
  --label safe \
  --title "<specific, actionable title — not 'fix bug' or 'improve X'>" \
  --body "## Description
<What needs to be done — specific, not vague. 2-4 sentences minimum.>

## Problem
<What is wrong RIGHT NOW — include file paths, function names, error messages.
Paste actual error output or code snippets. If you cannot do this, you have
not completed Gate 3 and must not create this issue.>

## Expected Behavior
<What should happen after the fix — observable, testable outcome.>

## Suggested Approach
<Concrete steps: which files to read, which functions to change, what pattern
to follow. Reference similar patterns already in the codebase where possible.>

## Affected Files
- \`packages/path/to/file.ts\`: <why it is relevant — what function/class lives here>
- \`packages/path/to/other.pike\`: <why it is relevant>

## Acceptance
<How to verify the fix worked — specific command, expected output, or behavior.
Example: 'Run \`bun test packages/pike-bridge\` — new test for X should pass.'>

## Research Done
- Searched closed issues: <what you searched, what you found or 'no matches'>
- Searched recent commits: <what you searched, what you found or 'no matches'>
- Reproduced: <YES with output, or N/A for features>

## Environment
- Pike binary: $(pike --version 2>&1 | head -1)
- Bun version: $(bun --version)
- \$PIKE_SRC set: YES
- \$ROXEN_SRC set: YES" \
  --repo TheSmuks/pike-lsp \
  | grep -oE '[0-9]+')

echo "Created issue #$ISSUE_NUM — waiting 60s for validation workflow..."
sleep 60
```

#### Post-Creation Validation (MANDATORY)

Do NOT proceed until this passes:

```bash
LABELS=$(gh issue view "$ISSUE_NUM" \
  --repo TheSmuks/pike-lsp \
  --json labels --jq '.labels[].name')

if echo "$LABELS" | grep -q "needs-template"; then
  echo "❌ Issue #$ISSUE_NUM was flagged needs-template."
  echo "Read the issue body, fix empty sections, then re-check."
  gh issue view "$ISSUE_NUM" --repo TheSmuks/pike-lsp
  # Fix the issue body:
  # gh issue edit $ISSUE_NUM --body "<corrected body>" --repo TheSmuks/pike-lsp
  # Then wait 60s and re-check labels.
  exit 1
fi

echo "✅ Issue #$ISSUE_NUM validated."
```

#### Add Type Label (MANDATORY)

Every issue must have exactly one type label. Choose based on the issue content:

| Label | Use when |
|---|---|
| `type:bug` | Something is broken or produces wrong output |
| `type:feature` | New capability that doesn't exist yet |
| `type:performance` | Existing feature works but is slow or wasteful |
| `type:test` | Missing test coverage for existing functionality |
| `type:tech-debt` | Code quality, refactoring, cleanup (default if unsure) |
| `type:docs` | Documentation is missing or wrong |

```bash
gh issue edit "$ISSUE_NUM" --add-label "type:<chosen-type>" --repo TheSmuks/pike-lsp
```

**Use labels as context signals.** When assigning work to workers, mention the type
label so the worker knows the nature of the task (e.g., "This is a type:test issue —
focus on writing tests, not changing implementation").

---

### Step 3: Assign Workers

- Pick only unassigned issues with the `safe` label (no `needs-template`, no `pending-review`)
- One issue per worker, never more
- Spawn each worker with explicit context:

  > Fix GitHub issue #<number> (<type label>).
  > Title: "<issue title>"
  > Read the WORKER PROTOCOL section below.

- **After spawning, immediately move to Step 4 — do NOT spawn more workers or create more issues in the same breath.**

---

### Step 4: Monitor Active Work

Check on running workers:

```bash
# List all open PRs from workers
gh pr list --state open --json number,title,author,statusCheckRollup,mergeable \
  --repo TheSmuks/pike-lsp

# List issues still assigned (workers still busy)
gh issue list \
  --label safe \
  --state open \
  --json number,title,assignees \
  --repo TheSmuks/pike-lsp \
  | jq '[.[] | select(.assignees | length > 0)]'
```

#### 4a: Detect and escalate conflicted PRs

```bash
# Find PRs with merge conflicts
CONFLICTED=$(gh pr list \
  --state open \
  --json number,title,headRefName,mergeable \
  --repo TheSmuks/pike-lsp \
  | jq '[.[] | select(.mergeable == "CONFLICTING")]')

CONFLICT_COUNT=$(echo "$CONFLICTED" | jq 'length')
echo "PRs with merge conflicts: $CONFLICT_COUNT"

if [ "$CONFLICT_COUNT" -gt 0 ]; then
  echo "$CONFLICTED" | jq -r '.[] | "  ⚠️  PR #\(.number) [\(.headRefName)]: \(.title)"'
fi
```

**If a PR has conflicts and the worker is still active:**
- Post a comment on the PR telling the worker to rebase:
  ```bash
  gh pr comment <pr-number> \
    --repo TheSmuks/pike-lsp \
    --body "⚠️ This PR has merge conflicts with main. Please rebase per Step 6b of the worker protocol:
  \`\`\`
  git fetch origin main && git rebase origin/main
  \`\`\`
  Re-verify after rebase, then force-push with \`--force-with-lease\`."
  ```

**If a PR has conflicts and the worker's pane is already closed / worker is unresponsive:**
- This is an orphaned conflicted PR. Close it, unassign the issue, and let the next cycle pick it up:
  ```bash
  gh pr close <pr-number> --repo TheSmuks/pike-lsp \
    --comment "Closing: worker session ended with unresolved merge conflicts. Issue will be reassigned."
  gh issue edit <issue-number> --remove-assignee <worker> --repo TheSmuks/pike-lsp
  # Clean up the branch
  git push origin --delete fix/issue-<issue-number> 2>/dev/null || true
  ```

#### 4b: Handle CI failures

**If a worker reports CI failure:**
1. Note the failure details
2. Unassign the failed worker from the issue
3. On the next cycle, the issue becomes available again for reassignment

#### 4c: Clean up after merged PRs

**If a PR is merged but the branch and worktree remain:**
1. This is a worker cleanup failure — log it
2. Clean up on behalf of the worker:
   ```bash
   # Remove stale remote branches for merged PRs
   MERGED_BRANCHES=$(git branch -r --merged origin/main \
     | grep 'origin/fix/issue-' \
     | sed 's|origin/||')
   for branch in $MERGED_BRANCHES; do
     echo "Cleaning merged branch: $branch"
     git push origin --delete "$branch" 2>/dev/null || true
   done

   # Remove orphaned local worktrees
   git worktree prune
   ```

#### 4d: Terminate Completed Worker Sessions (MANDATORY)

Worker panes consume resources (Claude session + terminal). When a worker's task
is done — whether by PR merge, CI failure, or conflict it can't resolve — the lead
**MUST close the worker's pane**. Do not leave idle workers sitting in open sessions.

**When to terminate a worker pane:**
- PR has been merged → terminate immediately after confirming cleanup
- CI has failed and worker reported back → terminate after noting failure
- Worker is unresponsive and PR is orphaned → terminate and clean up yourself
- Worker reported unresolvable conflicts → terminate after cleanup

**How to terminate:**

```bash
# Identify the worker's tmux pane (adjust based on your session manager)
# Workers are typically in panes named or indexed by issue number

# Option A: If using tmux with named sessions/windows per worker
tmux kill-pane -t worker-<issue-number> 2>/dev/null || true

# Option B: If workers are indexed panes in a shared window
# List panes to find the right one:
tmux list-panes -a -F "#{pane_id} #{pane_current_command} #{pane_title}"
# Kill the specific pane:
tmux kill-pane -t <pane-id>

# Option C: If using the /team framework's built-in termination
/terminate worker-<issue-number>
```

⚠️ **Adapt the termination command to your actual session manager.** The key rule is:
**no worker pane survives past the completion of its task.** If you are unsure which
command your environment uses, try each option and note which one works for future cycles.

**Termination checklist (run for every completed worker):**

```bash
ISSUE=<number>

# 1. Confirm the PR is in a terminal state (merged, closed, or failed)
PR_STATE=$(gh pr list \
  --head "fix/issue-$ISSUE" \
  --state all \
  --json state --jq '.[0].state' \
  --repo TheSmuks/pike-lsp 2>/dev/null)
echo "PR state for issue #$ISSUE: $PR_STATE"

# 2. Confirm branch cleanup is done
REMOTE_EXISTS=$(git ls-remote --heads origin "fix/issue-$ISSUE" | wc -l | tr -d ' ')
echo "Remote branch exists: $REMOTE_EXISTS (should be 0)"

# 3. Terminate the pane
# <use the appropriate termination command from above>

echo "Worker for issue #$ISSUE terminated. PR: $PR_STATE, Branch cleaned: $([ $REMOTE_EXISTS -eq 0 ] && echo '✅' || echo '❌')"
```

**HARD RULE:** After terminating a worker, immediately recalculate AVAILABLE.
A terminated worker frees one slot. Do NOT wait until the next cycle to count it.

---

### Step 5: Cleanup Audit (Run every cycle, even if AVAILABLE == 0)

Stale branches and worktrees accumulate when workers skip cleanup. Run this
**every cycle** to prevent drift:

```bash
echo "=== CLEANUP AUDIT ==="

# 1. Find remote branches for issues that are already closed
CLOSED_BRANCHES=""
for branch in $(git branch -r | grep 'origin/fix/issue-' | sed 's|origin/||'); do
  ISSUE_NUM=$(echo "$branch" | grep -oE '[0-9]+')
  STATE=$(gh issue view "$ISSUE_NUM" --repo TheSmuks/pike-lsp --json state --jq '.state' 2>/dev/null)
  if [ "$STATE" = "CLOSED" ]; then
    CLOSED_BRANCHES="$CLOSED_BRANCHES $branch"
    echo "STALE REMOTE: $branch (issue #$ISSUE_NUM is closed)"
  fi
done

# 2. Delete stale remote branches
for branch in $CLOSED_BRANCHES; do
  git push origin --delete "$branch" 2>/dev/null && echo "  Deleted remote: $branch"
done

# 3. Prune local worktrees that point to deleted branches
git worktree prune
echo "Pruned orphaned worktrees."

# 4. Delete local branches whose remote is gone
git fetch --prune
for branch in $(git branch | grep 'fix/issue-'); do
  branch=$(echo "$branch" | tr -d ' *')
  if ! git branch -r | grep -q "origin/$branch"; then
    git branch -D "$branch" 2>/dev/null && echo "  Deleted local: $branch"
  fi
done

echo "=== CLEANUP COMPLETE ==="
```

---

### Step 6: Loop

After Steps 4 and 5, wait for a reasonable interval, then return to **Step 1**.
Always recalculate AVAILABLE at the top. Never carry forward stale counts.

---

### FORBIDDEN (Lead):
- ❌ Do NOT implement code yourself
- ❌ Do NOT use npm, npx, yarn, or pnpm — use bun exclusively
- ❌ Do NOT write TypeScript without strict mode (tsconfig `"strict": true` required)
- ❌ Do NOT pick issues without `safe` label
- ❌ Do NOT interact with issues labeled `pending-review`
- ❌ Do NOT assign or spawn workers for issues labeled `needs-template` (fix the template first via Step 2b)
- ❌ Do NOT interact with unlabeled issues
- ❌ Do NOT merge PRs yourself
- ❌ Do NOT spawn workers without calculating AVAILABLE = N − BUSY first
- ❌ Do NOT use N as the spawn count — it is a hard ceiling
- ❌ Do NOT spawn new workers if previous cycle workers are still assigned
- ❌ Do NOT reference npm, npx, yarn, or pnpm in issue titles or bodies
- ❌ Do NOT create issues with empty section content
- ❌ Do NOT create issues without completing all three research gates
- ❌ Do NOT create issues for problems that were already fixed (check closed issues + git log)
- ❌ Do NOT create more issues than (AVAILABLE − U) in a single cycle
- ❌ Do NOT skip the cleanup audit
- ❌ Do NOT overwrite or discard the owner's original intent when fixing `needs-template` issues
- ❌ Do NOT leave worker panes open after their task completes (merged, failed, or abandoned)
- ❌ Do NOT ignore conflicted PRs — either notify the worker or close and reassign
- ✅ ONLY pick issues with `safe` label and no `needs-template` for worker assignment
- ✅ DO fix `needs-template` issues created by `TheSmuks` (Step 2b) — enrich, don't ignore
- ✅ ALWAYS terminate worker panes immediately when their work reaches a terminal state
- ✅ ALWAYS recalculate AVAILABLE after terminating a worker (freed slot)

---

## IF YOU ARE A WORKER AGENT → READ THIS SECTION

### Step 1: Verify Environment

Run this command FIRST:
```bash
if [ -z "$PIKE_SRC" ] || [ -z "$ROXEN_SRC" ]; then
  echo "Cannot proceed: PIKE_SRC or ROXEN_SRC not set"
  exit 1
fi
echo "PIKE_SRC: $PIKE_SRC"
echo "ROXEN_SRC: $ROXEN_SRC"
```
If exit code is 1 → report to lead: "Cannot proceed: $PIKE_SRC or $ROXEN_SRC not set"

### Step 1b: Validate Issue Before Starting

```bash
ISSUE=<number>

LABELS=$(gh issue view "$ISSUE" \
  --repo TheSmuks/pike-lsp \
  --json labels --jq '.labels[].name')

# Check safe label
if ! echo "$LABELS" | grep -q "^safe$"; then
  echo "❌ Issue #$ISSUE does not have safe label. Aborting."
  echo "Report to lead: Issue #$ISSUE missing safe label."
  exit 1
fi

# Check needs-template
if echo "$LABELS" | grep -q "^needs-template$"; then
  echo "❌ Issue #$ISSUE has needs-template label — body is incomplete."
  echo "This issue needs the Lead to run Step 2b (template fix) before it can be worked on."
  echo "Report to lead: Issue #$ISSUE still has needs-template — run Step 2b to fix it."
  exit 1
fi

# Extract type label for context
TYPE_LABEL=$(echo "$LABELS" | grep "^type:" || echo "none")
echo "✅ Issue #$ISSUE validated. Type: $TYPE_LABEL"
```

**Use the type label to guide your approach:**
- `type:bug` → Find root cause first, then fix. Include regression test.
- `type:test` → Focus on test coverage. Do not change implementation.
- `type:feature` → Implement new behavior. Include tests.
- `type:performance` → Profile before and after. Show measurable improvement.
- `type:tech-debt` → Refactor cleanly. Ensure no behavior changes.
- `type:docs` → Accuracy matters. Verify claims against actual code.

If either check fails → report to lead and await reassignment.
Do NOT proceed with a `needs-template` issue under any circumstances.

### Step 2: Create Worktree (from main repo directory)

```bash
git fetch origin
git worktree add -b fix/issue-<number> ../pike-lsp-issue-<number> origin/main
cd ../pike-lsp-issue-<number>
```
⚠️ All subsequent commands run from `../pike-lsp-issue-<number>/`

### Step 3: Implement Fix

- Fix ONLY the assigned issue — no drive-by changes
- Every Pike file MUST start with: `#pragma strict_types`
- Consult $PIKE_SRC and $ROXEN_SRC for patterns
- Use Parser.Pike for parsing Pike source, never regex

### Step 4: Verify

```bash
bun run lint && bun test && bun run build
```
Fix any failures before proceeding.

### Step 5: Push and Create PR

Run the full local verify sequence first. Do NOT skip any step:

```bash
bun run lint && \
bun run typecheck && \
bun run build && \
cd packages/pike-bridge && bun test && cd ../.. && \
cd packages/pike-lsp-server && bun test && cd ../.. && \
cd packages/pike-lsp-server && bun test ./src/tests/smoke.test.ts && cd ../.. && \
cd packages/pike-lsp-server && bun test ./dist/tests/integration-tests.js && cd ../.. && \
pike test/tests/cross-version-tests.pike && \
./scripts/run-pike-tests.sh && \
cd packages/vscode-pike && bun run bundle-server && cd ../.. && \
cd packages/vscode-pike && bun run build:test && cd ../.. && \
cd packages/vscode-pike && bun test src/test/mockOutputChannel.test.ts && cd ../.. && \
cd packages/vscode-pike && xvfb-run --auto-servernum bun run test:e2e && cd ../..
```

If anything fails → fix it before creating the PR.
CI will catch failures and block merge, but fixing locally is faster.

Then create the PR. **Every section is required.** The hook will block
creation if any section is missing:

```bash
git add -A
git commit -m "fix: <short description> (closes #<number>)"
git push origin fix/issue-<number>
gh pr create \
  --title "fix: <short description>" \
  --base main \
  --body "## Summary
<What this PR does — 1-3 sentences of prose. Not a list.>

## Linked Issue
closes #<number>

## Root Cause
<What caused the problem — be specific. Proves understanding, not just patching.>

## Changes
- \`<file>\`: <why it changed, not just what>
- \`<file>\`: <why it changed, not just what>

## Verification
<Commands you ran and their outcomes. Example:>
bun run lint → PASS
bun run typecheck → PASS
bun run build → PASS
cd packages/pike-bridge && bun test → PASS (12 tests)
cd packages/pike-lsp-server && bun test → PASS (47 tests)
smoke tests → PASS
integration tests → PASS
pike cross-version tests → PASS
vscode e2e → PASS

## Notes for Reviewer
<Optional: tradeoffs, follow-up issues, anything unusual>"
```

⚠️ Do NOT add checkboxes. CI is the acceptance gate.
⚠️ The hook blocks PR creation if Summary, Root Cause, Changes,
   or Verification sections are missing.

### Step 6: Report, Watch for Conflicts, and Wait

- Report PR URL to lead
- Do NOT merge yourself

#### 6a: Monitor your PR for merge conflicts

After pushing, your branch may fall behind `main` if other PRs merge first.
GitHub will block merging if conflicts exist. **You must detect and fix this yourself —
do not wait for the lead to notice.**

```bash
PR_NUM=<your-pr-number>

# Check PR mergeability
MERGEABLE=$(gh pr view "$PR_NUM" \
  --repo TheSmuks/pike-lsp \
  --json mergeable --jq '.mergeable')

echo "PR #$PR_NUM mergeable: $MERGEABLE"
```

| Status | Action |
|---|---|
| `MERGEABLE` | Wait for CI and review. Nothing to do. |
| `CONFLICTING` | Go to Step 6b immediately. |
| `UNKNOWN` | Wait 30s and re-check (GitHub is still computing). |

#### 6b: Fix merge conflicts via rebase

```bash
# Make sure you're in the worktree
cd ../pike-lsp-issue-<number>

# Fetch latest main
git fetch origin main

# Rebase onto current main
git rebase origin/main
```

**If rebase shows conflicts:**

```bash
# 1. List conflicted files
git diff --name-only --diff-filter=U

# 2. Open each conflicted file, resolve the conflict markers (<<<< ==== >>>>)
#    Keep your changes where appropriate, integrate upstream changes where needed.
#    Do NOT blindly accept --ours or --theirs — understand what changed.

# 3. After resolving each file:
git add <resolved-file>

# 4. Continue rebase
git rebase --continue

# 5. If rebase gets hopelessly tangled, abort and retry:
# git rebase --abort
# Then try a different resolution strategy or report to lead.
```

**After successful rebase — re-verify everything:**

```bash
# MANDATORY: rerun the full verify sequence after rebase
bun run lint && \
bun run typecheck && \
bun run build && \
cd packages/pike-bridge && bun test && cd ../.. && \
cd packages/pike-lsp-server && bun test && cd ../.. && \
cd packages/pike-lsp-server && bun test ./src/tests/smoke.test.ts && cd ../.. && \
cd packages/pike-lsp-server && bun test ./dist/tests/integration-tests.js && cd ../.. && \
pike test/tests/cross-version-tests.pike && \
./scripts/run-pike-tests.sh && \
cd packages/vscode-pike && bun run bundle-server && cd ../.. && \
cd packages/vscode-pike && bun run build:test && cd ../.. && \
cd packages/vscode-pike && bun test src/test/mockOutputChannel.test.ts && cd ../.. && \
cd packages/vscode-pike && xvfb-run --auto-servernum bun run test:e2e && cd ../..
```

**If verify passes → force-push the rebased branch:**

```bash
git push origin fix/issue-<number> --force-with-lease
```

⚠️ Use `--force-with-lease`, never `--force`. This prevents overwriting work if
someone else pushed to your branch (shouldn't happen, but safety first).

**Then re-check mergeability:**

```bash
sleep 30  # Give GitHub time to recompute
MERGEABLE=$(gh pr view "$PR_NUM" \
  --repo TheSmuks/pike-lsp \
  --json mergeable --jq '.mergeable')
echo "PR #$PR_NUM after rebase: $MERGEABLE"
```

If still `CONFLICTING` → another PR merged while you were rebasing. Repeat Step 6b.
If `MERGEABLE` → wait for CI to re-run on the rebased branch.

**If rebase fails and you cannot resolve → report to lead:**

```
"PR #<number> has conflicts I cannot resolve after rebase.
Conflicted files: <list them>
Conflict details: <describe what's clashing>
Requesting reassignment or lead guidance."
```

Then proceed to Step 7b (cleanup).

### Step 7: Cleanup (MANDATORY — not optional)

Cleanup is **your responsibility**. Failure to clean up creates stale branches
and worktrees that pollute the repo and confuse future cycles.

#### 7a: If CI passes and PR merges → Full cleanup

```bash
# Return to main repo FIRST
cd ../pike-lsp

# Remove the worktree
git worktree remove ../pike-lsp-issue-<number> --force 2>/dev/null || true

# If worktree remove failed, manual cleanup
if [ -d "../pike-lsp-issue-<number>" ]; then
  rm -rf ../pike-lsp-issue-<number>
  git worktree prune
fi

# Delete local branch
git branch -D fix/issue-<number> 2>/dev/null || true

# Delete remote branch
git push origin --delete fix/issue-<number> 2>/dev/null || true

# Verify cleanup
echo "=== Cleanup verification ==="
echo "Worktree exists: $([ -d '../pike-lsp-issue-<number>' ] && echo 'YES ❌' || echo 'NO ✅')"
echo "Local branch: $(git branch --list fix/issue-<number> | wc -l | tr -d ' ') (should be 0)"
echo "Remote branch: $(git ls-remote --heads origin fix/issue-<number> | wc -l | tr -d ' ') (should be 0)"
```

**If any line shows ❌ or non-zero, fix it before reporting completion.**

#### 7b: If CI fails → Cleanup then report

```bash
# Same cleanup as 7a
cd ../pike-lsp
git worktree remove ../pike-lsp-issue-<number> --force 2>/dev/null || true
if [ -d "../pike-lsp-issue-<number>" ]; then
  rm -rf ../pike-lsp-issue-<number>
  git worktree prune
fi
git branch -D fix/issue-<number> 2>/dev/null || true
git push origin --delete fix/issue-<number> 2>/dev/null || true
```

Report failure details to lead, **confirm cleanup is done**, then await reassignment.
Do NOT leave branches or worktrees behind regardless of outcome.

---

### FORBIDDEN (Worker):
- ❌ Do NOT merge your own PR
- ❌ Do NOT push directly to main
- ❌ Do NOT use npm, npx, yarn, or pnpm — use bun exclusively
- ❌ Do NOT write TypeScript without strict mode
- ❌ Do NOT write Pike files without `#pragma strict_types`
- ❌ Do NOT use regex for Pike parsing — use Parser.Pike
- ❌ Do NOT work on issues without `safe` label
- ❌ Do NOT work on issues with `needs-template` label (notify lead to fix via Step 2b first)
- ❌ Do NOT interact with issues labeled `pending-review`
- ❌ Do NOT interact with unlabeled issues
- ❌ Do NOT develop outside worktree
- ❌ Do NOT skip cleanup after PR merge or CI failure
- ❌ Do NOT leave stale branches (local or remote)
- ❌ Do NOT leave stale worktrees
- ❌ Do NOT report completion without verifying cleanup
- ❌ Do NOT use `git push --force` — always use `--force-with-lease` for rebased branches
- ❌ Do NOT blindly accept `--ours` or `--theirs` during conflict resolution — understand what changed
- ❌ Do NOT skip the full verify sequence after rebasing (rebase can break things silently)
- ❌ Do NOT ignore merge conflict status on your PR — check mergeability before considering yourself done
- ✅ ONLY work on issues with `safe` label and without `needs-template`
- ✅ ALWAYS run cleanup verification and confirm zero residual artifacts
- ✅ ALWAYS check PR mergeability after push — if CONFLICTING, rebase immediately (Step 6b)
- ✅ ALWAYS re-verify (lint, typecheck, build, test) after every rebase
