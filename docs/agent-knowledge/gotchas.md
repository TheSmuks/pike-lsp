# Gotchas - Common Traps

Things that frequently trip up agents.

## The "Test Explorer Already Exists" Trap

**The Trap**: Creating a new test-explorer.ts module when one already exists.

**What Happens**: Duplicate code, wasted effort, confusion.

**How to Avoid**:

```bash
ls src/*test*  # Check for existing test-related files
grep -r "TestController" src/  # Check for existing TestController usage
```

**Lesson**: Search before creating.

---

## The "Duplicate Settings" Trap

**The Trap**: Adding settings to package.json that already exist.

**What Happens**: CI fails with "Duplicate key" or silent errors.

**How to Avoid**:

```bash
grep "pike.settingName" packages/vscode-pike/package.json
```

**Lesson**: Check configuration section before adding.

---

## The "Import Order Matters" Assumption

**The Trap**: Assuming Pike imports need dependency ordering like C/C++.

**What Happens**: Over-engineering, unnecessary complexity.

**Reality**: Pike uses late binding. Only `inherit` with class inheritance needs ordering.

**See**: [Discoveries](discoveries.md) - Pike import order tests.

---

## The "Subagent Will Handle It" Trap

**The Trap**: Waiting indefinitely for background subagents to complete work.

**What Happens**: Stalled progress, timeout errors.

**How to Avoid**:

- Set time limits on subagent tasks
- If timeout/failure, implement manually
- Don't retry more than once

---

## The "CI Is Green Immediately" Assumption

**The Trap**: Thinking CI passes right away.

**What Happens**: Premature merge attempts, blocked PRs.

**Reality**: CI takes 2-3 minutes. Use `sleep 120` between checks.

---

## The "Pre-commit Hook Always Passes" Assumption

**The Trap**: Assuming pre-commit hooks will work.

**What Happens**: Blocked commits, frustration.

**Reality**: Hooks can timeout or fail on environment issues.

**Escape Hatch**: `--no-verify` flag (use sparingly).

---

## The "GitHub Issue Created Successfully" Assumption

**The Trap**: Thinking `gh issue create` worked when bash shows errors.

**What Happens**: Issue not created, work not tracked.

**How to Avoid**: Always verify with `gh issue view {number}`.

---

## The "Stash Pop Will Apply Cleanly" Assumption

**The Trap**: Assuming `git stash pop` won't have conflicts.

**What Happens**: Merge conflicts, dirty working directory.

**How to Avoid**: Be prepared to resolve conflicts after pop.

---

## The "Typecheck Passes = Build Passes" Assumption

**The Trap**: Thinking `bun run typecheck` success means build will succeed.

**What Happens**: Build fails due to missing files or esbuild issues.

**How to Avoid**: Run both typecheck and build before committing.

---

## The "VSCode Settings Auto-Reload" Assumption

**The Trap**: Thinking new settings work immediately in development.

**What Happens**: Testing shows settings don't work.

**Reality**: Extension needs reload/restart to pick up new settings.

---

## The "Main Branch Is Up To Date" Assumption

**The Trap**: Working on old main branch without pulling.

**What Happens**: Merge conflicts, stale code, duplicate work.

**How to Avoid**:

```bash
git checkout main
git pull origin main
```

Before every new branch.

---

## The "All 'safe' Issues Are Closed" Assumption

**The Trap**: Thinking all work is done without verifying.

**What Happens**: Missed issues, incomplete work.

**How to Avoid**:

```bash
gh issue list --label safe --state open
```

Always verify before claiming completion.
