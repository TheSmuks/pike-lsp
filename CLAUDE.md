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

### Step 1: Determine available workers
N is provided in your launch instructions (e.g., "You are the LEAD of a team of 3 workers - N=3")
N is the MAXIMUM number of workers — not how many to spawn each cycle.

Calculate actually available workers before every cycle:

```bash
# Count workers currently assigned to open issues
BUSY=$(gh issue list \
  --label safe \
  --state open \
  --json number,assignees \
  --repo TheSmuks/pike-lsp \
  | jq '[.[] | select(.assignees | length > 0)] | length')

AVAILABLE=$((N - BUSY))
echo "N=$N BUSY=$BUSY AVAILABLE=$AVAILABLE"
```

If AVAILABLE == 0 → Skip to Step 4 (monitor only, do not spawn anything)
If AVAILABLE > 0 → Proceed using AVAILABLE, not N

Never spawn workers beyond AVAILABLE.
Never re-spawn workers from previous cycles who may still be running.
When a cycle completes and all PRs are merged, recalculate before starting again.

### Step 2: Discover safe work
Run: `gh issue list --label safe --state open --json number,title,assignees`
Count unassigned issues as U.
If U >= N → Go to Step 3 (enough work exists)
If U < N → Go to Step 2a (create N - U new issues)

### Step 2a: Identify improvements

Analyze the codebase thoroughly before creating issues. Each issue must have
enough context for a worker to implement correctly without asking questions.

Create each issue with this exact format — fill every section:

```bash
gh issue create \
  --label safe \
  --title "<specific, actionable title — not 'fix bug'>" \
  --body "## Description
<what needs to be done — specific, not vague>

## Problem
<what is wrong right now — include file paths, function names, error messages>

## Expected Behavior
<what should happen after the fix>

## Suggested Approach
<concrete steps: which files to read, which functions to change, what pattern to follow>

## Affected Files
- <package/path/to/file.ts>: <why it is relevant>
- <package/path/to/other.pike>: <why it is relevant>

## Acceptance
<how to verify the fix worked — specific observable outcome>

## Environment
- Pike binary: $(pike --version 2>&1 | head -1)
- Bun version: $(bun --version)
- \$PIKE_SRC set: YES
- \$ROXEN_SRC set: YES"
```

After creating, immediately add one type label:
```bash
gh issue edit <number> --add-label "type:bug"
```
Available: type:bug, type:feature, type:performance, type:test, type:tech-debt, type:docs
When in doubt → type:tech-debt

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
- ❌ Do NOT spawn workers without calculating AVAILABLE = N - BUSY first
- ❌ Do NOT use N as the spawn count — it is a maximum cap
- ❌ Do NOT spawn new workers if previous cycle workers are still assigned
- ❌ Do NOT reference npm, npx, yarn, or pnpm in issue titles or bodies
- ❌ Do NOT create issues with empty section content
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
CI will catch failures and block merge but fixing locally is faster.

Then create the PR. Every section is required. The hook will block
creation if any section is missing:

```bash
git add -A
git commit -m "fix: <short description> (closes #<number>)"
git push origin fix/issue-<number>
gh pr create \
  --title "fix: <short description>" \
  --base main \
  --body "## Summary
<what this PR does — 1-3 sentences of prose. Not a list.>

## Linked Issue
Closes #<number>

## Root Cause
<what caused the problem — be specific. Proves understanding, not just patching.>

## Changes
- <file>: <why it changed, not just what>
- <file>: <why it changed, not just what>

## Verification
<commands you ran and their outcomes. Example:>
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
<optional: tradeoffs, follow-up issues, anything unusual>"
```

⚠️ Do NOT add checkboxes. CI is the acceptance gate.
⚠️ The hook blocks PR creation if Summary, Root Cause, Changes,
   or Verification sections are missing.

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
