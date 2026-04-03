# Code Patterns & Conventions

Established patterns agents must follow.

## Required Patterns

### Parser.Pike for Parsing

**Rule**: Always use Parser.Pike for Pike code parsing. Never use regex.

**Why**: Parser.Pike handles all Pike syntax correctly including edge cases.

**Example**:

```typescript
// CORRECT
import { Parser } from '@pike-lsp/pike-bridge';
const parsed = Parser.Pike.parse(code);

// WRONG
const imports = code.match(/import\s+(\w+);/g); // Don't do this
```

### 500 Line Limit Per File

**Rule**: No source file (except tests) should exceed 500 lines.

**Why**: Readability, maintainability, testability.

**When Approaching Limit**: Split into multiple files with clear responsibilities.

### bun Exclusively

**Rule**: Use `bun` for everything. Never use npm, yarn, or pnpm.

**Correct**:

- `bun install`
- `bun run build`
- `bun test`

**Wrong**:

- `npm install`
- `npx tool`
- `yarn test`

### Scenario-Driven Development

**Rule**: Every code change needs a scenario test.

**Location**: `packages/pike-lsp-server/src/scenarios/`

**Format**:

```typescript
import { describe, it } from 'bun:test';

describe('Feature Name', () => {
  it('should do X when Y', async () => {
    // Test implementation
  });
});
```

---

## VSCode Extension Patterns

### Adding New Settings

1. Add to `package.json` configuration schema
2. Use consistent naming: `pike.category.settingName`
3. Provide sensible defaults
4. Add description

**Example**:

```json
"pike.category.settingName": {
  "type": "boolean",
  "default": true,
  "description": "What this setting does"
}
```

### Adding New Commands

1. Register in `extension.ts` activation
2. Use command ID format: `pike.lsp.commandName`
3. Track disposables with `runtime.track()`

**Example**:

```typescript
const disposable = commands.registerCommand('pike.lsp.commandName', async () => {
  // Implementation
});
runtime.track(disposable);
```

### Adding New Features

1. Create module in `src/feature-name.ts`
2. Export registration function
3. Import and call in `extension.ts`
4. Add scenario test
5. Add setting to `package.json` if configurable

---

## GitHub Workflow Patterns

### Creating Issues

**Template**: Use `.github/ISSUE_TEMPLATE/improvement.md`

**Required Labels**:

- One priority: `P0-broken`, `P1-tests`, `P2-feature`, `P3-refactor`, `P4-perf`
- One type: `type:bug`, `type:feature`, `type:performance`, `type:test`, `type:tech-debt`, `type:docs`
- `safe` label (after approval)

**Required Sections**:

- Description
- Problem
- Expected Behavior
- Suggested Approach
- Affected Files
- Acceptance

### Creating PRs

**Branch Naming**: `fix/descriptive-name-{issue-number}`

**PR Body Template**:

```markdown
## Summary

Brief description

## Linked Issue

closes #{number}

## Root Cause

What caused the issue

## Changes

- File: description of change

## Verification

Commands run and results

## Checklist

- [ ] Item 1
- [ ] Item 2
```

### Merge Strategy

1. Wait for all CI checks to pass
2. Use `--squash` merge
3. Delete branch after merge
4. Close linked issue

---

## TypeScript Patterns

### Strict Types

**Rule**: No `any`, no `@ts-ignore`, no `as any`.

**When Types Are Hard**: Define proper interfaces/types.

### Error Handling

**Pattern**: Use `try/catch` with proper error types.

**Example**:

```typescript
try {
  await operation();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  outputChannel.appendLine(`[Feature] Error: ${message}`);
}
```

### Disposables

**Pattern**: Always track disposables for cleanup.

**Example**:

```typescript
const disposable = someAPI.createFeature();
context.subscriptions.push(disposable);
// Or use runtime.track() in extension.ts
```
