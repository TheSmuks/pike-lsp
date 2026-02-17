# Agent Guidelines

## Quick Start (Carlini Protocol)

Every agent session MUST follow this startup sequence:

```
1. Read STATUS.md              → current state, failing tests, known issues
2. Read .claude/decisions/INDEX.md → active architectural decisions
3. Run scripts/test-agent.sh --fast → smoke test (~30s)
4. Run scripts/task-lock.sh list    → see what other agents are working on
```

## Project Structure

```
packages/
  pike-bridge/       TypeScript <-> Pike IPC (JSON-RPC over stdin/stdout)
  pike-lsp-server/   LSP protocol implementation
  vscode-pike/       VSCode extension
pike-scripts/
  analyzer.pike      Pike subprocess entry point
  LSP.pmod/          Pike LSP modules
scripts/
  test-agent.sh      Agent-optimized test runner
  task-lock.sh       Task locking for parallel agents
  worktree.sh        Git worktree management
  repo-hygiene.sh    Repo clutter detection
```

## Build & Test Commands

```bash
bun install                                    # Install dependencies
bun run build                                  # Build all packages

# Agent-optimized testing (USE THESE, not raw test commands)
scripts/test-agent.sh --fast                   # Quick smoke test (<30s)
scripts/test-agent.sh                          # Full suite
scripts/test-agent.sh --suite bridge           # Specific: bridge|server|e2e|pike
scripts/test-agent.sh --quality                # Placeholder vs real test counts
scripts/test-agent.sh --fast --seed feat/hover # Deterministic subset for parallel agents

# Direct package tests (prefer test-agent.sh instead)
cd packages/pike-bridge && bun run test        # Bridge unit tests
cd packages/pike-lsp-server && bun run test    # Server unit tests
cd packages/vscode-pike && bun run test:features  # E2E tests (headless)

# Pike validation
pike -e 'compile_file("pike-scripts/analyzer.pike");'  # Pike compiles check
```

## Coding Conventions

**TypeScript:** Strict mode, no `any`, type guards from `utils/validation.ts`, TSDoc for public APIs.

**Pike (target: 8.0.1116):**
- `snake_case` functions/variables, `PascalCase` classes, `UPPER_SNAKE` constants
- Use `String.trim_all_whites()` not `String.trim()` (unavailable in 8.0)
- Use `Parser.Pike.split()`/`tokenize()` not regex for code parsing
- Use `//!` doc comments, `catch {}` for error handling
- Always check `/usr/local/pike/8.0.1116/lib/` before reimplementing

## Parallel Agent Protocol

### Task Locking (Prevent Collisions)

```bash
scripts/task-lock.sh lock "task-name" "what I'm doing"  # Before starting
scripts/task-lock.sh list                                # See active locks
scripts/task-lock.sh unlock "task-name"                  # When done
scripts/task-lock.sh cleanup                             # Remove stale locks (>2h)
```

### Git Worktrees (Parallel Workspaces)

Each agent works in an isolated worktree: `../pike-lsp-{branch-sanitized}/`

```bash
scripts/worktree.sh create feat/my-feature     # Create worktree + branch
scripts/worktree.sh list                        # Show active worktrees
scripts/worktree.sh status                      # Detailed status
scripts/worktree.sh remove feat/my-feature      # Cleanup (blocks if uncommitted)
scripts/worktree.sh cleanup                     # Remove all merged worktrees
```

Max 5 concurrent worktrees. Each worktree = one branch = one PR.

## Agent Roles (Carlini Specialization)

When spawning parallel agents, assign a role. Prompt templates: `.claude/agent-roles/`

| Role | Focus | When |
|------|-------|------|
| **Builder** | Implement features, fix bugs, TDD | Default for all implementation |
| **Quality Guardian** | Find duplicate code, enforce patterns | After large merges |
| **Documentation Keeper** | Sync README, STATUS, CHANGELOG, ADRs | Before releases |
| **Performance Agent** | Benchmark, profile, optimize | After feature completion |
| **Pike Critic** | Review Pike code, validate stdlib usage, 8.0 compat | After Pike changes |

## State Management

### STATUS.md (Compact Dashboard)

Read on startup. Update before stopping. Max 60 lines - full history in log files.

### Log Files (Append-Only)

```bash
grep "Pike" .claude/status/failed-approaches.log   # Search failures
grep "bun" .claude/status/agent-notes.log           # Search notes
grep "2026-02" .claude/status/changes.log           # Search by date
```

| File | Format |
|------|--------|
| `.claude/status/changes.log` | `YYYY-MM-DD \| type \| description` |
| `.claude/status/failed-approaches.log` | `YYYY-MM-DD \| agent \| tried \| why failed \| alternative` |
| `.claude/status/agent-notes.log` | `YYYY-MM-DD \| agent \| note` |

## Workflow Rules

- **Feature branches only.** Direct commits to main are blocked by hooks.
- **TDD required.** Write failing test first, then implement, then refactor.
- **Branch naming:** `type/description` (feat/, fix/, docs/, refactor/, test/, chore/)
- **Before commit:** `scripts/test-agent.sh --fast` must pass.
- **Before push:** Full E2E suite runs automatically via pre-push hook.

## Architectural Decisions

Read `.claude/decisions/INDEX.md` before working. Key decisions:
- **ADR-001:** Use Parser.Pike over regex for code parsing
- **ADR-002:** Target Pike 8.0.1116 (no String.trim(), use String.trim_all_whites())

Full ADRs in `.claude/decisions/`. Challenge protocol documented in `.claude/CLAUDE.md`.
