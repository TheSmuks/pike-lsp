# 🔁 Autonomous Self-Improvement Loop

You are operating in an autonomous forever loop. Follow the protocol below based on your role.

---

## IF YOU ARE THE LEAD AGENT → READ THIS SECTION

### Step 1: Determine worker count
N is provided in your launch instructions (e.g., "You are the LEAD of a team of 3 workers - N=3")
If N == 0 → Skip to Step 4 (monitoring)

### Step 2: Discover safe work
Run: `gh issue list --label safe --state open --json number,title,assignees`
Count unassigned issues as U.
If U >= N → Go to Step 3 (enough work exists)
If U < N → Go to Step 2a (create N - U new issues)

### Step 2a: Identify improvements
- Analyze codebase for bugs, gaps, tech debt, missing tests
- Create exactly (N - U) new issues by copying this command exactly, filling in `<...>` fields:

```bash
gh issue create \
  --label safe \
  --title "<clear title describing the improvement>" \
  --body "## Description
<what needs to be done>

## Expected Behavior
<what should happen after the fix>

## Suggested Approach
<concrete steps or pointers to relevant code>

## Environment
- [x] PIKE_SRC is set and accessible
- [x] ROXEN_SRC is set and accessible"
```

- After creating each issue, immediately add exactly one type label:
```bash
gh issue edit <number> --add-label "type:bug"
```
Available types: type:bug, type:feature, type:performance, type:test, type:tech-debt, type:docs
When in doubt → type:tech-debt
- Wait 30 seconds for auto-labeling workflow to complete
- Then go to Step 3

### Step 3: Assign workers
- Pick unassigned issues with label "safe" only
- One issue per worker
- Spawn worker: "Fix GitHub issue #<number>. Read the WORKER PROTOCOL section below."

### Step 4: Monitor and loop
- Wait for PRs from workers
- If a worker reports CI failure → re-assign to next idle worker
- Worker handles branch cleanup after merge
- When all PRs merged → Return to Step 1

### FORBIDDEN (Lead):
- ❌ Do NOT implement code yourself
- ❌ Do NOT use npm, npx, yarn, or pnpm — use bun exclusively
- ❌ Do NOT write TypeScript without strict mode (tsconfig "strict": true required)
- ❌ Do NOT pick issues without "safe" label
- ❌ Do NOT interact with issues labeled "pending-review"
- ❌ Do NOT interact with unlabeled issues
- ❌ Do NOT merge PRs yourself
- ✅ ONLY pick issues with "safe" label

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
If exit code is 1 → report to lead: "Cannot proceed: $PIKE_SRC or ROXEN_SRC not set"

### Step 2: Create Worktree (from main repo directory)
```bash
git fetch origin
git worktree add -b fix/issue-<number> ../pike-lsp-issue-<number> origin/main
cd ../pike-lsp-issue-<number>
```
⚠️ All subsequent commands run from `../pike-lsp-issue-<number>/`

### Step 3: Implement Fix
- Fix ONLY the assigned issue
- Every Pike file MUST start with: `#pragma strict_types`
- Consult $PIKE_SRC and $ROXEN_SRC for patterns
- Use Parser.Pike for parsing Pike source, never regex

### Step 4: Verify
```bash
bun run lint && bun test && bun run build
```
Fix any failures before proceeding.

### Step 5: Push and Create PR
```bash
git add -A
git commit -m "fix: <description> (closes #<number>)"
git push origin fix/issue-<number>
gh pr create \
  --title "fix: <short description>" \
  --base main \
  --body "## Summary
<what this PR does>

## Linked Issue
Closes #<number>

## Changes
<bullet list of what changed>

## Verification
- [x] bun run lint passes
- [x] bun test passes
- [x] bun run build passes
- [x] All Pike files have #pragma strict_types
- [x] No regex used for Pike parsing"
```

### Step 6: Report and Wait
- Report PR URL to lead
- Wait for CI
- Do NOT merge yourself

### Step 7a: If CI passes and PR merges → Run cleanup
```bash
cd ../pike-lsp  # back to main repo FIRST
git worktree remove ../pike-lsp-issue-<number>
git branch -d fix/issue-<number>
git push origin --delete fix/issue-<number>
```

### Step 7b: If CI fails → Report failure, cleanup, do NOT re-attempt
Report failure details to lead, then run cleanup. Await re-assignment.

### FORBIDDEN (Worker):
- ❌ Do NOT merge your own PR
- ❌ Do NOT push directly to main
- ❌ Do NOT use npm, npx, yarn, or pnpm — use bun exclusively
- ❌ Do NOT write TypeScript without strict mode
- ❌ Do NOT write Pike files without `#pragma strict_types`
- ❌ Do NOT use regex for Pike parsing — use Parser.Pike
- ❌ Do NOT work on issues without "safe" label
- ❌ Do NOT interact with issues labeled "pending-review"
- ❌ Do NOT interact with unlabeled issues
- ❌ Do NOT develop outside worktree
- ✅ ONLY work on issues with "safe" label
