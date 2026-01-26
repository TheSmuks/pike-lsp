---
name: pike-lsp-release
description: Automated release management for pike-lsp repository. Use when pushing to main, creating releases, or updating versions. Handles version bump detection and application, CHANGELOG.md updates from git commits, README.md status verification, Git tag creation with validation, and non-destructive GitHub release creation. Triggers on phrases like push to main, create a release, bump version, publish release, or any git push operation.
---

# Pike LSP Release

Automated release workflow for the pike-lsp monorepo. This skill manages the complete release process: version validation, changelog generation, readme verification, and git tagging.

## Quick Start

```
User: "Push to main"
User: "Create a release"
User: "Bump version and release"
```

The skill automatically:
1. Checks if version bump is needed based on changes
2. Updates CHANGELOG.md from recent commits
3. Verifies README.md accuracy
4. Creates git tag and GitHub release (non-destructive)

## Version Files

The project has FIVE version files that MUST stay in sync:

| File | Path | Purpose |
|------|------|---------|
| Root | `package.json` | Monorepo version reference |
| Core | `packages/core/package.json` | Core utilities |
| Bridge | `packages/pike-bridge/package.json` | Pike IPC bridge |
| Server | `packages/pike-lsp-server/package.json` | LSP server implementation |
| Extension | `packages/vscode-pike/package.json` | VSCode extension version |

**IMPORTANT:** Use `scripts/sync-versions.sh` to sync all packages from root package.json. Do NOT manually edit each file.

```bash
# After updating root package.json, run:
bash scripts/sync-versions.sh
```

## Release Workflow

### Phase 1: Pre-Push Check

Before any push to main, run:

```bash
# Get current version
CURRENT=$(node -p "require('./packages/vscode-pike/package.json').version")
echo "Current: $CURRENT"

# Get latest tag
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "none")
echo "Latest tag: $LATEST_TAG"

# Check for existing releases
gh release list 2>/dev/null | grep -E "$CURRENT|$LATEST_TAG"
```

**Decision tree:**
- If `package.json` version != latest tag → Need version bump
- If `package.json` version == latest tag AND uncommitted changes → Ask user
- If pushing new code without version bump → Warning required

### Phase 2: Version Bumping (if needed)

**Semantic versioning rules:**
- `MAJOR.MINOR.PATCH` for stable releases
- `MAJOR.MINOR.PATCH-alpha.N` for pre-releases
- `MAJOR.MINOR.PATCH-beta.N` for beta releases

**Bump types:**
- **MAJOR**: Breaking changes, API changes
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, documentation

**Example bumps:**
```bash
# 0.1.0-alpha.3 → 0.1.0-alpha.4 (pre-release patch)
# 0.1.0-alpha.3 → 0.1.0 (stable release)
# 0.1.0 → 0.2.0 (minor feature release)
# 0.1.0 → 1.0.0 (major breaking release)
```

### Phase 3: CHANGELOG Update

The CHANGELOG.md MUST reflect reality. Follow this structure:

```markdown
## [VERSION] - YYYY-MM-DD

### Added
- New feature 1
- New feature 2

### Changed
- Modified behavior

### Fixed
- Bug fix 1

### Optimization
- **Performance improvement** - Brief description
- **Cache optimization** - What changed and impact
```

**Important:** The `### Optimization` section is automatically extracted and displayed on the benchmark page (gh-pages). Use this section to document performance improvements that will be visible to users.

**Source of truth:** Use `git log` since last tag to extract changes.

### Phase 4: README Verification

Check README.md for accuracy:
- Project structure matches actual directories
- Feature list reflects current capabilities
- Version badges are correct
- No "TODO" or placeholder content claimed as features

### Phase 5: Tag and Push

```bash
# 1. Bump root package.json version first
# Edit package.json and update version field

# 2. Sync version to ALL workspace packages (MANDATORY)
bash scripts/sync-versions.sh

# 3. Verify all versions match
for f in package.json packages/*/package.json; do
  echo "$f: $(node -e "console.log(require('$f').version)")"
done

# 4. Create tag (format: vVERSION)
VERSION=$(node -p "require('./packages/vscode-pike/package.json').version")
git tag "v$VERSION"

# 5. Push with tags
git push && git push --tags
```

This triggers `.github/workflows/release.yml` which:
- Builds and tests
- Creates GitHub Release with VSIX artifact
- Validates version match between tag and package.json
- Runs benchmarks and updates gh-pages benchmark page automatically

## Scripts

### `sync-versions.sh`

**CRITICAL:** Always run this after bumping the root version.

```bash
bash scripts/sync-versions.sh
```

Syncs the version from root `package.json` to ALL workspace packages:
- `packages/core/package.json`
- `packages/pike-bridge/package.json`
- `packages/pike-lsp-server/package.json`
- `packages/vscode-pike/package.json`

**Workflow:** Edit root package.json → Run sync-versions.sh → Commit all changes

### `check_release.sh`

Run before pushing to validate release readiness:

```bash
scripts/check-release.sh
```

Checks:
- Version consistency across package.json files
- CHANGELOG has entry for current version
- No uncommitted changes
- Latest tag vs current version comparison

### `prepare_release.sh`

Interactive release preparation:

```bash
scripts/prepare-release.sh [patch|minor|major|final]
```

Prompts for:
- Version bump type
- Changelog entries (extracted from git log)
- Confirmation before making changes

Actions:
- Bumps root package.json version
- Runs `sync-versions.sh` to sync all workspace packages
- Updates CHANGELOG.md
- Commits all package.json files + CHANGELOG
- Creates git tag

### `generate-benchmark-page.js`

Automatically runs during release to update the benchmark page:

```bash
node scripts/generate-benchmark-page.js [output-path]
```

This script:
- Parses CHANGELOG.md `### Optimization` sections
- Fetches historical benchmark data from gh-pages
- Computes rolling averages for charts
- Generates tabbed HTML page with Overview, History, and Timeline tabs

**No manual intervention needed** - the release workflow handles this automatically.

## GitHub Release Behavior

**IMPORTANT:** GitHub releases are NON-DESTRUCTIVE by default.

The workflow uses `softprops/action-gh-release@v1` which:
- Creates NEW releases for NEW tags
- Updates existing releases if tag already exists
- NEVER deletes old releases
- Keeps all release artifacts (.vsix files) accessible

**Release URL pattern:** `https://github.com/TheSmuks/pike-lsp/releases/tag/v{VERSION}`

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Tag already exists | Tried to reuse version | Bump to new version |
| Version mismatch | Some package.json files not updated | Run `bash scripts/sync-versions.sh` |
| CHANGELOG outdated | Forgot to update | Add entry for current version |
| Release failed | CI test failure | Fix tests, re-push tag |
| "Cannot delete release" | Trying to overwrite | Just push new tag |

## File Locations

| File | Purpose |
|------|---------|
| `package.json` | Root monorepo version |
| `packages/core/package.json` | Core utilities version |
| `packages/pike-bridge/package.json` | Bridge version |
| `packages/pike-lsp-server/package.json` | Server version |
| `packages/vscode-pike/package.json` | Extension version |
| `CHANGELOG.md` | Release notes (Optimization section feeds benchmark page) |
| `README.md` | Project documentation |
| `.github/workflows/release.yml` | CI/CD release workflow with benchmark deployment |
| `scripts/sync-versions.sh` | **Version sync across all packages** |
| `scripts/prepare-release.sh` | Release automation script |
| `scripts/check-release.sh` | Pre-push validation |
| `scripts/generate-benchmark-page.js` | Auto-generates gh-pages benchmark page |
