# Repository Guidelines

## Project Structure & Module Organization
- `packages/` contains the workspace packages: `pike-bridge`, `pike-analyzer`, `pike-lsp-server`, and `vscode-pike`.
- `pike-scripts/` holds the Pike backend (notably `pike-scripts/analyzer.pike`).
- `scripts/` contains helper scripts such as `scripts/run-tests.sh` and `scripts/test-extension.sh`.
- `packages/pike-lsp-server/src/tests/` is the main test suite; `test/` holds fixtures.
- `docs/` and `images/` store documentation assets.

## Build, Test, and Development Commands
- `pnpm install` installs workspace dependencies.
- `pnpm build` builds all packages.
- `pnpm test` runs package-level tests.
- `pnpm test:all` runs the full test runner via `scripts/run-tests.sh`.
- `pnpm lint` runs linting across packages.
- `pnpm typecheck` runs TypeScript type checks.
- `pnpm watch` runs package watch tasks in parallel.
- `./scripts/test-extension.sh` launches VS Code with the extension for manual testing.

## Coding Style & Naming Conventions
- TypeScript is strict: avoid `any`, use type guards from `utils/validation.ts`, and document public APIs with TSDoc.
- Pike code should use `//!` doc comments and handle errors explicitly.
- Follow existing formatting; prefer running `pnpm lint` and `pnpm typecheck` before pushing.
- Branch naming follows `feature/your-feature-name` or `fix/your-bug-fix`.

## Testing Guidelines
- Tests use `node:test` and live in `packages/pike-lsp-server/src/tests/`.
- Add tests for new features and bug fixes; keep Pike stdlib parsing at 100%.
- For targeted runs, use `pnpm --filter @pike-lsp/pike-lsp-server test` after building.
- The stdlib parsing tests default to `../Pike`; override with `PIKE_SOURCE_ROOT` or `PIKE_STDLIB`/`PIKE_TOOLS`.

## Agent Workflow (Required)
- After completing any phase, run `./scripts/run-tests.sh` before requesting review; fix failures first.
- After automated tests pass, run `./scripts/test-extension.sh` to validate the VS Code extension manually.
- Add new LSP tests to `packages/pike-lsp-server/src/tests/lsp-tests.ts` and run them via `node --test packages/pike-lsp-server/dist/tests/lsp-tests.js`.

## Commit & Pull Request Guidelines
- Commit messages are short and imperative; common prefixes include `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `perf:`.
- Example: `git commit -m "fix: handle missing Pike binary gracefully"`.
- PRs should describe the change, link related issues, include test results, and pass CI; fill out the PR template when present.

## Environment & Configuration
- Required: Node.js 18+, pnpm 8+, and Pike 8.0+.
- For VS Code, set `pike.pikePath` if Pike is not on `PATH`.
- Optional test env vars: `PIKE_SOURCE_ROOT`, `PIKE_STDLIB`, `PIKE_TOOLS`.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
