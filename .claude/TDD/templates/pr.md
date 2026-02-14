fixes #{{ISSUE}}

## What

(1-2 sentences: what this PR does)

## Test Evidence

**Before:**
```
{{BEFORE}}
```

**After:**
```
{{AFTER}}
```

## Checklist

- [ ] TDD: failing test written before implementation
- [ ] `scripts/test-agent.sh` shows zero regressions
- [ ] No `any` types, no `@ts-ignore`
- [ ] Pike stdlib used where applicable (not regex for parsing)
- [ ] Handoff written to `.omc/handoffs/`
