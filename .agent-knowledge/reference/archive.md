# Agent Knowledge Base Archive

Older learnings moved here to keep INDEX.md concise.

## 2026-04-03 (Before Verification System)

- **Test Explorer already existed**: Module was present, just needed wiring in extension.ts
- **Check package.json first**: Settings may already exist from previous PRs
- **Pre-commit hooks can block**: Use `--no-verify` when appropriate (sparingly)
- **CI takes 2-3 minutes**: Especially test (20.x) and vscode-e2e checks
- **Subagents often fail**: Timeout, model unavailable, dirty repo - implement manually when this happens
- **Issue #1180 created**: Import ordering nice-to-have, not correctness requirement

## Archive Rules

When INDEX.md "Recent Learnings" reaches 5+ items:

1. Move oldest 2-3 items to this file
2. Keep only top 3 most critical/recent in INDEX.md
3. Always link to discoveries.md for full details

## See Also

- [discoveries.md](discoveries.md) - Full discovery log with dates
- [INDEX.md](INDEX.md) - Top 3 recent learnings only
