# Contributing to Pike LSP

Thank you for your interest in contributing to Pike LSP! This document provides guidelines and instructions for contributing.

> **Note:** This project was 100% coded by AI agents. Contributions are welcome, but please be aware that the original codebase was AI-generated. The maintainer(s) are not responsible for any issues arising from the use of this software. All contributions will be reviewed but contributors assume responsibility for their own code.

## 📋 Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all experience levels.

## 🚀 Getting Started

### Prerequisites

1. **Pike 8.1116 or later** - The Pike programming language (for local development)
2. **Node.js 18+** - JavaScript runtime
3. **pnpm** - Package manager (install with `npm install -g pnpm`)
4. **VS Code** - For extension development and testing

### Setting Up the Development Environment

```bash
# Clone the repository
git clone https://github.com/pike-lsp/pike-lsp.git
cd pike-lsp

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests to verify setup
./scripts/run-tests.sh
```

> **Note:** For local development, Pike 8.1116 is recommended. CI automatically tests on multiple Pike versions (8.1116 as required, latest as best-effort).

## 📁 Project Structure

```
pike-lsp/
├── packages/
│   ├── pike-bridge/         # TypeScript ↔ Pike communication
│   ├── pike-analyzer/       # Semantic analysis
│   ├── pike-lsp-server/     # LSP server
│   └── vscode-pike/         # VS Code extension
├── pike-scripts/
│   └── analyzer.pike        # Pike parsing backend
├── scripts/                 # Build and test scripts
└── test/                    # Test fixtures
```

## 🔧 Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Changes

- Follow the existing code style
- Add tests for new functionality
- Update documentation as needed

### 3. Run Tests

**Always run tests before committing:**

```bash
# Full test suite
./scripts/run-tests.sh

# Or specific tests
cd packages/pike-lsp-server
node --test dist/tests/lsp-tests.js
```

#### Pike Stdlib Source Paths
The stdlib parsing tests look for a Pike source checkout at `../Pike` by default. Override with:

```bash
PIKE_SOURCE_ROOT=/path/to/Pike ./scripts/run-tests.sh
# or
PIKE_STDLIB=/path/to/Pike/lib/modules PIKE_TOOLS=/path/to/Pike/lib/include ./scripts/run-tests.sh
```

### 4. Commit Changes

Use clear, descriptive commit messages:

```bash
git commit -m "feat: add code lens for reference counts"
git commit -m "fix: correct symbol position for multi-line functions"
git commit -m "docs: update README with new features"
```

Commit message prefixes:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `test:` - Adding tests
- `refactor:` - Code refactoring
- `perf:` - Performance improvement

### 5. Submit Pull Request

1. Push your branch: `git push origin feature/your-feature-name`
2. Open a Pull Request on GitHub
3. Fill out the PR template
4. Wait for CI to pass
5. Request review

## 🧪 Testing Guidelines

### Test Structure

Tests are located in `packages/pike-lsp-server/src/tests/`:

| File | Purpose |
|------|---------|
| `lsp-tests.ts` | Core LSP functionality |
| `integration-tests.ts` | End-to-end workflows |
| `lsp-protocol-tests.ts` | Hover, completion, definition |
| `performance-tests.ts` | Speed and memory benchmarks |
| `pike-source-tests.ts` | Pike stdlib validation |

### Adding Tests

1. Choose the appropriate test file
2. Add your test case using `node:test`:

```typescript
import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('Your Feature', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
    });

    after(async () => {
        await bridge.stop();
    });

    it('should do something', async () => {
        const result = await bridge.parse('int x = 5;', 'test.pike');
        assert.ok(result.symbols.some(s => s.name === 'x'));
    });
});
```

### Test Requirements

- All new features MUST have tests
- Tests MUST pass before merging
- Pike stdlib files MUST continue to parse (100% compatibility)

### Version Testing

- **Local development:** Use Pike 8.1116
- **CI:** Tests on Pike 8.1116 (required) and latest (best-effort)
- **When adding compat shims:** Test on both versions if possible
- **Version-specific issues:** Add to Known Issues table in README.md

## 📝 Code Style

### TypeScript

- Use TypeScript strict mode
- No `any` types unless absolutely necessary
- Use type guards for runtime validation
- Document public APIs with TSDoc

```typescript
/**
 * Parse Pike source code and extract symbols.
 * @param code - The Pike source code
 * @param filename - Optional filename for error messages
 * @returns Parse result with symbols and diagnostics
 */
async function parse(code: string, filename?: string): Promise<PikeParseResult>
```

### Pike

- Use Pike 8 features
- Document functions with `//!` comments
- Handle errors gracefully (no silent `catch {}`)
- Use `LSP.Compat.pike_version()` for version detection instead of checking `__REAL_VERSION__` directly
- For version-specific code, use `Compat.pmod` polyfills or `#if constant()` checks

```pike
//! Parse the given code and return symbols.
//! @param code The Pike source code to parse.
//! @returns A mapping with symbols and diagnostics.
protected mapping handle_parse(mapping params)
```

## 🏗️ Architecture Guidelines

### Adding New LSP Features

1. **Server capability**: Add to `onInitialize` in `server.ts`
2. **Handler**: Implement `connection.onXxx()` handler
3. **Bridge method** (if needed): Add to `bridge.ts`
4. **Pike handler** (if needed): Add to `analyzer.pike`
5. **Tests**: Add to appropriate test file
6. **Documentation**: Update README.md

### Type Safety

Use the type guards in `utils/validation.ts`:

```typescript
import { isPikeSymbol, validatePikeResponse } from './utils/validation.js';

const result = validatePikeResponse(rawResult, isPikeParseResult, 'PikeParseResult');
```

### Constants

Add new constants to `constants/index.ts`:

```typescript
export const MY_NEW_CONSTANT = 100;
```

## 🐛 Reporting Issues

### Bug Reports

Include:
1. **Pike version** (`pike --version`) - **Always include this with exact output**
2. Node.js version (`node --version`)
3. VS Code version
4. Steps to reproduce
5. Expected vs actual behavior
6. Error messages or logs (including any version-specific error messages)

### Feature Requests

Describe:
1. The problem you're trying to solve
2. Your proposed solution
3. Alternatives you've considered

## 📦 Release Process

1. Update version in `packages/vscode-pike/package.json`
2. Update `CHANGELOG.md`
3. Run full test suite
4. Create release commit: `git commit -m "release: v1.x.x"`
5. Tag: `git tag v1.x.x`
6. Build and package: `pnpm build && cd packages/vscode-pike && pnpm package`
7. Push with tags: `git push origin main --tags`
8. Create GitHub release with .vsix file

## ❓ Questions?

- Open a GitHub issue
- Check existing issues and PRs

Thank you for contributing! 🎉
