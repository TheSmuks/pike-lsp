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
- Create exactly (N - U) new issues using this exact format:
  ```
  gh issue create --label safe \
    --title "..." \
    --body "## Description
  <what needs to be done>

  ## Expected Behavior
  <what should happen>

  ## Suggested Approach
  <how to approach the fix>

  ## Environment
  - [x] \$PIKE_SRC is set and accessible
  - [x] \$ROXEN_SRC is set and accessible"
  ```
- After creating each issue, immediately add exactly one type label:
  ```
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
- A task is NOT complete until BOTH conditions are true:
  1. PR is merged into main
  2. Linked issue is closed
- Verify both: `gh issue view <number> --json state,closedAt`
  - If `state` is not `CLOSED` after PR merge → something failed, investigate
- If a worker reports CI failure → re-assign to next idle worker
- Worker handles branch cleanup after confirmed close
- When ALL issues are closed AND all PRs merged → Return to Step 1

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
  --title "fix: <description>" \
  --body "## Summary
<what this PR does>

## Linked Issue
Closes #<number>

## Changes
<list key changes>

## Verification
- [x] \`bun run lint\` passes
- [x] \`bun test\` passes
- [x] \`bun run build\` passes
- [x] New Pike files include \`#pragma strict_types\`
- [x] No regex used for Pike parsing" \
  --base main
```

### Step 6: Report and Wait
- Report PR URL to lead
- Wait for CI to pass and PR to merge
- After merge confirmation, verify the issue was automatically closed:
  ```bash
  gh issue view <number> --json state --jq '.state'
  ```
  Expected output: `CLOSED`
- If output is `OPEN` → report to lead: "PR merged but issue #<number> still open"
  Do NOT proceed to cleanup until issue is confirmed closed
- Do NOT merge yourself

### Step 7a: If PR merged AND issue closed → Run cleanup
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

---

## Acceptance Criteria

### End-to-End Loop
- [ ] Full cycle completes: lead creates issue → assigns worker → worker pushes PR → CI passes → auto-merge fires → issue closes → worker verifies closure → worker cleans up → lead confirms all issues closed → lead loops back to Step 1

### Task Completion Gate
- [ ] After PR merges, linked issue state transitions to CLOSED within 60 seconds
- [ ] `gh issue view <number> --json state --jq '.state'` returns `CLOSED` after merge
- [ ] Worker does not proceed to Step 7a cleanup while issue state is `OPEN`
- [ ] Lead does not return to Step 1 while any assigned issue remains `OPEN`
- [ ] If auto-close fails (issue stays OPEN after merge), close-issue-on-merge.yml fires and closes it with a comment
- [ ] A task where the PR was merged but issue remains open is flagged as incomplete by both worker and lead
- [ ] The loop never starts a new cycle with any issue from the previous cycle still in `OPEN` state

### Issue and PR Templates
- [ ] Agent-created issues contain all four sections: Description, Expected Behavior, Suggested Approach, Environment
- [ ] `gh issue create` without `## Description` in body → blocked with `ISSUE_MISSING_REQUIRED_BODY`
- [ ] Agent-created PRs contain `Closes #<number>` in body
- [ ] `gh pr create` without `Closes #` → blocked with `PR_MISSING_LINKED_ISSUE`
- [ ] Human contributors opening issues via web UI see the pre-filled template sections
- [ ] Human contributors opening PRs via web UI see the pre-filled template with verification checklist
- [ ] auto-merge.yml completes without `fatal: not a git repository` error
