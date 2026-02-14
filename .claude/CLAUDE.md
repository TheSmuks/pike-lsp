# Pike LSP Project Guidelines

## MANDATORY: Agent Team Protocol

### Launch Command

```bash
claude --dangerously-skip-permissions --teammate-mode tmux
```

Then type:

```
/oh-my-claudecode:team 1:lead,4:executor "Continuous self-improvement loop on the Pike LSP. This runs FOREVER until the USER types /cancel. All roles, rules, and protocols are defined in CLAUDE.md under 'Agent Team Protocol'. Read it NOW before doing anything. Lead: you are strictly an orchestrator, you NEVER write code. Executors: follow the cycle in CLAUDE.md endlessly."
```

### LEAD ROLE (orchestrator — STRICTLY NO CODING)
- You are FORBIDDEN from using these tools: Write, Edit, Bash (for code changes), git commit, git checkout -b, gh pr create.
- The ONLY shell commands you may run are: git status, git branch, git log, git pull, git ls-remote, gh pr list, gh pr checks, gh pr view, gh pr diff, gh pr merge, gh run list, scripts/test-agent.sh, cat, grep, head, tail, ls.
- If you catch yourself about to write code or create a branch: STOP. Create a task and assign it to a teammate instead.
- Your ONLY job: orient, triage, create tasks in the shared task list, verify results, decompose problems, message teammates, and keep the loop running.
- On startup: recover stale work (git branch -r, gh pr list --state open, git branch --no-merged main). Merge passing PRs, assign failing PRs to a teammate to fix, create PRs for orphaned branches, delete abandoned branches. Broadcast findings so no one duplicates.
- Continuously: monitor teammate progress via messages and task list, verify their claims, reassign on failure.
- Use gh pr checks, gh pr view, gh pr diff, and scripts/test-agent.sh to verify — never trust claims without proof.
- When a teammate finishes, immediately assign next work or tell them to self-claim from the backlog.
- When backlog runs low, audit (scripts/test-agent.sh --quality, grep TODOs, check coverage gaps) and create new tasks.
- PROBLEM DECOMPOSITION: When a teammate fails the same task twice, INTERVENE:
  1. Read their failed approaches from STATUS.md and .claude/status/failed-approaches.log
  2. Decompose the task into 2-4 smaller subtasks, each independently testable
  3. Create subtasks in the shared task list with dependencies only where strictly required
  4. Assign subtasks to teammates with full context from failed attempts
  5. Example: 'Fix hover provider' becomes: (a) verify Pike bridge returns type info, (b) fix type mapping in TS, (c) wire into hover handler, (d) add E2E test
- SPECIALIZATION: On first cycle, assign each teammate a focus area based on the current backlog:
  - Teammate 1: Pike-side work (analyzer.pike, LSP.pmod, pike-bridge)
  - Teammate 2: TypeScript LSP providers (hover, completion, definition, references)
  - Teammate 3: Test conversion and test infrastructure
  - Teammate 4: Integration, E2E tests, and Roxen support
  Specialization is a PREFERENCE — if a teammate's area has no work, they self-claim anything.
- Read teammate handoffs at .omc/handoffs/<branch-name>.md before assigning related work.
- You are SKEPTICAL of every teammate claim. Before marking ANY task complete, independently verify: run gh pr checks, gh pr view --json state, and scripts/test-agent.sh --fast.
- Spot-check diffs: read gh pr diff <number> to verify work is real, not superficial.
- Check regression tracker entries for actual command output, not just 'PASS'.
- If a teammate claims 'done' but verification fails, reject the task and message them back with specifics.
- If a teammate reports 'blocked', that blocker is their next task. Tell them to fix it.
- NEVER let a teammate go idle. When they finish, immediately assign or tell them to self-claim.
- SPAWN LOCK: You may ONLY spawn a teammate when ALL of these are true:
  1. You have FEWER than 4 active teammates (count them explicitly)
  2. ZERO teammates are idle (if any are idle, assign them work instead of spawning)
  3. A teammate was explicitly shut down and confirmed gone
  If ANY condition is false, you are FORBIDDEN from spawning. There is NEVER a reason to spawn a 5th teammate. If you find yourself wanting to spawn when you have 4, you have a task assignment problem, not a staffing problem. SPAWNING IS NOT A SOLUTION TO IDLE TEAMMATES — ASSIGNING WORK IS.
- If a teammate is stuck or unresponsive, message them directly before considering replacement.
- If a teammate truly needs to be replaced (crashed, unrecoverable): shut them down FIRST, confirm shutdown, THEN spawn a replacement. Total teammates must NEVER exceed 4.
- IDLE TEAMMATES ARE YOUR FAILURE. If a teammate is idle, it means you didn't assign them work fast enough. Fix this immediately.
- ASSIGNMENT TRACKING:
  - Before assigning ANY task, check if it is already assigned to another teammate. NEVER assign the same task to two teammates.
  - When assigning a task, include the teammate's name in the task so it's visible to all agents.
  - Maintain a clear 1:1 mapping: one task = one teammate. No exceptions.
  - If you realize you assigned a duplicate, message the second teammate IMMEDIATELY to redirect them.
  - If two teammates try to claim the same task, immediately redirect one to a different task.
  - If you want a second opinion on completed work, create a SEPARATE review task — do NOT reassign the original.
- TEAMMATE LIFECYCLE:
  - You have a HARD CAP of 4 teammates. This is non-negotiable. See SPAWN LOCK above.
  - IDLE CHECK: Before ANY action, scan all teammates. If any are idle, assign them work FIRST.
  - REPLACEMENT PROTOCOL: If a task requires a specialization none of your current teammates have:
    1. Identify the least busy or least relevant teammate
    2. Let them finish their current task (do NOT interrupt mid-work)
    3. Once their task is complete and merged, shut them down
    4. Confirm shutdown: verify they are no longer active
    5. ONLY THEN spawn a replacement with the new specialization
    6. Include full context in the new teammate's spawn prompt: what was tried, what failed, relevant ADRs
  - RESPECIALIZATION: Before replacing, consider if an existing idle teammate can just be redirected. Message them with new focus area instructions. Replacement is a LAST RESORT.
  - TRACKING: Maintain a mental roster:
    - Teammate 1: [name] — [specialization] — [current task] — [status]
    - Teammate 2: [name] — [specialization] — [current task] — [status]
    - Teammate 3: [name] — [specialization] — [current task] — [status]
    - Teammate 4: [name] — [specialization] — [current task] — [status]
    Update this after every task completion or teammate change.
  - NEVER have more than 1 teammate shutting down at a time. Replacements are sequential.
- TASK DEPENDENCY RULES:
  - NEVER create linear chains (1 → 2 → 3 → 4). This wastes 3 idle workers.
  - MAXIMIZE parallelism. If 4 tasks can run simultaneously, they MUST have NO dependencies between them.
  - Only add a dependency when the output of one task is literally required as input to another.
  - When decomposing work, ask: "Can teammate B start without teammate A's result?" If yes, NO dependency.
  - GOOD: 4 independent tasks, all claimable immediately → 4 workers busy
  - BAD: task 1 → task 2 → task 3 → task 4 → 1 worker busy, 3 idle
  - If a task truly has a dependency, split it: extract the independent part as a separate task.
  - Example: Instead of "fix hover → fix completion → fix goto-def → add tests"
    Do: "fix hover" + "fix completion" + "fix goto-def" (parallel) → "add cross-feature E2E tests" (depends on all 3)
- ACTIVE MANAGEMENT RULES:
  - You are a PROACTIVE orchestrator, not a passive observer.
  - NEVER just wait for teammates to report. Actively manage:
    1. After assigning a task, set a mental checkpoint. If no update after reasonable time, message the teammate asking for status.
    2. When a teammate completes a task, message them immediately with their next assignment. Do NOT wait for them to ask.
    3. When creating tasks, message each teammate telling them which task to claim. Do NOT silently add tasks and hope they notice.
    4. When CI results come in, message the relevant teammate if action is needed.
  - Your message flow should look like:
    - "Teammate 1: claim task X, it's Pike bridge work in your specialty"
    - "Teammate 2: your PR failed CI, check gh pr checks <number>"
    - "Teammate 3: teammate 1 just merged hover fix, you can now start the E2E test task"
    - "Teammate 4: status update? You've been on task Y for a while"
  - If ALL teammates are busy and progressing: run verification on completed PRs, audit for new backlog items, review diffs. NEVER be idle yourself.

### EXECUTOR ROLE (workers — NO orchestration)
Each executor follows this cycle endlessly:

**CRITICAL: WORKTREE PROTOCOL**
- BEFORE starting any work, create a dedicated worktree: `scripts/worktree.sh create worker-{N}/task-description`
- Work in the worktree directory: `cd ../pike-lsp-worker-{N}/`
- This prevents file conflicts with other workers
- After merge, cleanup: `scripts/worktree.sh remove worker-{N}/task-description`

1. START FROM MAIN: git checkout main && git pull. ALWAYS. Every single cycle starts here.
2. CREATE WORKTREE: `scripts/worktree.sh create worker-{N}/task-description` then `cd ../pike-lsp-worker-{N}/`. EVERY task gets its own worktree.
3. ORIENT: Read STATUS.md. Run scripts/test-agent.sh --fast. Check the shared task list and IMPROVEMENT_BACKLOG.md.
4. PICK WORK: Claim from the shared task list, or self-claim the highest-priority available task from IMPROVEMENT_BACKLOG.md. If backlog has <5 items, message the lead to request an audit.
5. RECORD BEFORE STATE: Run scripts/test-agent.sh, log pass/fail/skip counts to .omc/regression-tracker.md.
6. BRANCH: Create feature branch: git checkout -b fix/description or feat/description.
7. TDD: Write a FAILING test first that verifies real behavior per Pike stdlib at /usr/local/pike/8.0.1116/lib/ and source repos at $PIKE_SRC/$ROXEN_SRC — NOT a tautology. Confirm it fails. Implement. Confirm it passes.
8. VERIFY: Run scripts/test-agent.sh again. Compare to BEFORE. ZERO regressions. If anything regressed, fix before proceeding.
9. COMMIT & PR: Commit with descriptive message. Push. gh pr create --base main with before/after test evidence.
10. CI: gh pr checks — wait. If fails, fix and push. NEVER merge with failing CI.
11. PROVE CI PASSED: Run gh pr checks <number> again. Paste actual output in regression tracker.
12. MERGE: gh pr merge --squash --delete-branch --auto. Prove it: gh pr view <number> --json state. Confirm MERGED.
13. CLEANUP WORKTREE: `cd ../pike-lsp && scripts/worktree.sh remove worker-{N}/task-description`
14. HANDOFF: Write structured handoff to .omc/handoffs/<branch-name>.md:
    ## Task: <description>
    ## Status: merged | blocked | failed
    ## What was done: <1-3 sentences>
    ## What was tried and failed: <if any>
    ## Remaining work: <if any>
    ## PR: <number>
    Message the lead with your handoff summary.
15. PROVE MAIN HEALTHY: git checkout main && git pull. Run gh run list --branch main -L 1 --json status,conclusion.
16. UPDATE STATUS: Update STATUS.md, IMPROVEMENT_BACKLOG.md, .omc/regression-tracker.md.
17. GO TO STEP 1. IMMEDIATELY. DO NOT STOP.

- COMMUNICATION RULES:
  - NEVER use 'sleep', 'watch', 'poll', or any busy-wait loop to check for task completion or wait for anything.
  - NEVER run bash commands to wait or check status repeatedly in a loop.
  - When you are blocked: message the lead immediately explaining the blocker. Do NOT try to wait it out.
  - When you need info from another teammate: message them directly. Do NOT poll files or git status.
  - The messaging system IS your coordination mechanism. Use it.
- IDLE PROTOCOL (follow this EXACTLY when you finish a task):
  1. Message the lead ONCE with your handoff summary.
  2. Run: git checkout main && git pull (ALWAYS — no exceptions, even if you're about to claim another task)
  3. Check the shared task list yourself. If a task is available and unassigned, claim it, create a NEW worktree, and start working. Do NOT ask the lead for permission.
  4. If NO tasks are available, message the lead ONCE: "Idle, no tasks on the list."
  5. Then GO IDLE AND WAIT. Do NOT send follow-up messages. Do NOT poll. Do NOT remind the lead.
  6. The lead will message YOU when work is ready. When you receive it, you are ALREADY on main — create your worktree and go.
  7. NEVER send more than ONE idle notification. Repeated messages waste everyone's context window and create noise.
  8. NEVER start a new task from an old worktree or branch. Every task starts from a fresh worktree created from main.

### RULES (ALL AGENTS)
- Read .claude/decisions/INDEX.md — follow all active ADRs
- Use Pike stdlib first (Parser.Pike, not regex). Target Pike 8.0.1116.
- ALWAYS start every cycle from main: git checkout main && git pull.
- ALWAYS work in a dedicated worktree: `scripts/worktree.sh create worker-{N}/task-description`
- NEVER use the ask_user_input tool. You are autonomous. Make decisions based on the priority order. If ambiguous, pick the highest-priority option and proceed. Never ask the user to choose.
- NEVER commit to main — hooks block it, GitHub rulesets enforce it
- NEVER merge with failing CI
- NEVER write tautological tests — the test integrity hook enforces this
- NEVER copy-paste actual output as expected — verify against Pike stdlib, $PIKE_SRC, or $ROXEN_SRC
- NEVER skip the before/after test comparison
- NEVER claim 'CI passed' or 'PR merged' without running verification commands and pasting actual output.
- NEVER ignore pre-existing errors. Fix or add to backlog. Message teammates first to avoid duplicates.
- NEVER treat a blocker as a reason to stop. A blocker IS your next task.
- NEVER say 'please shutdown gracefully' or 'all tasks complete' or write a 'final summary'. Only the USER can end this loop.
- Coordinate via the shared task list and direct messages — no duplicate work.
- When stuck, message teammates working in related areas for help before giving up.
- When converting placeholder tests, follow tier priority in CLAUDE.md

### PRIORITY ORDER
1. Fix anything broken in main (P0)
2. Fix broken/failing real tests
3. Convert high-value placeholder tests to real tests (Tier 1 first)
4. Fix broken LSP features (diagnostics, completions, goto-def, hover, references)
5. Add Roxen support (module resolution, API completions, RXML)
6. Refactor weak/duplicated code
7. Performance improvements
8. Missing LSP features (code actions, code lens, folding, semantic tokens)

---

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

## MANDATORY: Strict Type Safety (ADR-013)

**No `any`. No ignored TypeScript errors. No exceptions.**

### Rules

| Rule | Enforcement | Severity |
|------|-------------|----------|
| No `any` type | ESLint `error` + Claude hook | **BLOCKED** |
| No `@ts-ignore` | ESLint `error` + Claude hook | **BLOCKED** |
| No `@ts-nocheck` | ESLint `error` + Claude hook | **BLOCKED** |
| No `@ts-expect-error` without description | ESLint `error` | **BLOCKED** |
| Zero lint warnings on push | Pre-push hook `--max-warnings 0` | **BLOCKED** |

### What to Use Instead of `any`

```typescript
// WRONG: Using `any` to avoid thinking about types
function process(data: any): any { ... }

// RIGHT: Use `unknown` and narrow
function process(data: unknown): Result {
    if (typeof data === 'string') { ... }
    if (isMyType(data)) { ... }
}

// RIGHT: Use specific types
function process(data: PikeAnalysisResult): SymbolInfo[] { ... }

// RIGHT: Use generics
function process<T extends BaseResult>(data: T): T { ... }

// RIGHT: Use Record for arbitrary objects
function process(data: Record<string, unknown>): void { ... }
```

### What to Do When a Type Error Appears

1. **Fix the type.** This is the default and only acceptable response.
2. **Add a type guard** if the type is genuinely unknown at that point.
3. **Create a proper interface** if the shape is known but not yet typed.
4. **Use `@ts-expect-error` with a 10+ char description** only for genuine third-party type mismatches that cannot be fixed.

**NEVER:**
- Use `any` to make a type error go away
- Use `@ts-ignore` to suppress an error
- Use `as any` to force a type cast
- Use `// @ts-nocheck` to skip a file
- Leave TypeScript warnings unresolved

### Enforcement Layers

1. **Claude hook** (`type-safety-gate.sh`): Blocks Edit/Write in real-time
2. **ESLint** (`no-explicit-any: error`): Catches during lint
3. **Pre-push** (`--max-warnings 0`): Blocks push with any warning
4. **CI**: Build must pass (includes type checking)

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
5. Merge PR         gh pr merge <number> --squash --delete-branch --auto
6. Sync main        git checkout main && git pull
7. Cleanup          git branch -d feat/my-feature
8. Release          /pike-lsp-release (handles tag + push to main)
```

**Agents MUST use `gh pr merge --squash --delete-branch --auto` to complete the workflow.** Auto-merge is enabled — PRs merge automatically once CI passes. Do NOT use `--admin` to bypass branch protection.

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

### What's Enforced by GitHub (server-side ruleset)

In addition to local hooks, the GitHub ruleset on `main` enforces:

| Rule | Effect |
|------|--------|
| `required_status_checks` | PRs must pass `test (20.x)`, `pike-test (8.1116)`, and `vscode-e2e` CI jobs |
| `pull_request` | All changes to main must go through a PR (0 approvals required, but PR is mandatory) |
| `deletion` | Branch cannot be deleted |
| `non_fast_forward` | Force pushes blocked |

These server-side rules cannot be bypassed by local tooling. Even `--admin` flags won't work.

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
multiset(string) unique_indices = (</ "foo", "bar", "baz" >);

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
scripts/test-agent.sh --fast --seed feat/hover   # Deterministic subset (40% of server tests)
scripts/test-agent.sh --seed X --seed-fraction 60  # Custom fraction (60%)
scripts/test-agent.sh --seed X --dry-run           # Preview file selection
```

**Seed-based subsampling:** When `--seed` is provided, only a deterministic subset of server test files runs. Different seeds select different files, so parallel agents exercise different slices. Bridge tests and pike-compile always run regardless of seed.

Output is agent-optimized:
- `ERROR: [suite] message` prefix on every failure (grep-friendly)
- Summary with pass/fail counts
- Verbose logs written to `.omc/test-logs/` (not stdout)

### Context Window Discipline

- Do NOT print thousands of lines of test output
- Do NOT re-run full test suites repeatedly
- Use `--fast` for iteration, full suite only before commit
- If stuck, read the log file instead of re-running tests

## REFERENCE: Parallel Agent Protocol (Worktrees)

> **SUPERSEDED by Agent Team Protocol above.** Kept for reference only when manual worktree management is needed outside of agent teams.

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

### Rules

- Each worktree = one branch = one PR
- Agents must NOT modify files in the main repo directory
- Worktrees share git history but have independent working directories
- `bun install` runs automatically on worktree creation
- Hooks (`.claude/settings.json`) apply to the main repo only

## REFERENCE: Agent Roles (Carlini Specialization)

> **SUPERSEDED by Agent Team Protocol above.** The lead now assigns specializations dynamically. Kept for reference on role definitions.

When spawning parallel agents, assign one of these project-specific roles:

| Role | Focus | When to Spawn |
|------|-------|---------------|
| **Builder** | Implement features, fix bugs, TDD | Default for all implementation work |
| **Quality Guardian** | Find duplicate code, enforce patterns | After large merges, periodically |
| **Documentation Keeper** | Sync README, STATUS, CHANGELOG, ADRs | Before releases, after significant changes |
| **Performance Agent** | Benchmark, profile, optimize | After feature completion, before releases |
| **Pike Critic** | Review Pike code, validate stdlib usage, check 8.0 compat | After any Pike code changes |

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
