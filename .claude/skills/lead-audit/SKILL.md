---
name: lead-audit
description: Deep audit for junk, gaps, and new work. Runs in isolated subagent.
context: fork
agent: Explore
disable-model-invocation: true
allowed-tools: Bash(scripts/*), Bash(grep *), Bash(find *), Bash(wc *), Bash(cat *), Read, Grep, Glob
---

# Codebase Audit

Run a thorough audit and report findings in grep-friendly format.

## 1. Repo Hygiene
Run `scripts/repo-hygiene.sh` and capture output. Additionally scan for:
- Dead exports: `grep -rn "export " --include="*.ts" | grep -v "import"` cross-referenced with usage
- Empty/near-empty files: `find . -name "*.ts" -size -50c -not -path "*/node_modules/*"`
- Orphaned test files with no corresponding source
- Commented-out code blocks (>5 lines)

## 2. LSP Feature Gaps
Compare implemented features against LSP spec:
- `grep -rn "onRequest\|onNotification" packages/pike-lsp-server/src/ | sort`
- Check which LSP methods are missing (semantic tokens, code actions, code lens, folding, rename, inlay hints, workspace symbols)

## 3. Test Quality
Run `scripts/test-agent.sh --quality` and identify:
- Files with zero test coverage
- Placeholder tests remaining (by tier)

## 4. Roxen Coverage
Check for Roxen-specific handling:
- `grep -rn "roxen\|RXML\|module_path" packages/ pike-scripts/`

## Output Format
Report ALL findings as one-line entries:
```
HYGIENE: <file> | <issue>
GAP: <lsp_method> | not implemented
TEST: <file> | <issue>
ROXEN: <area> | <gap>
```
