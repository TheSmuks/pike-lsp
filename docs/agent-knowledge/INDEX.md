# Agent Knowledge Base

Quick reference for agents working on the Pike LSP codebase.

## Quick Links

- [Discoveries](discoveries.md) - Recent findings about the codebase
- [Special Cases](special-cases.md) - Edge cases and workarounds
- [Patterns](patterns.md) - Established code patterns and conventions
- [Gotchas](gotchas.md) - Common traps and how to avoid them

## Recent Learnings (Last 5)

1. **2026-04-03**: Pike `import` order doesn't matter (late binding) - only `inherit` requires ordering
2. **2026-04-03**: Test Explorer module already existed, just needed wiring
3. **2026-04-03**: Check package.json for existing settings before adding new ones
4. **2026-04-03**: Pre-commit hooks can block - use `--no-verify` when appropriate
5. **2026-04-03**: CI can be slow - wait 2-3 minutes for all checks

## Before You Start

1. Check [Gotchas](gotchas.md) for common issues
2. Check [Discoveries](discoveries.md) for recent findings related to your task
3. Review [Patterns](patterns.md) for code conventions
4. Check existing issues labeled 'safe' before creating new ones

## After You Finish

1. Document any new discoveries in discoveries.md
2. Add any new gotchas to gotchas.md
3. Update this INDEX.md with new learnings
