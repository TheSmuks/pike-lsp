# CI Optimization Research

## Current State

The test.yml workflow runs on every push/PR to main/master with these jobs:
1. **test** - Node.js tests (bridge, server, smoke, integration)
2. **pike-test** - Pike version tests (8.1116, latest)
3. **build-extension** - VSIX build (needs: test, pike-test)
4. **vscode-e2e** - VSCode E2E tests (needs: test, pike-test)

## Problem

Every push/PR runs the full CI suite even when changes don't affect certain areas:
- Documentation-only changes run full test suite
- Non-Pike changes run Pike tests
- Non-VSCode changes run E2E tests

## Optimization Strategies

### 1. Path Filtering (Recommended)

Add path filters to skip irrelevant jobs:

```yaml
on:
  push:
    branches: [main, master]
    paths-ignore:
      - '**.md'
      - 'docs/**'
      - '**.yml'
      - 'AGENTS.md'
      - 'CLAUDE.md'
  pull_request:
    branches: [main, master]
    paths-ignore:
      - '**.md'
      - 'docs/**'
      - '**.yml'
      - 'AGENTS.md'
      - 'CLAUDE.md'
```

### 2. Selective Job Execution

Add `paths` filter to individual jobs:

```yaml
test:
  runs-on: ubuntu-24.04
  if: >
    contains(github.event.head_commit.modified, 'packages/') ||
    contains(github.event.head_commit.modified, 'scripts/') ||
    contains(github.event.head_commit.modified, 'pike-scripts/')

pike-test:
  runs-on: ubuntu-24.04
  if: >
    contains(github.event.head_commit.modified, 'pike-scripts/') ||
    contains(github.event.head_commit.modified, '**.pike')

vscode-e2e:
  runs-on: ubuntu-24.04
  if: >
    contains(github.event.head_commit.modified, 'packages/vscode-pike/')
```

### 3. Caching (Already Partial)

- Bun cache is handled by oven-sh/setup-bun
- Add caching for Pike installations:
```yaml
- name: Cache Pike
  uses: actions/cache@v4
  with:
    path: |
      ~/.pike
      /usr/local/pike
    key: pike-${{ matrix.pike-version }}-${{ hashFiles('pike-scripts/**/*.pike') }}
```

### 4. Skip E2E on Non-Breaking Changes

Use labels to skip E2E:
```yaml
vscode-e2e:
  if: >
    github.event_name != 'pull_request' ||
    contains(github.event.pull_request.labels.*.name, 'run-e2e') ||
    !contains(github.event.pull_request.labels.*.name, 'skip-e2e')
```

### 5. Parallel Pike Tests

Reduce Pike test matrix:
```yaml
pike-test:
  strategy:
    matrix:
      pike-version: ["8.1116"]  # Only critical version, remove 'latest'
  fail-fast: true
```

## Recommended Implementation

### Priority 1: Path Filters (High Impact)

Add to workflow root to skip entire CI for docs/md changes:
```yaml
on:
  push:
    branches: [main, master]
    paths-ignore:
      - '**.md'
      - 'docs/**'
      - 'AGENTS.md'
      - 'CLAUDE.md'
      - 'LICENSE'
      - '**.yml'
      - '!.github/workflows/test.yml'
```

### Priority 2: Conditional Jobs (Medium Impact)

Add `if` conditions to skip irrelevant test jobs.

### Priority 3: Caching (Low-Medium Impact)

Add Pike cache to speed up installation.

## Expected Savings

| Strategy | Impact |
|----------|--------|
| Path filters | Skip ~50% of CI runs (docs-only PRs) |
| Conditional jobs | Skip ~30% of jobs per run |
| Caching | Save ~2-5 min per run |

## Risks

- **Path filters**: May miss indirect dependencies (e.g., common utils)
- **Conditional jobs**: Requires maintainers to add labels for E2E
- **Reduced Pike versions**: May miss compatibility issues with latest

## Recommendation

Implement Priority 1 (path filters) and Priority 2 (conditional jobs) for best ROI.
