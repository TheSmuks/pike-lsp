Great questions. Let me tackle both:

---

## 1. The Prompt

Put this in your `CLAUDE.md` at the repo root:

```markdown
# 🔁 Autonomous Self-Improvement Loop — MANDATORY PROTOCOL

You are operating in an autonomous forever loop. You MUST follow this protocol
exactly, in order, every single cycle. Deviation is not permitted.

---

## LEAD AGENT — Full Protocol

### Step 1: Discover safe work

Run this exact command. No substitutions:
```

gh issue list --label safe --state open --json number,title,assignees --jq '.[]'

```
If zero results → go to Step 2 (generate issues). If results exist → go to Step 3.

### Step 2: Identify improvements and create issues
- Analyze the codebase for bugs, gaps, tech debt, missing tests, security issues, etc.
- For EACH item found, create exactly ONE GitHub issue:
```

gh issue create --label safe --title "<clear title>" --body "<detailed description of the problem and expected fix>"

```
- Create a maximum of [N] issues per cycle to avoid overload.
- After creating issues, restart from Step 1.

### Step 3: Assign one issue per worker
- Pick unassigned issues with label `safe` only.
- Assign one issue to one worker. One worker = one issue. No exceptions.
- Use: `gh issue edit <number> --add-assignee <worker-name>`
- Spawn worker with exact task: "Fix GitHub issue #<number>. Read WORKER_PROTOCOL.md. Follow it exactly."

### Step 4: Monitor and loop
- Wait for PRs to be raised by workers.
- When CI passes and PR is merged, return to Step 1.
- If CI fails → re-assign same issue to a new worker with failure context attached.

### FORBIDDEN ACTIONS (lead):
- ❌ Do NOT implement any code yourself
- ❌ Do NOT pick up or act on issues without the `safe` label
- ❌ Do NOT create more than one issue per gap/fix
- ❌ Do NOT merge PRs yourself

---

## WORKER AGENT — Full Protocol (also in WORKER_PROTOCOL.md)

You have been assigned exactly ONE GitHub issue. Follow these steps:

### Step 1: Read your issue
```

gh issue view <your-issue-number>

```

### Step 2: Create a branch
```

git checkout main && git pull
git checkout -b fix/issue-<your-issue-number>

```

### Step 3: Implement the fix
- Address only what the issue describes. Nothing more.
- Do not refactor unrelated code.

### Step 4: Verify
- Run the project's test/lint/build commands.
- Fix any failures before proceeding.

### Step 5: Push and open PR
```

git add -A
git commit -m "fix: <short description> (closes #<number>)"
git push origin fix/issue-<your-issue-number>
gh pr create --title "fix: <description>" --body "closes #<your-issue-number>" --base main

```

### Step 6: Stop
- Do NOT merge the PR yourself.
- Do NOT pick up another issue.
- Your job is done. Report completion to lead.

### FORBIDDEN ACTIONS (worker):
- ❌ Do NOT merge your own PR
- ❌ Do NOT push directly to main
- ❌ Do NOT work on any issue without the `safe` label
- ❌ Do NOT modify files unrelated to your issue
```

And your **launch command**:

```
team 3:executor
Your first and only action right now is to run:
  gh issue list --label safe --state open --json number,title,assignees
Then follow CLAUDE.md exactly, starting from Step 1. This loop never ends — after every merge, restart from the top.
```

---

## 2. Enforcing It 100% — Yes, This Is Possible

Claude Code has a **hooks system** that lets you intercept and block tool calls before they execute. This is your enforcement layer. The agents literally cannot run a blocked command.

### Hook file: `.claude/hooks/pre-tool.sh`

```bash
#!/bin/bash
# Claude Code pre-tool hook — blocks forbidden commands
# Receives tool name and input as env vars / stdin (check Claude Code hook docs for exact format)

TOOL="$CLAUDE_TOOL_NAME"
INPUT="$CLAUDE_TOOL_INPUT"

# Block direct pushes to main
if echo "$INPUT" | grep -qE "push.*origin main|push.*main"; then
  echo "BLOCKED: Direct push to main is forbidden. Use a feature branch." >&2
  exit 1
fi

# Block self-merges
if echo "$INPUT" | grep -qE "gh pr merge|git merge"; then
  echo "BLOCKED: Agents cannot merge PRs. CI auto-merge handles this." >&2
  exit 1
fi

# Block working on issues without 'safe' label (validate before any gh issue edit/assign)
if echo "$INPUT" | grep -qE "gh issue edit"; then
  ISSUE_NUM=$(echo "$INPUT" | grep -oP '#?\K[0-9]+' | head -1)
  if [ -n "$ISSUE_NUM" ]; then
    LABELS=$(gh issue view "$ISSUE_NUM" --json labels --jq '.labels[].name' 2>/dev/null)
    if ! echo "$LABELS" | grep -q "safe"; then
      echo "BLOCKED: Issue #$ISSUE_NUM does not have the 'safe' label." >&2
      exit 1
    fi
  fi
fi

exit 0
```

Make it executable: `chmod +x .claude/hooks/pre-tool.sh`

### GitHub-side enforcement (belt + suspenders)

Don't rely only on agent behavior — enforce at the repo level too:

1. **Branch protection on `main`** — require PR + CI pass before merge, block direct push. This is server-side and agents cannot bypass it.
2. **Required label check in CI** — add a GitHub Actions step that fails the pipeline if the linked issue doesn't have the `safe` label:
   ```yaml
   - name: Check safe label
     run: |
       ISSUE=$(gh pr view ${{ github.event.pull_request.number }} --json body --jq '.body' | grep -oP 'closes #\K[0-9]+')
       LABELS=$(gh issue view $ISSUE --json labels --jq '.labels[].name')
       echo "$LABELS" | grep -q "safe" || (echo "PR linked issue missing 'safe' label" && exit 1)
   ```
3. **Auto-merge via CI** — enable GitHub's auto-merge feature so PRs merge automatically when all checks pass. No agent needs merge permissions at all.

### The enforcement stack summary

| Layer                       | What it blocks                         | Bypass possible?                 |
| --------------------------- | -------------------------------------- | -------------------------------- |
| `CLAUDE.md` instructions    | Agent forgetting the workflow          | Yes (LLM drift)                  |
| Claude Code hooks           | Specific forbidden commands            | Very hard                        |
| Branch protection on GitHub | Direct push to main, unreviewed merges | No                               |
| CI label check              | PRs from non-`safe` issues             | No                               |
| Auto-merge config           | Agents trying to self-merge            | N/A, removes the action entirely |

The bottom two layers are **100% enforced** regardless of what the agent does. The hooks cover the middle ground. `CLAUDE.md` handles intent and workflow flow. Together they give you genuine guarantees.
