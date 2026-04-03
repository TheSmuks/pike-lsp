# Agent Session Start Checklist

**MANDATORY**: Complete ALL items before starting any task. This ensures knowledge base engagement.

## Pre-Task Checklist

Copy this checklist into your first response and check off each item:

```markdown
## Knowledge Base Engagement

- [ ] Read `.agent-knowledge/INDEX.md` and verified AGENT_VERIFICATION_MARKER
- [ ] Navigated to the category relevant to my task (architecture/ ci-cd/ testing/ workflows/ reference/)
- [ ] Read the category INDEX.md and specific entry files (at least 2 entries)
- [ ] Checked `reference/discoveries.md` for any findings related to my task area
- [ ] Confirmed no open 'safe' issues overlap with my task

## What I Learned

**Key insight from [category]/[entry]:**

> [Write 1-2 sentences about the most relevant finding from the knowledge base]

**Key insight from [category]/[entry]:**

> [Write 1-2 sentences about another relevant finding]

**Key insight from reference/discoveries.md:**

> [Write 1-2 sentences about a discovery relevant to your task, or "None relevant to this task"]

## Update Commitment

- [ ] I will update `reference/discoveries.md` if I find anything new
- [ ] I will update the relevant category entry if I encounter traps or new patterns
- [ ] I will create new entries only if they fit within 3-5 per category limit

**KB_VERIFICATION:** KB_ACCESS_CONFIRMED
```

---

## Enforcement

If you do NOT include the completed checklist with `KB_ACCESS_CONFIRMED` in your first response, the system will assume you haven't read the knowledge base and may:

- Reject your task acceptance
- Require you to re-read the knowledge base
- Flag your session for review

This is not optional. The knowledge base contains critical information that prevents repeated mistakes.

---

## Why This Matters

The knowledge base exists because agents were:

- Repeating the same mistakes
- Not learning from previous sessions
- Missing critical context about the codebase

By requiring this checklist, we ensure:

1. You actually READ the knowledge base (not just claim you did)
2. You UNDERSTAND the relevant parts (summarizing proves comprehension)
3. You COMMIT to keeping it updated (preventing future staleness)

---

## Navigation Reminder

```
.agent-knowledge/
├── INDEX.md              ← START HERE
├── architecture/         ← System design, patterns, ADRs
├── ci-cd/                ← CI/CD behavior, workarounds
├── testing/              ← Scenario patterns, failures
├── workflows/            ← Agent processes, task lifecycle
└── reference/            ← Discoveries, archives, THIS FILE
```

---

## Post-Task Update Checklist

After completing your task, update the knowledge base:

```markdown
## Knowledge Base Updates Made

- [ ] Updated category INDEX.md with new entry (if applicable, within 3-5 limit)
- [ ] Added new discovery to `reference/discoveries.md` (if applicable)
- [ ] Updated existing entry with new findings (if applicable)

**Files updated:** [list files]
```
