# TDD Guard Setup for Pike LSP

This project uses [tdd-guard](https://github.com/nizos/tdd-guard) to enforce Test-Driven Development principles in Claude Code.

## Overview

TDD Guard ensures that all code changes follow TDD workflow by:
1. **Blocking implementation without failing tests** - Write a failing test first, then implement
2. **Preventing over-implementation** - Only write code needed to pass the current test
3. **Validating changes** - Uses Claude Code hooks to validate Write/Edit operations

## Installation

### Prerequisites

- Node.js 22+
- tdd-guard installed globally: `npm install -g tdd-guard`

### Setup

1. **Install dependencies** (already done):
   ```bash
   bun install
   ```

2. **Verify tdd-guard is installed**:
   ```bash
   tdd-guard --version
   ```

3. **Verify configuration files**:
   - `.claude/settings.json` - Claude Code hooks configuration
   - `.claude/tdd-guard/config.json` - TDD Guard configuration
   - `.claude/tdd-guard/convert-junit.js` - JUnit to JSON converter
   - `.claude/tdd-guard/data/` - Test results directory

## How It Works

### Test Workflow

1. **Write a failing test**:
   ```bash
   bun test path/to/test.test.ts
   ```

2. **Run tests with JUnit reporter**:
   ```bash
   bun test path/to/test.test.ts --reporter junit --reporter-outfile .claude/tdd-guard/data/test-junit.xml
   ```

3. **Convert to tdd-guard format** (automatic via hooks):
   ```bash
   node .claude/tdd-guard/convert-junit.js .claude/tdd-guard/data/test-junit.xml .claude/tdd-guard/data/test.json
   ```

4. **Implement the feature** - TDD Guard validates that you have a failing test first

5. **Run tests again** - Verify the implementation passes

### Claude Code Hooks

TDD Guard uses three hooks to enforce TDD:

1. **PreToolUse** - Validates before Write|Edit|MultiEdit|TodoWrite operations
2. **UserPromptSubmit** - Validates when you submit a prompt
3. **SessionStart** - Initializes tdd-guard on session start

## Configuration

### `.claude/tdd-guard/config.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/nizos/tdd-guard/main/schema.json",
  "framework": "bun",
  "testCommand": "bun run --filter '@pike-lsp/pike-bridge' test",
  "projectRoot": "/home/smuks/OpenCode/pike-lsp",
  "ignorePatterns": [
    "node_modules/**",
    "dist/**",
    "*.d.ts",
    "*.md",
    "*.json"
  ],
  "rules": {
    "requireFailingTest": true,
    "preventOverImplementation": true,
    "requireTestForNewCode": true
  }
}
```

### Customizing Rules

Edit `.claude/tdd-guard/config.json` to adjust TDD behavior:

- `requireFailingTest` - Require a failing test before implementation
- `preventOverImplementation` - Prevent code beyond test requirements
- `requireTestForNewCode` - Require tests for new code files

## Testing

### Example Test

See `.claude/tdd-guard/examples/simple.test.ts` for a basic example.

```typescript
import { describe, test, expect } from 'bun:test';

describe('Math operations', () => {
  test('adds two numbers', () => {
    expect(2 + 2).toBe(4);
  });

  test('subtraction needs implementation', () => {
    expect(5 - 3).toBe(3); // Fails first - TDD workflow
  });
});
```

### Running Tests Manually

```bash
# Run all tests
bun test

# Run with JUnit output (for tdd-guard)
bun test path/to/test.test.ts --reporter junit --reporter-outfile .claude/tdd-guard/data/test-junit.xml

# Convert JUnit to tdd-guard format
node .claude/tdd-guard/convert-junit.js .claude/tdd-guard/data/test-junit.xml .claude/tdd-guard/data/test.json
```

## Troubleshooting

### "No test results found"

Make sure tests have been run with the JUnit reporter:
```bash
bun test --reporter junit --reporter-outfile .claude/tdd-guard/data/test-junit.xml
```

### Build Issues

The project has a missing `@pike-lsp/core` dependency. A simple workaround package has been created in `packages/core/`. If you encounter build issues:

1. Rebuild the core package:
   ```bash
   cd packages/core && bun run build && cd ../..
   ```

2. Reinstall dependencies:
   ```bash
   bun install
   ```

### TDD Guard Not Activating

1. Verify hooks are configured: Check `.claude/settings.json`
2. Verify tdd-guard is installed: `tdd-guard --version`
3. Check test results exist: `cat .claude/tdd-guard/data/test.json`

## Example TDD Workflow

```bash
# 1. Write a failing test
cat > my-feature.test.ts << 'EOF'
import { test, expect } from 'bun:test';

test('my feature works', () => {
  expect(myFunction()).toBe('expected result');
});
EOF

# 2. Run the test (it should fail)
bun test my-feature.test.ts

# 3. Run with JUnit reporter for tdd-guard
bun test my-feature.test.ts --reporter junit --reporter-outfile .claude/tdd-guard/data/test-junit.xml
node .claude/tdd-guard/convert-junit.js .claude/tdd-guard/data/test-junit.xml .claude/tdd-guard/data/test.json

# 4. Now implement the feature - tdd-guard will validate you have a failing test first
# Edit your implementation files...

# 5. Run tests again to verify implementation passes
bun test my-feature.test.ts
```

## Resources

- [tdd-guard Documentation](https://github.com/nizos/tdd-guard)
- [Bun Test Documentation](https://bun.sh/docs/test)
- [Claude Code Hooks Documentation](https://code.anthropic.com/docs/hooks)

## Notes

- This setup uses a custom JUnit-to-JSON converter since bun test is not natively supported by tdd-guard yet
- The test results are stored in `.claude/tdd-guard/data/test.json`
- TDD Guard reads the test results to validate TDD workflow compliance
- Hooks are configured locally in `.claude/settings.json` (project-specific, not global)
