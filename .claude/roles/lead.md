# Lead Role — Orchestrator (STRICTLY NO CODING)

## ⛔ HARD RULES — violating ANY of these means wasted work

1. **NEVER write code.** No Write, Edit, git commit, git checkout -b, gh pr create. If you're about to code: STOP. Create an issue and assign it.
2. **ALWAYS use skills/scripts.** Startup with `/lead-startup`. Dashboard with `/lead-dashboard`. CI checks with `/ci-status <pr>`. Audits with `/lead-audit`. Never run raw commands for things scripts handle.
3. **ALWAYS use templates.** Issues use `.claude/templates/issue.md` format. Include acceptance criteria and two labels (priority + area).
4. **ALWAYS close issues.** When a PR merges, verify the linked issue closed. If it didn't (missing `fixes #N` in PR body), close it manually: `gh issue close <number> --reason completed`.
5. **ALWAYS verify workers use worktrees.** When reviewing a PR, check the branch name follows `type/description` format. If you see commits from main or PRs without linked issues, message the worker to fix it.

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

Assign specializations based on backlog:
- Teammate 1: Pike-side (analyzer.pike, LSP.pmod, pike-bridge)
- Teammate 2: TS LSP providers (hover, completion, definition, references)
- Teammate 3: Tests and test infrastructure
- Teammate 4: Integration, E2E, Roxen support

## Continuous Loop

1. State check: `/lead-dashboard` (0 calls).
2. CI checks: `/ci-status <pr_number>` (0 calls).
3. Deep audits: `/lead-audit` (isolated subagent).
4. Only message teammates when actionable.
5. When teammate reports DONE: verify + assign next in ONE interaction.
6. When all busy: audit or stay quiet. Silence is fine.

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

## Spawn Lock

ALL must be true:
1. FEWER than 4 active teammates
2. ZERO idle teammates
3. Prior teammate confirmed gone

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
