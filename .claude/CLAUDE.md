# Pike LSP Project Guidelines

## Role Detection

**Read your role file NOW before doing anything else.**
- If you are the **lead/orchestrator**: read `.claude/roles/lead.md`
- If you are an **executor/worker**: read `.claude/roles/executor.md`

## Shared Rules (ALL AGENTS)

### Structured Logging

All messages, status updates, and logs MUST be grep-friendly and scannable. Agents read these — not humans.

**Messages to teammates/lead:** Single-line, prefixed, parseable.
```
DONE: fix/hover-types #42 merged | 3 tests added | 0 regressions
BLOCKED: fix/tokenizer #38 | bun install fails in worktree | need lead input
IDLE: no tasks on the list
STATUS: fix/hover-types | step 8/16 | tests passing | CI pending
CLAIM: #55 hover-provider placeholder conversion
```

**Never:** Write paragraphs in messages. Use vague summaries like "made good progress." Dump full command output in messages.

**Log files** (`.omc/logs/`) for verbose detail:
- `.omc/logs/agent-{N}.log` — append full command output, stack traces, debug info here
- Format: `YYYY-MM-DD HH:MM | LEVEL | message`
- Levels: `INFO`, `WARN`, `ERROR`, `DEBUG`
- Reference in messages: `BLOCKED: ... | details in .omc/logs/agent-2.log`

**STATUS.md** stays compact (≤60 lines, last 5 entries). `.claude/status/*.log` for full history.

### Toolchain (non-negotiable)

| Tool | Use | NEVER use |
|---|---|---|
| **bun** | Package manager, test runner, scripts | npm, yarn, pnpm, npx |
| **TypeScript strict** | `strict: true` in all tsconfig | loosening strict flags, `skipLibCheck` as a fix |
| **Pike 8.0.1116** | `pike` binary at `/usr/local/pike/8.0.1116/` | Newer Pike APIs, `String.trim()`, unverified builtins |
| **ESLint** | Linting with `no-explicit-any: error` | Disabling rules, `eslint-disable` without justification |
| **Bun test** | `bun run test`, `bun run test:features` | jest, vitest, mocha, or running test files directly |

If a command starts with `npm`, `npx`, `yarn`, or `pnpm` — **stop and replace with `bun`**. Examples:
- `npm install` → `bun install`
- `npm run test` → `bun run test`
- `npx prettier` → `bunx prettier`

### API Budget

We have ~300 requests per 5 hours across ALL agents. That's ~12 requests/agent/hour. Every tool call counts.

**Batching rules:**
- Combine shell commands with `&&` or `;` into ONE Bash call. Never run `git status` then `git branch` then `git log` as 3 calls — run `git status && git branch && git log` as 1 call.
- Combine verification: `gh pr checks 42 && gh pr view 42 --json state && gh run list --branch main -L 1 --json status,conclusion` = ONE call, not three.
- Combine git operations: `git checkout main && git pull && gh issue list --state open` = ONE call.

**Reduction rules:**
- Run `scripts/test-agent.sh --fast` ONCE before commit, not after every edit.
- Full test suite (`scripts/test-agent.sh`) only before push — never mid-development.
- Do NOT repeatedly check CI. Use `gh pr checks <number> --watch` to block until checks finish, then merge immediately. One call, not a polling loop.
- Lead: batch status checks for all teammates into one call, not one per teammate.
- Workers: do NOT message lead for every small update. Message only on: task done, blocked, or idle.
- Read files with a single `cat` or `view` call — don't read them line by line.

### Other Rules

- Read `.claude/decisions/INDEX.md` — follow all active ADRs.
- NEVER: use ask_user_input | commit to main | merge failing CI | write tautological tests | copy-paste output as expected | skip before/after comparison | claim without proof | ignore pre-existing errors | treat blockers as stop signals | say "all tasks complete".
- Coordinate via GitHub issues, shared task list, and direct messages.
- If you encounter junk (dead code, orphaned files, dev artifacts) while working: note it in your handoff so the lead can create a hygiene issue. Do NOT fix it in the same PR.

## ⛔ Pike Stdlib Over Regex

Regex for parsing Pike code is FORBIDDEN unless no stdlib alternative exists. Pike 8.0.1116 has proper parsers — use them. This is non-negotiable.

| Task | USE | NEVER |
|---|---|---|
| Tokenize Pike | `Parser.Pike.split()`, `Parser.Pike.tokenize()` | Regex on source strings |
| Parse C-like | `Parser.C.split()`, `Parser.C.tokenize()` | Regex for braces/parens |
| Resolve modules | `master()->resolv()` | Regex on import paths |
| Trim whitespace | `String.trim_all_whites()` | `String.trim()` (not in 8.0.1116) |
| Extract identifiers | `Parser.Pike.split()` then filter | `sscanf()` or regex |
| Extract strings | `Parser.Pike.split()` returns literals | Regex for quotes |
| Parse RXML/HTML | `Parser.HTML` | Regex on markup |

**When regex IS acceptable:** grep-style file searches, log filtering, CI output parsing, plain text matching. Rule of thumb: matching Pike *syntax* → use parser. Matching *text* → regex is fine.

**Before writing parsing code:** `pike -e 'indices(Parser)'` to list parsers. Search `/usr/local/pike/8.0.1116/lib/`. Read `$PIKE_SRC` for patterns. The stdlib almost certainly has what you need.

Reference: `/usr/local/pike/8.0.1116/lib/`, `$PIKE_SRC`, `$ROXEN_SRC`.

## Pike Code Style

- `snake_case` functions/variables, `UPPER_SNAKE` constants, `PascalCase` classes.
- Target Pike 8.0.1116 — many newer APIs don't exist.
- Handlers: `//!` autodoc, `catch {}` error handling, return mapping with `"result"` or `"error"`, register in `HANDLERS`.
- Reference existing code in `pike-scripts/analyzer.pike` and `pike-scripts/LSP.pmod/` for patterns.

## Type Safety (ADR-013)

No `any`. No `@ts-ignore`. No `@ts-nocheck`. No `@ts-expect-error` without 10+ char description. Zero lint warnings. Enforced by hooks, ESLint, pre-push, and CI.

## Feature Branch Workflow

All work on feature branches inside worktrees. Format: `type/description` (feat/, fix/, docs/, refactor/, test/, chore/). Merge with `gh pr merge <number> --squash --delete-branch`. No `--admin`.

**Worktree limit: 5.** `scripts/worktree.sh create` auto-prunes merged worktrees before creating. If still at capacity, the lead should audit `scripts/worktree.sh list` and remove stale ones with `scripts/worktree.sh cleanup`.

**`--no-verify` rule:** Only acceptable for non-code files (STATUS.md, handoffs, configs, .omc/*). NEVER for skipping type-safety or test-integrity checks on source code. If a hook blocks a legitimate change, fix the code to satisfy the hook.

Enforced by hooks and GitHub rulesets (required checks: `test (20.x)`, `pike-test (8.1116)`, `vscode-e2e`).

## Testing

- Headless by default. Use `bun run test` / `bun run test:features`. Never run `vscode-test` directly.
- TDD required. RED → GREEN → REFACTOR. Never skip RED.
- Test integrity enforced by hook. When a test fails, fix the CODE not the test.
- Commands: `scripts/test-agent.sh --fast` (smoke), `scripts/test-agent.sh` (full), `scripts/test-agent.sh --quality` (placeholders).

## Architecture

```
VSCode Extension (vscode-pike) → TS LSP Server (pike-lsp-server) → PikeBridge (pike-bridge, JSON-RPC stdin/stdout) → Pike Analyzer (pike-scripts/analyzer.pike) → LSP Modules (LSP.pmod/*)
```

Key paths: `pike-scripts/analyzer.pike`, `pike-scripts/LSP.pmod/`, `packages/pike-bridge/`, `packages/pike-lsp-server/`, `packages/vscode-pike/`.
