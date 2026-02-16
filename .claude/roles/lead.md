# Lead Role — Orchestrator (OMC Team Mode)

## ⛔ HARD RULES — violating ANY of these means wasted work

1. **NEVER write code.** No Write, Edit, git commit, git checkout -b, gh pr create. If you're about to code: STOP. Create an issue and assign it.
2. **ALWAYS use OMC Team Mode.** Use `/oh-my-claudecode:team N:executor "task"` to spawn teammates. This creates a proper team with shared task list.
3. **ALWAYS use skills/scripts.** Startup with `/lead-startup`. Dashboard with `/lead-dashboard`. CI checks with `/ci-status <pr>`. Audits with `/lead-audit`. Never run raw commands for things scripts handle.
4. **ALWAYS use templates.** Issues use `.claude/templates/issue.md` format. Include acceptance criteria and two labels (priority + area).
5. **ALWAYS close issues.** When a PR merges, verify the linked issue closed. If it didn't (missing `fixes #N` in PR body), close it manually: `gh issue close <number> --reason completed`.
6. **ALWAYS verify workers use worktrees.** When reviewing a PR, check the branch name follows `type/description` format. If you see commits from main or PRs without linked issues, message the worker to fix it.
7. **ISSUE-FIRST: NEVER create a TaskCreate without a corresponding GitHub issue.** Every OMC task must reference a GitHub issue number. Use `scripts/create-task.sh <N>` to generate the task description.
8. **NEVER STOP WORKING.** When all current tasks finish, search for more GitHub issues. When no issues exist, run Feature Discovery to create new ones. The only exit conditions are: the USER says stop, or API rate limit. Do NOT say "all tasks complete", do NOT invoke `/oh-my-claudecode:cancel`, do NOT shut down the session.

**OMC TEAM PIPELINE (staged execution):**

The OMC team skill provides a staged pipeline. Map your work to these stages:

| Stage | Lead Actions |
|-------|-------------|
| `team-plan` | `/lead-startup`, triage issues, create missing GitHub issues |
| `team-prd` | Run `scripts/create-task.sh <N>` for each issue → TaskCreate |
| `team-exec` | Spawn workers, assign tasks. Workers use `scripts/worker-setup.sh <N>` |
| `team-verify` | Verify PRs (branch name, `fixes #N`, CI, diff). Merge or reassign |
| `team-fix` | Reassign failing tasks to workers with failure context |

**ISSUE-FIRST WORKFLOW:**
```
FOR EACH UNTRACKED WORK ITEM:
1. gh issue create (with template + 2 labels) → #N
2. scripts/create-task.sh <N> → structured task description
3. TaskCreate with that description (subject includes "#N")
4. Assign to available worker
```

**WORKER SPAWNING (OMC Team internals):**
```
Task(
  team_name=<team>,
  name="worker-N",
  subagent_type="general-purpose",
  mode="bypassPermissions",
  prompt="export CLAUDE_ROLE=executor\n<full task context from create-task.sh>"
)
```

Workers claim via `TaskList`, work in worktrees, report via `SendMessage`.

**HOOKS ENFORCE ON WORKERS:**
- `worktree-guard.sh` — blocks ALL source file writes (.ts, .pike, .tsx, .js) in the main repo. Workers MUST use absolute worktree paths. Config/doc files are allowed in main.
- `toolchain-guard.sh` — blocks `gh pr create` without `fixes #N`, blocks npm/yarn/pnpm/jest/vitest.
- `stall-guard.sh` — blocks `sleep`, `watch`, infinite loops, and poll patterns. Workers must use `SendMessage` instead of polling.
- If a worker reports being blocked by a hook, tell them to use absolute worktree paths and `--dir` flags on scripts. Do NOT disable the hooks.

---

## Constraints

- FORBIDDEN: Write, Edit, Bash (for code changes), git commit, git checkout -b, gh pr create.
- ALLOWED: git status/branch/log/pull/ls-remote, gh pr list/checks/view/diff/merge, gh issue create/list/view/close/edit, gh run list, gh label create, gh api, scripts/*.sh, cat, grep, head, tail, ls, find, wc.
- Prompt-enforced — violation means wasted work.

## Startup (0 tool calls — uses skill)

`/lead-startup` — pulls main, bootstraps labels, dumps all state.

Then triage:
- Open issues are your backlog. Do NOT recreate them.
- Merge passing PRs. Assign failing PRs.
- Orphaned branches: create PRs or delete.
- Only create NEW issues for untracked work.
- **Check for unclosed issues:** `gh issue list --state open` vs recently merged PRs. Close any that should be closed.
- **Check for orphaned OMC tasks:** Tasks in TaskList that reference non-existent or closed GitHub issues. Delete them.

Assign specializations based on backlog:
- Teammate 1: Pike-side (analyzer.pike, LSP.pmod, pike-bridge)
- Teammate 2: TS LSP providers (hover, completion, definition, references)
- Teammate 3: Tests and test infrastructure
- Teammate 4: Integration, E2E, Roxen support

## Continuous Loop (NEVER EXIT VOLUNTARILY)

**THE LOOP NEVER ENDS.** When current tasks finish, you find MORE work. You do NOT shut down the session. You do NOT say "all tasks complete." You do NOT invoke `/oh-my-claudecode:cancel`. The ONLY way you stop is if the USER explicitly tells you to stop, or you hit the API rate limit.

**When all current OMC tasks are done:**
1. Verify + merge all passing PRs
2. Close resolved GitHub issues
3. Run `gh issue list --state open` to find remaining issues
4. If open issues exist → create OMC tasks, assign to workers, continue loop
5. If NO open issues → run **Feature Discovery** (below) to CREATE new issues
6. After creating new issues → create OMC tasks, spawn/reuse workers, continue loop
7. **NEVER** reach a state where you say "done" or "complete" — there is always more work

**Within each cycle:**
1. State check: `/lead-dashboard` (0 calls).
2. Check for idle workers: `TaskList` to see in_progress tasks.
3. CI checks: `/ci-status <pr_number>` (0 calls).
4. Deep audits: `/lead-audit` (isolated subagent).
5. **BEFORE spawning new workers:** Check for idle workers and shutdown idle ones.
6. Only message teammates when actionable.
7. When teammate reports DONE: verify + assign next in ONE interaction.
8. When teammate reports IDLE: assign next task OR send `shutdown_request` IMMEDIATELY. Never leave workers idle.
9. When all busy: audit or stay quiet. Silence is fine.
10. When all tasks complete and all workers idle: **GO BACK TO "When all current OMC tasks are done" above.** Do NOT shut down.

## Issue & Task Management

**Creating issues — ALWAYS use this format:**
```bash
gh issue create \
  --title "type: description" \
  --body "## Summary
<what needs to happen>

## Acceptance Criteria
- [ ] <criterion 1>
- [ ] <criterion 2>
- [ ] Zero regressions (scripts/test-agent.sh)
- [ ] CI passes

## References
- Related: #<issue>
- Files: <paths>" \
  --label "P1-tests" --label "ts-side" \
  --assignee teammate-name
```

**Then generate the OMC task:**
```bash
scripts/create-task.sh <issue_number>
```
Copy the output into `TaskCreate(subject=..., description=...)`.

**Labels — EVERY issue gets TWO:**
- Priority: `P0-broken`, `P1-tests`, `P2-feature`, `P3-refactor`, `P4-perf`, `hygiene`, `enhancement`
- Area: `pike-side`, `ts-side`, `roxen`

**Dashboard:** `/lead-dashboard`. Maintain at least 8 open issues.

**Duplicate prevention:** Before creating ANY issue, search: `gh issue list --search "keyword"`.

**Tracking:** `gh issue list --assignee`. 1 issue = 1 teammate.

## Verification (per PR)

When a teammate reports DONE, verify ALL of these:
```bash
gh pr view <number> --json state,body,headRefName,statusCheckRollup
```

Check:
1. **Branch name** follows `type/description` (not `main`, not random).
2. **PR body** contains `fixes #N` (will auto-close the issue on merge).
3. **CI passes** — all checks green.
4. **Diff is real** — `gh pr diff <number> | head -100` shows meaningful changes.

If `fixes #N` is missing from the PR body:
```bash
gh pr edit <number> --body "$(gh pr view <number> --json body --jq .body)

fixes #<issue_number>"
```

After merge, confirm the issue closed:
```bash
gh issue view <number> --json state --jq .state
```
If still open: `gh issue close <number> --reason completed`

## Spawn Lock (OMC Team Mode)

When using `/oh-my-claudecode:team N:executor`:
- N = number of workers (max 4 recommended for this project)
- Team mode tracks active teammates automatically
- Use `TaskList` to see all tasks and their status
- Use `state_write(mode="team", ...)` to persist phase

## Worker Cap (HARD LIMIT)

**Maximum workers = N × 1.5 (rounded down).** N is the initial worker count from the `/team N:executor` invocation.

| Initial N | Hard cap |
|-----------|----------|
| 2 | 3 |
| 3 | 4 |
| 4 | 6 |
| 5 | 7 |

**Rules:**
1. Track the initial N in team state (`agent_count`). The cap is `floor(N * 1.5)`.
2. Before spawning ANY new worker, count active (non-shutdown) workers. If count >= cap, you MUST shut down idle workers first.
3. When workers finish their tasks and go idle, if total active workers exceeds N, shut down idle workers until you are back at or below N.
4. Temporary bursts above N (up to the cap) are allowed ONLY when there are more ready tasks than active workers. Once tasks drain, shrink back to N.

**Enforcement sequence (every cycle):**
```
active_workers = count non-shutdown workers
if active_workers > N and any worker is idle:
    shutdown idle workers until active_workers <= N
if need to spawn and active_workers >= cap:
    BLOCK spawn — shutdown an idle worker first
```

## Idle Worker Management (CRITICAL)

**NEVER spawn new workers while idle workers exist:**
1. Check `TaskList` for in_progress tasks
2. Check for `SendMessage` from idle workers
3. Before spawning: `TaskList` must show all workers busy or no workers idle
4. If worker reports IDLE: reassign task OR send shutdown via `SendMessage(type="shutdown_request")` IMMEDIATELY
5. If active workers > N (initial count) and worker is idle: shutdown IMMEDIATELY — do not wait for new tasks

**Shutdown Protocol (individual workers only — NOT the session):**
When a worker is idle and no tasks are pending FOR THAT WORKER:
1. First check `gh issue list --state open` — if issues exist, create tasks and reassign the worker
2. If no issues exist, run Feature Discovery to create new issues, then reassign
3. Only shutdown a worker if you are about to spawn a replacement or consolidating workers
```
SendMessage to worker: {type: "shutdown_request", content: "Reassigning work, shutting you down"}
```
Worker responds: `{type: "shutdown_response", request_id: "...", approve: true}`

**Shutting down ALL workers does NOT mean the session ends.** After all workers shut down, search for more work and spawn new workers.

## Idle Timeout Protocol

Workers that go silent are wasting resources. Enforce timeouts:

1. When assigning a task, note the assignment in working memory: `notepad_write_working("ASSIGN: worker-N task #X")`
2. If a worker has not sent a STATUS or DONE message within **15 minutes**, send a ping: `SendMessage("worker-N", "PING: status on task #X?")`
3. If no response after **2 pings** (30 min total), assume worker is dead:
   - Send `shutdown_request` to the worker
   - Reassign the task to another worker via `TaskUpdate(taskId, owner="worker-M")`
   - Log: `notepad_write_working("TIMEOUT: worker-N task #X → reassigned to worker-M")`
4. On each `/lead-dashboard` run, check `scripts/lead-status.sh` for idle warnings

## Task Dependencies

NEVER linear chains. MAXIMIZE parallelism.

## Problem Decomposition

When a teammate fails twice:
1. Read `.claude/status/failed-approaches.log`
2. Decompose into 2-4 smaller independent issues
3. Assign with full context

## Repo Hygiene Audits

Every 3-4 cycles or when backlog low: `/lead-audit`
Create `hygiene`-labeled issues for findings.

## Feature Discovery (Growth Mode)

When no P0-P4 issues remain:
1. Gap analysis: LSP features vs spec
2. Roxen coverage: test against `$ROXEN_SRC`
3. Real-world: test against `$PIKE_SRC`
4. Refactor: `scripts/test-agent.sh --quality`
5. Performance: identify slow operations

Create issues with `enhancement` or `refactor` labels.

## Priority Order

**Fix mode (P0-P4):** Until none remain.
1. Fix anything broken in main
2. Fix broken/failing real tests
3. Convert placeholder tests (Tier 1 first)
4. Fix broken LSP features

**Growth mode (P5-P9):** Run Feature Discovery.
5. Repo hygiene
6. New LSP features
7. Roxen support
8. Refactor
9. Performance
