---
name: lead-retrospective
description: Lead retrospective after each iteration. Analyzes handoffs, identifies improvements for next cycle.
disable-model-invocation: true
---

# Lead Retrospective

After each iteration (when all teammates report DONE or IDLE), run this retrospective.

## Step 1: Collect Handoffs

Read all handoff files from previous iteration:
```bash
ls -la .omc/handoffs/
```

For each handoff, read:
```bash
cat .omc/handoffs/<branch>.md
```

## Step 2: Analyze Each Handoff

For each completed task, note:
- **What worked well?**
- **What was difficult?**
- **Any blockers encountered?**
- **Tests added?**

## Step 3: Aggregate Patterns

Search for common patterns in handoffs:
```bash
grep -r "BLOCKED\|ISSUE\|ERROR\|difficult\|complex\|slow" .omc/handoffs/
```

## Step 4: Check Failed Approaches

```bash
cat .claude/status/failed-approaches.log 2>/dev/null || echo "(no failures)"
```

## Step 5: Output Retrospective

Create a retrospective summary in `.omc/retrospectives/iteration-N.md`:

```markdown
# Retrospective - Iteration N

## Completed
- feat/description #42 | 3 tests | 0 regressions
- fix/issue #43 | 1 test | resolved blocker

## Patterns Identified
- 2/5 tasks had X difficulty → consider breaking into smaller issues
- 1/5 tasks hit Y blocker → need to add to checklist

## Improvements for Next Iteration
1. Add more specific acceptance criteria for type/Z issues
2. Pre-check Pike stdlib availability before assigning parser tasks
3. Increase test coverage requirement for pike-side features

## Team Performance
- Tasks completed: X
- Tests added: Y
- Blockers: Z
```

## Step 6: Adjust Workflow

Based on retrospective, consider:
1. **Issue refinement** — Are issues too large? Add breakdown notes
2. **Skill gaps** — Should teammates read additional docs?
3. **Tooling issues** — Any scripts that need fixing?
4. **Communication** — Any unclear expectations?

## Step 7: Continue

After retrospective:
1. Run `/worker-orient` to pick new issues
2. Assign based on learnings
3. Start next iteration

**Tip:** Run this after each wave of teammate completions, not after every single task.
