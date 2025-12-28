# GitHub Actions Workflows

This repository uses GitHub Actions for CI/CD. Here's how to use the workflows:

## Testing Locally with `act`

To test workflows locally using [act](https://github.com/nektos/act):

```bash
# Install act (if not already installed)
# macOS: brew install act
# Linux: https://github.com/nektos/act#installation

# Run tests with ubuntu-24.04 image
act -P ubuntu-24.04=catthehacker/ubuntu:act-24.04

# Note: GitHub Actions uses sudo for apt commands,
# but act's Docker containers don't have sudo installed.
# The workflows are configured for GitHub Actions (not act).
```

## Workflows

### 1. Test Workflow (`.github/workflows/test.yml`)

**Triggers:**
- Push to `main` or `master` branches
- Pull requests to `main` or `master`

**What it does:**
- Runs tests on Node.js 18.x and 20.x
- Builds the VSIX extension
- Uploads the VSIX as an artifact (30-day retention)

**Result:**
- ✅ All tests must pass
- 📦 Download the latest VSIX from the Actions page

### 2. Release Workflow (`.github/workflows/release.yml`)

**Triggers:**
- Push of version tags (e.g., `v1.0.1`, `v2.0.0`)

**What it does:**
- Runs all tests
- Builds the VSIX extension
- Creates a GitHub Release with the VSIX attached
- Generates release notes automatically

**Result:**
- 🚀 New GitHub release
- 📦 VSIX attached to the release
- 📝 Auto-generated release notes

## How to Create a Release

### Option 1: Using Git Tags (Recommended)

1. Update the version in `packages/vscode-pike/package.json`:
   ```json
   "version": "1.0.1"
   ```

2. Commit the change:
   ```bash
   git add packages/vscode-pike/package.json
   git commit -m "Bump version to 1.0.1"
   ```

3. Create and push a tag:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```

4. GitHub Actions will automatically:
   - Run all tests
   - Build the VSIX
   - Create a release at `https://github.com/pike-lsp/pike-lsp/releases/tag/v1.0.1`
   - Upload the VSIX to the release

### Option 2: Manual Release

1. Build locally:
   ```bash
   cd packages/vscode-pike
   pnpm install
   pnpm package
   ```

2. The VSIX will be created as `vscode-pike-<version>.vsix`

3. Go to GitHub → Releases → "Draft a new release"
4. Upload the VSIX file

## Downloading Builds

### From CI Artifacts (Latest Dev Build)

1. Go to the [Actions page](https://github.com/pike-lsp/pike-lsp/actions)
2. Click on the latest "Test" workflow run
3. Scroll to "Artifacts" section at the bottom
4. Download `vscode-pike-extension-<commit-sha>`

### From Releases (Stable Release)

1. Go to the [Releases page](https://github.com/pike-lsp/pike-lsp/releases)
2. Find the release you want
3. Download the VSIX file

## Installing the Extension

### From VSIX File

1. Open VS Code
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Type "Extensions: Install from VSIX..."
4. Select the downloaded `.vsix` file

### From VS Code Marketplace (Future)

Once published to the marketplace:
1. Open VS Code
2. Go to Extensions
3. Search for "Pike Language Support"
4. Click Install

## Testing Locally Before Release

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm build
pnpm --filter @pike-lsp/pike-bridge test
pnpm --filter @pike-lsp/pike-lsp-server test

# Build the extension
cd packages/vscode-pike
pnpm package

# The VSIX is ready: vscode-pike-1.0.0.vsix
```

## Version Numbers

- **Package version**: `packages/vscode-pike/package.json` → `version` field
- **Git tag**: Must match package version with `v` prefix (e.g., `v1.0.1`)
- **Release name**: Auto-generated from tag

## Troubleshooting

**Tests failing?**
- Check the Actions tab for detailed logs
- Run tests locally first: `pnpm test`

**Build failing?**
- Ensure all dependencies are installed: `pnpm install`
- Check if TypeScript compiles: `pnpm build`

**VSIX not created?**
- Verify `@vscode/vsce` is installed: `cd packages/vscode-pike && pnpm install`
- Check package.json has correct `publisher` and `version` fields
