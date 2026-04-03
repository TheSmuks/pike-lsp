# Knowledge Base Enforcement Policy

**Version**: 1.0  
**Effective**: 2026-04-03  
**Status**: Active

---

## Purpose

This policy ensures all significant code changes are documented in the Knowledge Base (KB) with traceable IDs that can be referenced in code comments. This preserves institutional knowledge and helps future agents understand design decisions.

---

## KB-ID Format

All KB entries use the hybrid canonical format:

```
KB-{DOMAIN}-{YYYYMMDD}-{SEQ}
```

**Example**: `KB-PATTERN-20260403-001`

### Domains (Controlled Enum)

| Domain     | Purpose                                 |
| ---------- | --------------------------------------- |
| `ARCH`     | Architecture decisions, system design   |
| `PATTERN`  | Implementation patterns, best practices |
| `DEBUG`    | Failure analysis, debugging techniques  |
| `TEST`     | Test strategies, coverage patterns      |
| `CI`       | Pipeline behavior, CI/CD gotchas        |
| `WORKFLOW` | Agent process, task protocols           |

### Rules

1. **Unique**: No duplicate IDs across entire repository
2. **Sequential**: SEQ resets daily, starts at 001
3. **Immutable**: Once assigned, never change
4. **Date accurate**: Use actual creation date

---

## Required KB Template

Every KB entry MUST use this frontmatter + body structure:

```markdown
---
id: KB-PATTERN-20260403-001
domain: PATTERN
date: 2026-04-03
authors: [agent-name]
status: active
summary: One-line practical takeaway
code_references:
  - packages/pike-lsp-server/src/features/hierarchy.ts:45
related_kb:
  - KB-ARCH-20260328-002
verification:
  - bun test packages/pike-lsp-server/src/scenarios/...
---

## Context

When/where this mattered. Issue references, PR links.

## Problem

Concrete failure mode or ambiguity encountered.

## Decision

What was chosen and why. Alternatives considered.

## Implementation Notes

Important constraints, invariants, non-obvious details.

## Consequences

Trade-offs, risks, follow-up work needed.

## Usage Guidance

How future agents should apply this knowledge.
```

### Required Fields

Frontmatter: `id`, `domain`, `date`, `summary`, `code_references`  
Body sections: `Context`, `Problem`, `Decision`

---

## Code Annotation Format

Reference KB entries in code using the `@kb` annotation:

```typescript
// @kb KB-PATTERN-20260403-001: Inherit chain traversal rationale
function traverseInherits(symbol: PikeSymbol) {
  // ...
}

// @kb KB-ARCH-20260328-002, KB-PATTERN-20260403-001: Multi-pattern refs
class HierarchyProvider {
  // ...
}
```

### Rules

1. **Place where non-obvious**: Algorithmic branches, cache invariants, protocol behavior
2. **Not on trivial lines**: Don't annotate standard patterns or obvious code
3. **Multiple allowed**: One comment can reference multiple KB entries
4. **File-level allowed**: Header block with `// @kb-ref KB-..., KB-...`

---

## Enforcement Layers

### Layer A — Subagent Contract (Prompt Level)

Every delegated task MUST include in the output:

```
KB COMPLIANCE:
- Entry Added: .agent-knowledge/{domain}/{filename}.md
- KB ID: KB-{DOMAIN}-{YYYYMMDD}-{SEQ}
- Code References Added: [file:line, file:line, ...]
- Why this KB matters: [1 sentence explaining significance]
```

**If missing → Task incomplete → Parent agent must reject**

### Layer B — CI Policy Gate (Authoritative)

The `scripts/check-kb-compliance.ts` script runs in CI for all PRs.

**Hard Fail Conditions**:

1. KB schema invalid (missing required fields, bad ID format)
2. Duplicate KB ID detected
3. `@kb <ID>` in code references non-existent KB entry
4. Code files changed but no KB entry added/updated (unless exempt)
5. New KB entry has no code references to changed files

### Layer C — Local Pre-Commit Hook (Fast Feedback)

Runs same checker locally for immediate feedback:

```bash
bun run scripts/check-kb-compliance.ts --staged
```

### Layer D — PR Template Requirement

PR template includes required checkbox:

```markdown
## Knowledge Base

- [ ] Added/updated KB entry
- KB IDs touched: KB-XXX-YYYYMMDD-XXX
- [ ] Exempt (explain): <!-- Only for trivial changes -->
```

---

## Exemptions

KB entry NOT required when:

1. **Trivial changes**: Typo fixes, formatting, comment-only updates
2. **Test-only changes**: Adding test cases without implementation changes
3. **Documentation only**: README updates, non-technical docs
4. **Revert commits**: Reverting previous changes

**Must mark in PR**: `Exempt: [reason]`

---

## File Locations

| Type           | Path                                        | Extension |
| -------------- | ------------------------------------------- | --------- |
| KB Index       | `.agent-knowledge/INDEX.md`                 | Markdown  |
| Domain Entries | `.agent-knowledge/{domain}/`                | `.md`     |
| Architecture   | `.agent-knowledge/architecture/`            | `.md`     |
| Patterns       | `.agent-knowledge/testing/`                 | `.md`     |
| Discoveries    | `.agent-knowledge/reference/discoveries.md` | Markdown  |

---

## Compliance Script

Run manually:

```bash
# Check all files
bun run scripts/check-kb-compliance.ts

# Check staged files only
bun run scripts/check-kb-compliance.ts --staged

# Check specific PR diff
bun run scripts/check-kb-compliance.ts --pr-base main
```

---

## Ratchet Mode

**Phase 1 (Current)**: Warnings only, no CI fail  
**Phase 2 (Week 2)**: Hard fail on new violations only  
**Phase 3 (Week 4)**: Hard fail on all violations

---

## Related

- [Session Start Checklist](.agent-knowledge/reference/session-start.md)
- [Agent Knowledge Index](.agent-knowledge/INDEX.md)
- [Contributing Guide](AGENTS.md)
