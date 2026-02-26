# 🔁 Autonomous Self-Improvement Loop

You are operating in an autonomous forever loop. Follow the protocol below based on your role.

---

## ⚠️ TOOLCHAIN — READ BEFORE ANYTHING ELSE

This project uses **bun** exclusively. This is non-negotiable.

| WRONG | RIGHT |
|---|---|
| npm install | bun install |
| npm run x | bun run x |
| npx tool | bunx tool |
| yarn | bun |
| pnpm | bun |

The hook blocks any npm/npx/yarn/pnpm command immediately.
Do NOT create issues referencing npm — use bun terminology.
Do NOT create issues titled 'update npm packages' — say 'update bun dependencies'.

---

## 🌿 QUERY-ENGINE-V2 REWRITE BRANCH POLICY (MANDATORY)

This policy applies to all work for query-engine-v2 rewrite specs and implementation.

### Branch model

- `main` remains releaseable for alpha users.
- `rewrite/query-engine-v2` is the long-lived integration branch for rewrite work.
- Use short-lived branches from rewrite: `qe2/phase-<n>-<topic>`.

### Workflow rules

1. Do NOT implement query-engine-v2 rewrite work directly on `main`.
2. Do NOT open rewrite feature PRs directly to `main`.
3. Merge rewrite feature branches into `rewrite/query-engine-v2` first.
4. Promote `rewrite/query-engine-v2` to `main` only when phase exit gates pass.
5. Merge `main` into `rewrite/query-engine-v2` at least twice per week.

### Required promotion evidence (rewrite -> main)

- Correctness: no stale publish regressions.
- Cancellation: end-to-end cancel works, post-cancel publish count is zero.
- Performance: p95 non-regression for migrated feature set.
- Operations: rollback controls validated.

### Tracking requirement

All rewrite PRs MUST update:

- `docs/specs/query-engine-v2-implementation-tracker.md`

And MUST reference:

- `docs/specs/query-engine-v2-rfc.md`
- `docs/specs/query-engine-v2-protocol.md`
- `docs/specs/query-engine-v2-launch-runbook.md`
- `docs/specs/query-engine-v2-branching-and-execution-policy.md`

---

## 🧭 General Contribution Workflow

Use this repository-wide flow for implementation work.

### 1) Branching

- For query-engine-v2 rewrite work, follow the mandatory branch policy above.
- For non-rewrite work, use short-lived branches from `main`.
- Never implement directly on `main`.

### 2) Implementation scope

- Keep changes focused to one issue or one clearly scoped milestone.
- Avoid drive-by refactors unless needed for correctness.
- Match existing code patterns and naming conventions.

### 3) Core coding constraints

- Use **bun** tooling only.
- TypeScript must stay strict.
- Pike parsing must use Parser.Pike (no regex parsing shortcuts).
- Pike files should use `#pragma strict_types` when applicable.

### 4) Verification before PR

Run relevant checks for changed areas. For significant cross-package changes, run full verification:

```bash
bun run lint && \
bun run typecheck && \
bun run build && \
cd packages/pike-bridge && bun test && cd ../.. && \
cd packages/pike-lsp-server && bun test && cd ../.. && \
cd packages/pike-lsp-server && bun test ./src/tests/smoke.test.ts && cd ../.. && \
cd packages/pike-lsp-server && bun test ./dist/tests/integration-tests.js && cd ../.. && \
pike test/tests/cross-version-tests.pike && \
./scripts/run-pike-tests.sh && \
cd packages/vscode-pike && bun run bundle-server && cd ../.. && \
cd packages/vscode-pike && bun run build:test && cd ../.. && \
cd packages/vscode-pike && bun test src/test/mockOutputChannel.test.ts && cd ../.. && \
cd packages/vscode-pike && xvfb-run --auto-servernum bun run test:e2e && cd ../..
```

### 5) PR requirements

Every PR must include:

- concise summary
- root cause/problem statement
- file-level change rationale
- verification commands and results

For query-engine-v2 PRs, also update:

- `docs/specs/query-engine-v2-implementation-tracker.md`

### 5b) Commit discipline

- Use frequent, scoped commits during active implementation work.
- Prefer one logical milestone per commit (code + tests + tracker update where relevant).
- Do not accumulate large uncommitted rewrite batches.
- Keep commit messages concise and imperative.

### 6) Merge conflict handling

- Rebase on latest target branch.
- Resolve conflicts intentionally; do not blindly choose ours/theirs.
- Re-run verification after rebase before pushing.
- Use `--force-with-lease` when pushing rebased branches.

### 7) Cleanup

- Remove stale local branches/worktrees after merge.
- Delete stale remote branches when no longer needed.
- Keep git state clean to avoid CI and release drift.

### 8) Forbidden

- Do not use npm/npx/yarn/pnpm.
- Do not push directly to `main`.
- Do not skip verification for risky changes.
- Do not use destructive git commands unless explicitly requested.

## 📦 Creating a Release

This section describes how to create a new release for pike-lsp.

### Step 1: Determine the Previous and New Release Tags

```bash
# Get the last published GitHub Release (not just git tag)
gh release list --limit 1

# Get the current version from package.json
cat package.json | grep '"version"'

# Or get the latest git tag
git describe --tags --abbrev=0
```

### Step 2: Update Version Numbers

Update the version in both files:
- `package.json`
- `packages/vscode-pike/package.json`

```bash
# Edit both files to bump the version (e.g., alpha.22 → alpha.23)
```

### Step 3: Update CHANGELOG.md

Add a new section for the release with the date and changes. Keep only the latest two releases in the changelog (current + previous).

### Step 4: Commit and Tag

```bash
git add -A
git commit -m "chore: bump version to alpha.NEW"
git tag -a v0.1.0-alpha.NEW -m "Release v0.1.0-alpha.NEW"
```

### Step 5: Push and Create GitHub Release (CRITICAL)

**Always use `gh release create` with `--notes-start-tag`** to create an actual GitHub Release:

```bash
# Push the tag
git push origin v0.1.0-alpha.NEW
```

The release workflow (`.github/workflows/release.yml`) will automatically:
1. Build and test the project
2. Create the VSIX package
3. Publish the GitHub Release with auto-generated notes

### Step 6: Verify the Release

Check that the release was created correctly:

```bash
gh release view v0.1.0-alpha.NEW
gh release list
```

### Why This Matters

GitHub's auto-generated release notes compare against the **last published GitHub Release**, not the last git tag. If you only push git tags without creating GitHub Releases, the next release will accumulate all changes since the last actual Release — resulting in bloated changelogs.

**Always ensure each release creates an actual GitHub Release**, not just a git tag.

### Fixing a Release

If you need to fix a release's changelog:

```bash
# Delete the old release
gh release delete v0.1.0-alpha.NEW --yes

# Recreate with correct diff range
gh release create v0.1.0-alpha.NEW \
  --target <commit-sha> \
  --generate-notes \
  --notes-start-tag v0.1.0-alpha.PREVIOUS \
  --title "Release v0.1.0-alpha.NEW"
```
