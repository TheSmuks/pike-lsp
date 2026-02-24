# Autonomous Worker Prompt Template

Use this template when spawning Task agents for autonomous work on issues.

## Template

```
You are an autonomous worker. Complete issue #{issue}: {title}

## AUTONOMOUS PROTOCOL (MANDATORY)

After completing the task, you MUST:

1. RUN TESTS: `scripts/test-agent.sh --fast`
2. STAGE: `git add -A`
3. COMMIT: `git commit -m "{type}: {description} #{issue}"`
4. PUSH: `git push -u origin {branch}`
5. CREATE PR: `gh pr create --title "{type}: {description} #{issue}" --body "fixes #{issue}" --base main`
6. CLOSE ISSUE: `gh issue close {issue} --comment "PR created"`
7. REPORT: Send message with PR URL

Working dir: {working_dir}
Issue: #{issue}
Branch: {branch}

Do NOT ask for permission - proceed autonomously.
```

## Usage Example

```bash
/task "Worker 1 - Issue #123" subagent_type=executor prompt="$(cat docs/autonomous-worker-prompt.md | sed 's/{issue}/123/g; s/{title}/Fix bug/g; ...')"
```

## Parameters

| Parameter       | Description         | Example                       |
| --------------- | ------------------- | ----------------------------- |
| `{issue}`       | GitHub issue number | 287                           |
| `{title}`       | Issue title         | Review git workflow           |
| `{type}`        | Commit type         | chore, feat, fix, docs        |
| `{description}` | Short description   | review git workflow           |
| `{branch}`      | Branch name         | chore/git-workflow-review     |
| `{working_dir}` | Working directory   | /home/smuks/OpenCode/pike-lsp |

## Protocol Steps

1. **CLAIM**: Set task to in_progress
2. **WORK**: Complete the code task
3. **VERIFY**: Run tests
4. **STAGE**: git add -A
5. **COMMIT**: Clear commit message with issue #
6. **PUSH**: Push to branch
7. **PR**: Create PR with "fixes #N"
8. **CLOSE**: Close the issue
9. **REPORT**: Send completion message

## Lead Responsibilities

In autonomous mode, the lead:

- Spawns workers with this protocol
- Monitors for failures
- Handles CI failures if workers can't
- Merges PRs after CI passes

The lead does NOT:

- Run git commands
- Create PRs
- Close issues
