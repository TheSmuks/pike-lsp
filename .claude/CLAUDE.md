# Pike LSP Project Guidelines

## MANDATORY: Consult Decisions Before Working

**Before starting ANY implementation, read `.claude/decisions/INDEX.md`.** This contains architectural decisions that govern how the project works. A hook injects the index on every prompt, but you MUST read the full ADR file when working in a related area.

### How Decisions Work

- **INDEX.md** - Compact table of all decisions (injected automatically)
- **NNN-title.md** - Full decision record with context, alternatives, consequences
- **TEMPLATE.md** - Copy this to create new decisions

### Challenge Protocol

If you believe a decision is wrong or outdated:

1. Read the full ADR file (not just the index)
2. Check the "Challenge Conditions" section
3. If conditions are met, update the ADR status to `challenged`
4. State what changed and propose an alternative
5. Get user approval before implementing against an active decision

### Orchestrator Delegation Rule

When spawning agents via `Task`, the orchestrator MUST include relevant decisions in the agent prompt. Sub-agents don't receive the hook injection.

```
# Example: spawning an agent that touches parsing
Task(prompt="...
ACTIVE DECISIONS:
- ADR-001: Use Parser.Pike over regex (DO NOT use regex for code parsing)
- ADR-002: Target Pike 8.0.1116 (no String.trim(), use String.trim_all_whites())
...
Full ADRs: .claude/decisions/
")
```

**Minimum:** Include any decision whose area matches the agent's task.
**Quick reference:** The decision index is at `.claude/decisions/INDEX.md`.

### Adding New Decisions

When making a non-trivial architectural choice:

1. Copy `.claude/decisions/TEMPLATE.md` to `.claude/decisions/NNN-title.md`
2. Fill in context, decision, alternatives, consequences
3. Add entry to INDEX.md
4. Status starts as `proposed` until user approves -> `active`

## MANDATORY: Use Pike's Built-in Tooling First

**Pike stdlib is the highest priority.** Before implementing any parsing, analysis, or utility code:

1. **Search Pike's source code first** at `/usr/local/pike/8.0.1116/lib/`
2. Check modules like `Parser.Pike`, `Tools.AutoDoc`, `Stdio`, `String`, etc.
3. Only implement from scratch if Pike has no existing solution

**Do NOT:**
- Use regex to parse Pike code when `Parser.Pike.split()` / `Parser.Pike.tokenize()` exist
- Reinvent string utilities when `String.*` or `Stdio.*` have them
- Guess at Pike behavior - read the actual Pike source

**Examples of Pike stdlib to use:**
- `Parser.Pike.split(code)` + `Parser.Pike.tokenize()` for tokenization
- `Tools.AutoDoc.DocParser` for parsing `//!` documentation
- `String.trim_all_whites()` for whitespace handling (not `String.trim()` - unavailable in 8.0)
- `master()->resolv()` for module resolution

When in doubt, explore Pike's lib directory before writing new code.

## MANDATORY: Feature Branch Workflow

**All work MUST happen on feature branches.** Direct commits and pushes to main are blocked by hooks.

### Branch Naming Convention

Format: `type/description` (kebab-case)

| Prefix | Use For | Example |
|--------|---------|---------|
| `feat/` | New features | `feat/hover-support` |
| `fix/` | Bug fixes | `fix/tokenizer-crash` |
| `docs/` | Documentation | `docs/readme-update` |
| `refactor/` | Code refactoring | `refactor/symbol-resolver` |
| `test/` | Test additions | `test/bridge-coverage` |
| `chore/` | Maintenance tasks | `chore/bump-dependencies` |
| `release/` | Release preparation | `release/v0-2-0` |

### Development Flow

```
1. Create branch    git checkout -b feat/my-feature
2. Develop & test   (commit freely on your branch)
3. Push branch      git push -u origin feat/my-feature
4. Create PR        gh pr create --base main
5. Merge PR         gh pr merge <number> --squash
6. Sync main        git checkout main && git pull
7. Cleanup          git branch -d feat/my-feature
8. Release          /pike-lsp-release (handles tag + push to main)
```

**Agents MUST use `gh pr merge` to complete the workflow.** Do NOT use `--admin` to bypass branch protection.

### What's Enforced by Hooks (`.claude/hooks/git-workflow-gate.sh`)

| Action | On main | On feature branch |
|--------|---------|-------------------|
| `git commit` | BLOCKED | Allowed |
| `git push origin main` | BLOCKED | N/A |
| `git push -u origin feat/x` | N/A | Allowed |
| `git push --tags` | BLOCKED | BLOCKED |
| `git tag v*` | BLOCKED | BLOCKED |
| `git checkout -b bad-name` | BLOCKED | BLOCKED |
| `git checkout -b feat/good` | Allowed | Allowed |

### Releasing to Main

**Do NOT push directly to main.** Use the release skill:

```
/pike-lsp-release
```

This handles: version sync, changelog, readme check, tagging, and push.

## MANDATORY: Headless Testing by Default

**All local tests MUST run headless by default.** The test scripts are configured to automatically use a virtual display.

```bash
# All test commands run headless by default
cd packages/vscode-pike && bun run test          # All E2E tests
cd packages/vscode-pike && bun run test:features # LSP feature tests only
cd packages/vscode-pike && bun run test:e2e      # Same as test
```

The test script auto-selects: Xvfb (Linux) → Weston fallback → native (macOS/Windows).

**For interactive debugging only**, use your display:
```bash
# Option 1: Use headless script with your display
USE_CURRENT_DISPLAY=1 bun run test:features

# Option 2: Run with GUI (opens VSCode window)
bun run test:gui
```

**Never run `vscode-test` directly** - it will pop up a VSCode window. Always use the headless wrapper scripts.

## MANDATORY: E2E Verification Before Commits

**DO NOT commit changes without verifying LSP functionality works end-to-end.**

### Quick Validation (Run This)

```bash
# Single command - validates everything headlessly
cd packages/vscode-pike && bun run test:features
```

Tests verify: document symbols, hover, go-to-definition, completion all return data.

**Pre-push hook runs these automatically**, but run manually for faster feedback.

### Additional Checks

1. **Pike compiles**: `pike -e 'compile_file("pike-scripts/analyzer.pike");'`

2. **Bridge works**: `cd packages/pike-bridge && bun run test`

3. **Quick smoke test**:
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"introspect","params":{"code":"int x;","filename":"test.pike"}}' \
     | timeout 5 pike pike-scripts/analyzer.pike 2>&1
   ```

### Debugging E2E Failures

| Symptom | Cause | Debug |
|---------|-------|-------|
| "symbols (not null)" fails | Document symbols not returned | Check Pike compiles, Bridge works, Outline view |
| Test times out | LSP server not starting | Check extension activates, increase timeout |
| "hover info" fails | Hover handler returning null | Check Pike analysis returns type info |
| "go to definition" fails | Definition handler broken | Check symbol is indexed first |

## MANDATORY: Workflow Protocols

**All agents working on this project MUST follow the standardized workflow.** The complete protocols are documented in `.omc/plans/standardize-workflow.md`.

### Quick Reference for Agents

**Before starting ANY work:**
1. Read this file (`.claude/CLAUDE.md`)
2. Check Pike version: `pike --version` (target: 8.0.1116)
3. Follow TDD: write test first, confirm it fails, then implement

**Decision Boundaries (Tiered Autonomy):**
| Tier | Scope | Approval |
|------|-------|----------|
| T1 | Pattern application (existing patterns) | None |
| T2 | Intra-module refactoring | Tests must pass |
| T3 | Cross-boundary changes (TS ↔ Pike) | Architect review |
| T4 | Foundation changes | Full architect review |

**Quality Gates (enforced by git hooks):**
- Pre-commit: Blocks placeholder tests, dev Pike scripts
- Pre-push: Requires build, Pike compile, smoke tests, E2E tests

**For detailed protocols**: See `.omc/plans/standardize-workflow.md` (14 sections: debugging flowcharts, rollback procedures, debt tracking, etc.)

## MANDATORY: Proper Pike Code Style

**Pike has specific idioms and patterns.** Follow these or your code will fail.

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Functions | `snake_case` | `handle_parse()`, `get_symbols()` |
| Variables | `snake_case` | `symbol_table`, `line_number` |
| Constants | `UPPER_SNAKE` | `MAX_DEPTH`, `DEFAULT_TIMEOUT` |
| Classes/Programs | `PascalCase` | `SymbolCollector`, `TypeResolver` |
| Private members | No prefix (Pike has no private) | Use `_name` convention only for clarity |

### Pike Version Compatibility (CRITICAL)

**Target: Pike 8.0.1116** - Many newer APIs don't exist.

```pike
// WRONG: String.trim() doesn't exist in 8.0
string cleaned = String.trim(input);

// RIGHT: Use trim_all_whites()
string cleaned = String.trim_all_whites(input);
```

**Always use `LSP.pmod/Compat.pmod`** for version-dependent functionality:
```pike
// Check version at runtime
int version = LSP.Compat.pike_version();
if (version < 80200) {
    // Use fallback for older Pike
}
```

### Handler Pattern (JSON-RPC)

Every Pike handler in `analyzer.pike` MUST follow this pattern:

```pike
//! Brief description of what this handler does
//! @param params Mapping with request data
//! @param ctx Context service container
//! @returns Mapping with "result" or "error"
protected mapping handle_your_method(mapping params, Context ctx) {
    mixed err = catch {
        // 1. Extract and validate params
        string code = params->code || "";

        // 2. Do the work (use stdlib!)
        array symbols = parse_code(code);

        // 3. Return result mapping
        return ([
            "result": ([
                "symbols": symbols
            ])
        ]);
    });

    // 4. Handle errors
    if (err) {
        return ([
            "error": ([
                "code": -32000,
                "message": describe_error(err)
            ])
        ]);
    }
}
```

**Required:**
- `//!` autodoc comments for functions
- `snake_case` function names
- `catch {}` for error handling
- Return `mapping` with `"result"` OR `"error"` key
- Registered in `HANDLERS` dispatch table

### Data Structures

```pike
// Arrays: ordered sequences
array(string) names = ({"foo", "bar", "baz"});
names += ({"qux"});  // Append

// Mappings: key-value pairs (like objects/maps)
mapping data = ([
    "name": "value",
    "count": 42
]);
data->key = "new";  // Access/assign

// Multisets: like Set ADT
multiset(string> unique_indices = (</ "foo", "bar", "baz" >);

// Check membership
if (has_index(data, "key")) { ... }
```

### Common Patterns

```pike
// Iterate array
foreach (symbols; int i; mapping symbol) {
    werror("Symbol %d: %s\n", i, symbol->name);
}

// Iterate mapping indices/values
foreach (indices(data); string key;) {
    mixed value = data[key];
}

// Safe access with default
string name = params->name || "default";

// Type checking
if (prog->classp) { ... }  // Check if is class
if (intp(value)) { ... }   // Check if is int
if (stringp(value)) { ... } // Check if is string
if (mappingp(value)) { ... } // Check if is mapping

// String operations
string parts = input / ",";     // Split
string joined = parts * ",";    // Join
bool has = has_value(input, sub);  // Contains

// Array operations
array filtered = filter(arr, lambda(mixed x) { return x > 0; });
array transformed = map(arr, lambda(mixed x) { return x * 2; });
```

### Module Loading Pattern

```pike
// In LSP.pmod module files:
#define DUMP_RESOLV(x) werror("%s: %O\n", #x, master()->resolv(x))

// Resolve with error handling
program prog = master()->resolv("Module.SubModule");
if (!prog) {
    werror("Failed to resolve Module.SubModule\n");
    return (["error": (["code": -32001, "message": "Module not found"])]);
}
```

### Anti-Patterns to Avoid

```pike
// DON'T: Use regex to parse Pike code
// DO: Use Parser.Pike.split() / Parser.Pike.tokenize()

// DON'T: Guess at API behavior
// DO: Read Pike source in /usr/local/pike/8.0.1116/lib/modules/

// DON'T: Use String.trim()
// DO: Use String.trim_all_whites()

// DON'T: Return null/0 from handlers
// DO: Return proper error mapping

// DON'T: Silent failures
// DO: Log with werror() for debugging, return error mapping

// DON'T: Reinvent utilities
// DO: Check Stdio, Array, Mapping, String modules first
```

## MANDATORY: Test-Driven Development

**All new features and bug fixes MUST follow TDD.** No implementation code without a failing test first.

### Workflow

1. **RED** - Write a failing test that describes the expected behavior
2. **GREEN** - Write the minimal implementation to make the test pass
3. **REFACTOR** - Clean up while keeping tests green

### Rules

- **Never skip RED.** Write the test, run it, confirm it fails before writing implementation code.
- **Never write implementation first** then backfill tests. The test must exist and fail before the fix.
- **One behavior per test.** Each test should verify a single, well-named behavior.
- **Run the relevant test suite after each step** to confirm red/green transitions.
- **Target 80%+ coverage** on changed files.

### Test Commands by Package

```bash
# pike-lsp-server (unit tests - most features live here)
cd packages/pike-lsp-server && bun run test

# pike-bridge (IPC layer)
cd packages/pike-bridge && bun run test

# vscode-pike (E2E / integration - runs headless)
cd packages/vscode-pike && bun run test:features
```

### Where to Put Tests

| Package | Test Location | Convention |
|---------|--------------|------------|
| pike-lsp-server | `src/tests/<category>/` | `<feature>.test.ts` |
| pike-lsp-server | colocated with source | `<module>.test.ts` next to `<module>.ts` |
| pike-bridge | `src/` | `<module>.test.ts` |
| vscode-pike | `src/test/integration/` | `<feature>.test.ts` |

### Bug Fix TDD

When fixing a bug:
1. Write a test that reproduces the bug (fails with current code)
2. Run it - confirm it fails for the right reason
3. Fix the bug with minimal changes
4. Run it - confirm it passes
5. Run the full test suite to check for regressions

### Test Integrity (Enforced by Hook)

A PreToolUse hook (`.claude/hooks/test-integrity-gate.sh`) guards all test file edits. **You cannot cheat.**

**BLOCKED (hard stop):**
- Adding `.skip`, `.only`, `xit`, `xdescribe` to tests
- Adding `@ts-ignore` / `@ts-expect-error` in test files
- Writing test files with zero `expect()` assertions

**WARNED (flagged but allowed):**
- Weakening assertions (e.g., `toEqual` -> `toBeDefined`)
- Reducing assertion count in existing tests
- Low assertion density (more tests than assertions)

**The rule is simple:** When a test fails, fix the **code**, not the **test**. The only exception is if the test itself is genuinely wrong - and you must explain WHY before modifying it.

### What Does NOT Require TDD

- Documentation changes
- Configuration/build changes
- Pure refactoring with existing test coverage (but run tests after)

### Test Conversion Priority

The test suite has **546 placeholder tests** (`assert.ok(true, 'Test not implemented...')`) that pass but validate nothing. Run `scripts/test-agent.sh --quality` for live numbers.

**Tier 1 - High Value** (E2E coverage exists, unit tests validate internals):
- `hover-provider.test.ts` - hover content building
- `completion-provider.test.ts` - completion handler logic
- `definition-provider.test.ts` - go-to-definition resolution
- `references-provider.test.ts` - find-all-references logic
- `document-symbol-provider.test.ts` - symbol extraction

**Tier 2 - Medium Value** (no E2E coverage, test the only validation):
- `type-hierarchy-provider.test.ts` (59 placeholders)
- `call-hierarchy-provider.test.ts` (55 placeholders)
- `diagnostics-provider.test.ts` (44 placeholders)
- `formatting-provider.test.ts` (38 placeholders)

**Tier 3 - Low Priority** (requires unbuilt features):
- `pike-analyzer/parser.test.ts` - TypeScript-side Pike parser (ADR-001: use Pike's Parser.Pike instead)
- `pike-analyzer/compatibility.test.ts` - version compat checks

**Rules:**
- Convert at least 1 placeholder per feature PR that touches the related provider
- Never add new `assert.ok(true)` placeholders - use `test.skip()` with a TODO instead
- When converting, write the test RED first, then make it pass
- Check `scripts/test-agent.sh --quality` before and after to track progress

## MANDATORY: Agent Orientation (Carlini Protocol)

**Inspired by "Building a C compiler with parallel Claudes" - Anthropic.**

### On Startup: Orient Yourself

Every agent (fresh session or spawned sub-agent) MUST:

1. Read `STATUS.md` - current project state, failing tests, known issues, failed approaches
2. Read `.claude/decisions/INDEX.md` - architectural decisions (injected by hook for main agent)
3. Run `scripts/test-agent.sh --fast` - quick smoke test to understand what's working
4. Check `scripts/task-lock.sh list` - see what other agents are working on

### During Work: Update State

- **Lock your task:** `scripts/task-lock.sh lock "task-name" "description"` before starting
- **Run tests frequently:** `scripts/test-agent.sh --fast` after each meaningful change
- **Log failed approaches:** Add to STATUS.md "Failed Approaches" section so future agents don't repeat them

### Before Stopping: Leave Breadcrumbs

1. Update `STATUS.md` with current state, any new failing tests, what you tried
2. Unlock your task: `scripts/task-lock.sh unlock "task-name"`
3. Commit STATUS.md changes

### STATUS.md and Log Files (Prevent Context Bloat)

STATUS.md is a **compact dashboard** read by every agent on startup. It shows only the last 5 entries per section. Full history lives in grep-friendly log files:

| Dashboard Section | Full Log File | Format |
|-------------------|---------------|--------|
| Recent Changes | `.claude/status/changes.log` | `YYYY-MM-DD \| type \| description` |
| Failed Approaches | `.claude/status/failed-approaches.log` | `YYYY-MM-DD \| agent \| tried \| why failed \| alternative` |
| Agent Notes | `.claude/status/agent-notes.log` | `YYYY-MM-DD \| agent \| note` |

**When updating STATUS.md:**
1. Add the new entry to the **log file** (append a line)
2. Update the **dashboard section** (keep only last 5, drop oldest)
3. If STATUS.md exceeds 60 lines, you're doing it wrong - prune

**When searching for context:**
```bash
grep "Pike" .claude/status/failed-approaches.log   # Find Pike-related failures
grep "bun" .claude/status/agent-notes.log           # Find bun-related notes
grep "2026-02" .claude/status/changes.log           # Find February changes
```

### Test Output for Agents

Use `scripts/test-agent.sh` instead of running test suites directly:

```bash
scripts/test-agent.sh --fast       # Quick smoke test (<30s)
scripts/test-agent.sh              # Full suite
scripts/test-agent.sh --summary    # Last run's results
scripts/test-agent.sh --suite X    # Specific: bridge|server|e2e|pike
```

Output is agent-optimized:
- `ERROR: [suite] message` prefix on every failure (grep-friendly)
- Summary with pass/fail counts
- Verbose logs written to `.omc/test-logs/` (not stdout)

### Context Window Discipline

- Do NOT print thousands of lines of test output
- Do NOT re-run full test suites repeatedly
- Use `--fast` for iteration, full suite only before commit
- If stuck, read the log file instead of re-running tests

## MANDATORY: Parallel Agent Protocol (Worktrees)

**Multiple agents can work simultaneously using git worktrees.** Each agent gets its own isolated directory with a separate branch, avoiding all file conflicts.

### How It Works

Each worktree is a sibling directory: `../pike-lsp-{branch-sanitized}/`

```
../pike-lsp/                        # Main repo (main branch)
../pike-lsp-feat-hover-support/     # Agent 1 worktree
../pike-lsp-fix-tokenizer-crash/    # Agent 2 worktree
../pike-lsp-refactor-symbol-resolver/ # Agent 3 worktree
```

### Worktree Management

```bash
# Create a worktree for a feature
scripts/worktree.sh create feat/hover-support

# Create from a specific base branch
scripts/worktree.sh create fix/crash --from feat/hover-support

# List active worktrees
scripts/worktree.sh list

# Check detailed status (changes, ahead/behind)
scripts/worktree.sh status

# Remove a worktree (blocks if uncommitted changes)
scripts/worktree.sh remove feat/hover-support

# Cleanup all merged worktrees
scripts/worktree.sh cleanup

# Cleanup ALL worktrees (nuclear option)
scripts/worktree.sh cleanup --all
```

### Orchestrator Protocol

When parallelizing work across agents:

1. **Create worktrees** for each task before spawning agents
2. **Include the worktree path** in each agent's prompt
3. **Max 5 concurrent worktrees** (enforced by the script)
4. **Each agent** commits, pushes, and creates a PR from their worktree
5. **Cleanup** after PRs are merged

```
# Example orchestrator flow:
scripts/worktree.sh create feat/hover-support
scripts/worktree.sh create fix/tokenizer-crash
scripts/worktree.sh create refactor/symbol-resolver

# Spawn 3 agents, each told to cd to their worktree
# Agent 1: "cd ../pike-lsp-feat-hover-support && ..."
# Agent 2: "cd ../pike-lsp-fix-tokenizer-crash && ..."
# Agent 3: "cd ../pike-lsp-refactor-symbol-resolver && ..."

# After PRs merged:
scripts/worktree.sh cleanup
```

### Rules

- Each worktree = one branch = one PR
- Agents must NOT modify files in the main repo directory
- Worktrees share git history but have independent working directories
- `bun install` runs automatically on worktree creation
- Hooks (`.claude/settings.json`) apply to the main repo only

## MANDATORY: Repo Hygiene

**Run `scripts/repo-hygiene.sh` before releases to check for clutter.**

```bash
scripts/repo-hygiene.sh           # Check and report
scripts/repo-hygiene.sh --fix     # Auto-fix (gitignore + untrack)
scripts/repo-hygiene.sh --strict  # Exit 1 if issues (for CI)
```

The script detects:
- Planning/dev directories tracked in git (`.planning/`, `.agent/`)
- Dev artifact markdown (`*_AUDIT.md`, `*_SPEC.md`, `IMPLEMENTATION_*.md`)
- Scattered CLAUDE.md files outside `.claude/`
- Large tracked files (>500KB)
- Empty tracked files
- Untracked files outside `.gitignore`

## MANDATORY: Agent Roles (Carlini Specialization)

When spawning parallel agents, assign one of these project-specific roles:

| Role | Focus | When to Spawn |
|------|-------|---------------|
| **Builder** | Implement features, fix bugs, TDD | Default for all implementation work |
| **Quality Guardian** | Find duplicate code, enforce patterns | After large merges, periodically |
| **Documentation Keeper** | Sync README, STATUS, CHANGELOG, ADRs | Before releases, after significant changes |
| **Performance Agent** | Benchmark, profile, optimize | After feature completion, before releases |
| **Pike Critic** | Review Pike code, validate stdlib usage, check 8.0 compat | After any Pike code changes |

### Spawning Specialized Agents

Include the role in the agent's prompt:

```
Task(prompt="ROLE: Quality Guardian
Your job is to find and coalesce duplicate code across the codebase.
Look for re-implemented utilities that exist in Pike stdlib or shared packages.
ACTIVE DECISIONS: ADR-001 (Parser.Pike over regex), ADR-002 (Pike 8.0 target)
...")
```

### When to Use Each Role

- **Single feature:** 1 Builder
- **Large feature:** 1-2 Builders + 1 Pike Critic (if touching Pike code)
- **Pre-release:** 1 Documentation Keeper + 1 Quality Guardian + 1 Performance Agent
- **Post-merge cleanup:** 1 Quality Guardian + 1 Documentation Keeper

## Architecture Overview

```
VSCode Extension (vscode-pike)
    |
    v
TypeScript LSP Server (pike-lsp-server)
    |
    v
PikeBridge (pike-bridge) -- JSON-RPC over stdin/stdout
    |
    v
Pike Analyzer (pike-scripts/analyzer.pike)
    |
    v
LSP Modules (LSP.pmod/*)
```

## Key Files

- `pike-scripts/analyzer.pike` - Pike subprocess entry point
- `pike-scripts/LSP.pmod/` - Pike LSP modules
- `packages/pike-bridge/` - TypeScript <-> Pike IPC
- `packages/pike-lsp-server/` - LSP protocol implementation
- `packages/vscode-pike/` - VSCode extension

<claude-mem-context>
# Recent Activity

<!-- This section is auto-generated by claude-mem. Edit content outside the tags. -->

### Jan 20, 2026

| ID | Time | T | Title | Read |
|----|------|---|-------|------|
| #4016 | 10:40 AM | 🟣 | GSD uncommitted planning mode enabled for pike-lsp project | ~204 |
</claude-mem-context>