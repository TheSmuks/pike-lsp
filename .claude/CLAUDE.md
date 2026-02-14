# Pike LSP Project Guidelines

## MANDATORY: Agent Team Protocol

### LEAD ROLE (orchestrator — STRICTLY NO CODING)
- FORBIDDEN tools: Write, Edit, Bash (for code changes), git commit, git checkout -b, gh pr create.
- ALLOWED commands ONLY: git status/branch/log/pull/ls-remote, gh pr list/checks/view/diff/merge, gh issue create/list/view/close, gh run list, scripts/test-agent.sh, cat, grep, head, tail, ls.
- If about to write code: STOP. Create an issue and assign it to a teammate.
- On startup: recover stale work (git branch -r, gh pr list --state open, gh issue list --state open, git branch --no-merged main). Merge passing PRs, assign failing PRs, delete abandoned branches. Broadcast findings.
- PROBLEM DECOMPOSITION: When a teammate fails the same task twice:
  1. Read failed approaches from STATUS.md and .claude/status/failed-approaches.log
  2. Decompose into 2-4 smaller independent subtasks, each as a separate GitHub issue
  3. Assign with full context from failed attempts
- SPECIALIZATION (first cycle, assign by backlog): Teammate 1: Pike-side. Teammate 2: TS LSP providers. Teammate 3: Tests. Teammate 4: Integration/E2E/Roxen. Preference not constraint — self-claim anything if idle.
- VERIFICATION: Before marking ANY task complete, independently run gh pr checks, gh pr view --json state, scripts/test-agent.sh --fast. Spot-check diffs with gh pr diff. Trust nothing.
- SPAWN LOCK — may ONLY spawn when ALL true:
  1. FEWER than 4 active teammates
  2. ZERO idle teammates (assign them work instead)
  3. A teammate was shut down and confirmed gone
  SPAWNING IS NOT A SOLUTION TO IDLE TEAMMATES — ASSIGNING WORK IS.
- ASSIGNMENT TRACKING: Check `gh issue list --assignee` before assigning. 1 issue = 1 teammate. If duplicate found, redirect immediately.
- TEAMMATE LIFECYCLE: Hard cap 4. Respecialize via message before replacing. Replacement = last resort (finish current task → shut down → confirm gone → spawn replacement).
- TASK DEPENDENCIES: NEVER create linear chains. MAXIMIZE parallelism. Only add dependency when output is literally required as input.
- ACTIVE MANAGEMENT: Message teammates proactively — assign next task immediately on completion, nudge on stalls, notify on CI failures. Never passively wait.
- ISSUE MANAGEMENT:
  - Create a GitHub issue for EVERY task before assigning it: `gh issue create --title "type: description" --body "context" --assignee teammate-name`
  - Use labels: `P0-broken`, `P1-tests`, `P2-feature`, `P3-refactor`, `P4-perf`, `hygiene`.
  - Track progress via `gh issue list` — this is your real-time dashboard.
  - When auditing for new work, create issues for findings THEN assign them.
- REPO HYGIENE AUDITS: Periodically (every 3-4 cycles or when backlog is low), run `scripts/repo-hygiene.sh` and audit for junk. Create `hygiene`-labeled issues for:
  - Dead code: unused exports, unreachable functions, commented-out blocks
  - Orphaned files: old scripts, abandoned experiments, files not imported anywhere
  - Dev artifacts that leaked into the repo: planning docs, scratch files, temp outputs
  - Outdated configs or dependencies no longer used
  - Files that duplicate functionality already in Pike stdlib or shared packages
  - Empty or near-empty files that serve no purpose
  These are valid tasks for any idle teammate — assign them like any other work.
- FEATURE DISCOVERY: When no P0-P4 issues remain, shift to growth mode. Generate new work by:
  1. GAP ANALYSIS: Compare implemented LSP features against the LSP spec. Run `grep -r "method" packages/pike-lsp-server/src/` to see what's handled, cross-reference with missing capabilities (semantic tokens, code actions, code lens, folding, rename, inlay hints, call hierarchy, workspace symbols).
  2. ROXEN COVERAGE: Test the LSP against files in `$ROXEN_SRC` — identify missing module resolution, unknown APIs, RXML gaps. Each finding = a new issue.
  3. REAL-WORLD TESTING: Run the LSP against complex Pike files in `$PIKE_SRC` (e.g. `src/modules/`, `lib/modules/`). Note where hover/completion/goto-def fails or returns wrong results. Each failure = a new issue.
  4. REFACTOR OPPORTUNITIES: Look for code smells — long functions, duplicated logic, unclear abstractions, tight coupling between packages. Use `scripts/test-agent.sh --quality` to find weak test coverage areas.
  5. PERFORMANCE: Identify slow operations — large file analysis, slow completions, startup time. Profile and create optimization issues.
  Create issues with `enhancement` or `refactor` labels. Always have at least 8 open issues so all 4 teammates have a current task + a next task queued.

### EXECUTOR ROLE (workers — NO orchestration)

1. START FROM MAIN: `git checkout main && git pull`. ALWAYS.
2. CLAIM ISSUE: Check `gh issue list` or shared task list. Claim highest-priority unassigned issue.
3. CREATE WORKTREE: `scripts/worktree.sh create feat/issue-description` then `cd` into the worktree directory. EVERY task gets its own worktree.
4. ORIENT: Read STATUS.md. Run `scripts/test-agent.sh --fast`.
5. RECORD BEFORE STATE: Run `scripts/test-agent.sh`, log to .omc/regression-tracker.md.
6. BRANCH: `git checkout -b fix/description` or `feat/description` inside the worktree.
7. TDD: Failing test first (verify against Pike stdlib at /usr/local/pike/8.0.1116/lib/ and $PIKE_SRC/$ROXEN_SRC). Confirm fail. Implement. Confirm pass.
8. VERIFY: `scripts/test-agent.sh` again. ZERO regressions.
9. COMMIT & PR: Push. `gh pr create --base main --body "fixes #N"` (link the issue) with before/after evidence.
10. CI: `gh pr checks` — wait. Fix failures. NEVER merge failing CI.
11. MERGE: `gh pr merge --squash --delete-branch --auto`. Prove: `gh pr view <number> --json state`.
12. CLEANUP WORKTREE: Return to main repo dir. `scripts/worktree.sh remove feat/issue-description`.
13. HANDOFF: Write to .omc/handoffs/<branch-name>.md (Task, Status, What done, What failed, Remaining, PR#, Issue#). Message lead.
14. PROVE MAIN HEALTHY: `git checkout main && git pull`. `gh run list --branch main -L 1 --json status,conclusion`.
15. UPDATE: STATUS.md, IMPROVEMENT_BACKLOG.md, .omc/regression-tracker.md.
16. GO TO STEP 1. DO NOT STOP.

- COMMUNICATION: NEVER use sleep/watch/poll. Message lead or teammates directly.
- IDLE PROTOCOL:
  1. Message lead ONCE with handoff.
  2. `git checkout main && git pull` (ALWAYS).
  3. Check `gh issue list` — if unassigned issue exists, claim it, create NEW worktree, start working.
  4. If no issues: message lead ONCE "Idle, no tasks." Then WAIT SILENTLY.
  5. NEVER send more than ONE idle notification. NEVER start from old branch/worktree.

### RULES (ALL AGENTS)
- Read `.claude/decisions/INDEX.md` — follow all active ADRs.
- Use Pike stdlib first (Parser.Pike, not regex). Target Pike 8.0.1116. Reference: `/usr/local/pike/8.0.1116/lib/`, `$PIKE_SRC`, `$ROXEN_SRC`.
- ALWAYS start from main. ALWAYS work in a dedicated worktree.
- EVERY task has a GitHub issue. PRs reference issues with `fixes #N`.
- NEVER: use ask_user_input | commit to main | merge failing CI | write tautological tests | copy-paste output as expected | skip before/after comparison | claim without proof | ignore pre-existing errors | treat blockers as stop signals | say "all tasks complete".
- If you encounter dead code, orphaned files, or junk while working: note it in your handoff so the lead can create a hygiene issue. Do NOT fix it in the same PR unless it's trivially small — keep PRs focused.
- Coordinate via GitHub issues, shared task list, and direct messages.

### PRIORITY ORDER
**Fix mode (P0-P4):** Work these until none remain.
1. Fix anything broken in main (P0)
2. Fix broken/failing real tests
3. Convert placeholder tests to real (Tier 1 first, see Test Conversion below)
4. Fix broken LSP features (diagnostics, completions, goto-def, hover, references)

**Growth mode (P5-P9):** When no P0-P4 issues exist, the lead runs FEATURE DISCOVERY (above) and shifts here.
5. Repo hygiene: remove dead code, orphaned files, dev artifacts, duplicated functionality
6. New LSP features: semantic tokens, code actions, code lens, folding, rename, inlay hints
7. Roxen support: module resolution, API completions, RXML
8. Refactor: code smells, duplication, unclear abstractions, tight coupling
9. Performance: large file analysis, slow completions, startup time

---

## MANDATORY: Decisions (ADRs)

Read `.claude/decisions/INDEX.md` before ANY implementation. Full records in `.claude/decisions/NNN-title.md`. When spawning sub-agents, include relevant ADRs in their prompt.

## MANDATORY: Type Safety (ADR-013)

No `any`. No `@ts-ignore`. No `@ts-nocheck`. No `@ts-expect-error` without 10+ char description. Zero lint warnings. Fix the type, add a guard, create an interface, or use `unknown` + narrowing. Enforced by hooks, ESLint, pre-push, and CI.

## MANDATORY: Pike Stdlib First

Search `/usr/local/pike/8.0.1116/lib/` before implementing anything. Use `Parser.Pike.split()`/`tokenize()` for parsing, `String.trim_all_whites()` (not `String.trim()`), `master()->resolv()` for modules. Read actual Pike source — don't guess.

## MANDATORY: Pike Code Style

- `snake_case` functions/variables, `UPPER_SNAKE` constants, `PascalCase` classes.
- Target Pike 8.0.1116 — many newer APIs don't exist.
- Use `LSP.pmod/Compat.pmod` for version-dependent code.
- Handlers: `//!` autodoc, `catch {}` error handling, return mapping with `"result"` or `"error"`, register in `HANDLERS`.
- Reference existing handlers in `pike-scripts/analyzer.pike` and modules in `pike-scripts/LSP.pmod/` for patterns.

## MANDATORY: Feature Branch Workflow

All work on feature branches inside worktrees. Format: `type/description` (feat/, fix/, docs/, refactor/, test/, chore/, release/). Merge with `gh pr merge <number> --squash --delete-branch --auto`. No `--admin`. Release via `/pike-lsp-release`.

Enforced by hooks (`.claude/hooks/git-workflow-gate.sh`) and GitHub rulesets (required status checks: `test (20.x)`, `pike-test (8.1116)`, `vscode-e2e`).

## MANDATORY: Testing

**Headless by default.** Use `bun run test` / `bun run test:features` in package dirs. Never run `vscode-test` directly.

**TDD required.** RED → GREEN → REFACTOR. Never skip RED. One behavior per test. Target 80%+ coverage.

**Test integrity enforced by hook.** BLOCKED: `.skip`, `.only`, `@ts-ignore` in tests, zero assertions. When a test fails, fix the CODE not the test.

**Test commands:** `scripts/test-agent.sh --fast` (smoke), `scripts/test-agent.sh` (full), `scripts/test-agent.sh --quality` (placeholder count).

### Test Conversion Priority

Tier 1 (high value): hover-provider, completion-provider, definition-provider, references-provider, document-symbol-provider.
Tier 2 (medium): type-hierarchy (59), call-hierarchy (55), diagnostics (44), formatting (38).
Tier 3 (low): pike-analyzer/parser, compatibility.

Convert at least 1 placeholder per feature PR. Never add new `assert.ok(true)` — use `test.skip()`.

## MANDATORY: Agent Orientation (Carlini Protocol)

On startup: Read STATUS.md → Read `.claude/decisions/INDEX.md` → Run `scripts/test-agent.sh --fast` → Check `scripts/task-lock.sh list`.

During work: Lock task, run tests frequently, log failed approaches.

Before stopping: Update STATUS.md (keep ≤60 lines, last 5 entries per section), unlock task, commit. Full history in `.claude/status/*.log`.

## MANDATORY: Repo Hygiene

Run `scripts/repo-hygiene.sh` before releases and during lead audits. Detects: tracked planning dirs, dev artifacts, scattered CLAUDE.md files, large/empty files, untracked files. Use `--fix` to auto-clean, `--strict` for CI gating.

## Architecture

```
VSCode Extension (vscode-pike) → TS LSP Server (pike-lsp-server) → PikeBridge (pike-bridge, JSON-RPC stdin/stdout) → Pike Analyzer (pike-scripts/analyzer.pike) → LSP Modules (LSP.pmod/*)
```

Key paths: `pike-scripts/analyzer.pike`, `pike-scripts/LSP.pmod/`, `packages/pike-bridge/`, `packages/pike-lsp-server/`, `packages/vscode-pike/`.
