# Agent Knowledge Base

**Last Updated**: 2026-04-03

**VERIFICATION REQUIRED**: If you're an AI agent reading this, you MUST acknowledge by including `KB_ACCESS_CONFIRMED` in your first response. This verifies you actually read the knowledge base, not just claiming you did.

> **AGENT_VERIFICATION_MARKER**: 2026-04-03-k2p5-v1

Quick reference for agents working on the Pike LSP codebase.

## Quick Links

- [Discoveries](discoveries.md) - Recent findings about the codebase
- [Special Cases](special-cases.md) - Edge cases and workarounds
- [Patterns](patterns.md) - Established code patterns and conventions
- [Gotchas](gotchas.md) - Common traps and how to avoid them
- [Session Start Checklist](SESSION_START.md) - REQUIRED: Complete before every task

## Recent Learnings (Last 5)

1. **2026-04-03**: Knowledge base verification system added - agents must now confirm KB_ACCESS_CONFIRMED
2. **2026-04-03**: Google ADK skill patterns align with our knowledge base structure (L1/L2/L3 progressive disclosure)
3. **2026-04-03**: Pike `import` order doesn't matter (late binding) - only `inherit` requires ordering
4. **2026-04-03**: Test Explorer module already existed, just needed wiring
5. **2026-04-03**: Check package.json for existing settings before adding new ones

## Before You Start

1. Read [SESSION_START.md](SESSION_START.md) and complete the MANDATORY checklist
2. Check [Gotchas](gotchas.md) for common issues
3. Check [Discoveries](discoveries.md) for recent findings related to your task
4. Review [Patterns](patterns.md) for code conventions
5. Check existing issues labeled 'safe' before creating new ones
6. **Include `KB_ACCESS_CONFIRMED` in your first response**

## After You Finish (REQUIRED Updates)

You MUST update the knowledge base if you learned anything new:

1. **New discovery?** → Add to [discoveries.md](discoveries.md) with date prefix
2. **New trap encountered?** → Add to [gotchas.md](gotchas.md)
3. **New pattern established?** → Add to [patterns.md](patterns.md)
4. **New special case?** → Add to [special-cases.md](special-cases.md)
5. **New learning?** → Update this INDEX.md "Recent Learnings" section
6. **Update timestamp** → Update "Last Updated" in all files you modify

**Not updating the knowledge base is a violation of agent protocol.**

## Knowledge Base Structure

This knowledge base follows the progressive disclosure pattern (inspired by Google ADK):

- **L1 (INDEX.md)**: Quick reference - always loaded
- **L2 (patterns.md, gotchas.md)**: Detailed knowledge - loaded on demand
- **L3 (test files, references)**: External resources - loaded when needed

See [discoveries.md](discoveries.md) for analysis of Google ADK skill patterns and how they apply to our knowledge base.

## Enforcement

Run `bash scripts/check-knowledge-base-updates.sh` to verify:

- Verification marker exists
- SESSION_START.md exists
- Knowledge base is being updated (not stale)
- All discoveries have proper dates
