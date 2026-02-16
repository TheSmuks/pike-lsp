---
id: contributing
title: Contributing
description: How to contribute to Pike LSP
---

# Contributing to Pike LSP

Thank you for your interest in contributing to Pike LSP. This document provides guidelines and instructions for contributors.

:::note
This project is in active development. Contributions are welcome, and all submissions will be reviewed.
:::

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all experience levels.

## Getting Started

### Prerequisites

1. **Pike 8.1116 or later** - The Pike programming language
2. **Node.js 18+** - JavaScript runtime
3. **bun** - Package manager
4. **VS Code** - For extension development and testing

### Setting Up the Development Environment

```bash
# Clone the repository
git clone https://github.com/TheSmuks/pike-lsp.git
cd pike-lsp

# Install dependencies
bun install

# Build all packages
bun run build

# Run tests to verify setup
./scripts/run-tests.sh
```

## Development Workflow

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

# Smoke test
scripts/test-agent.sh --fast
```

### 4. Commit Changes

Use clear, descriptive commit messages with conventional prefixes:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `test:` - Adding tests
- `refactor:` - Code refactoring
- `perf:` - Performance improvement

### 5. Submit Pull Request

1. Push your branch: `git push origin feature/your-feature-name`
2. Open a Pull Request on GitHub
3. Wait for CI to pass
4. Request review

## Testing Guidelines

### Test Structure

| File | Purpose |
|------|---------|
| `lsp-tests.ts` | Core LSP functionality |
| `integration-tests.ts` | End-to-end workflows |
| `pike-source-tests.ts` | Pike stdlib validation |

### Adding Tests

All new features must have tests. Tests must pass before merging.

## Code Style

### TypeScript

- Use TypeScript strict mode
- No `any` types unless absolutely necessary
- Use type guards for runtime validation
- Document public APIs with TSDoc

### Pike

- Use Pike 8 features
- Document functions with `//!` comments
- Handle errors gracefully

## Reporting Issues

Include in bug reports:
1. **Pike version** (`pike --version`)
2. Node.js version (`node --version`)
3. VS Code version
4. Steps to reproduce
5. Expected vs actual behavior
6. Error messages or logs

## Questions

- Open a GitHub issue
- Check existing issues and PRs

Thank you for contributing.
