# Why This Design: Arguments in Favor

**Document:** LSP Modularization Design Rationale
**Date:** 2026-01-20

---

## 1. Infrastructure-First Prevents the Bugs That Hurt Most

The recent stdin reading bug (`b45ef37`) is the perfect case study. The analyzer was using `Stdio.read()` (waits for EOF) instead of `gets()` (line-by-line), causing the entire LSP to silently hang.

**Why it was hard to catch:**
- No error was thrown
- No logs indicated what was wrong
- Unit tests passed (they didn't test the actual IPC flow)
- The failure mode was "nothing happens" - the worst kind

**How infrastructure-first prevents this:**
- Structured error chains would show: "Bridge timeout → No response from Pike subprocess"
- Health checks would immediately report: "Pike process alive but unresponsive"
- Logging at TRACE level would show: "Sent request, waiting for response..." with no follow-up
- The pre-commit smoke test would fail because the LSP doesn't respond

Building this infrastructure *before* refactoring means every subsequent change is protected by these guardrails.

---

## 2. Zero Breaking Changes Forces Discipline

The constraint that every commit must leave the LSP working sounds restrictive, but it's actually liberating:

**Benefits:**
- **Always shippable** - Any commit can be released if needed
- **Easy bisection** - When bugs appear, `git bisect` works perfectly
- **Incremental progress** - Can pause the refactor at any phase without leaving a broken codebase
- **Confidence to refactor** - The test suite proves each step works

**The alternative (feature branch tolerance) has hidden costs:**
- Long-lived branches diverge from main, causing painful merges
- "We'll fix it before merge" often becomes "we forgot what we broke"
- Team members can't easily collaborate on a broken branch

---

## 3. Layer Isolation Makes Debugging Trivial

After this refactor, when something breaks, the error chain tells you exactly where:

```
Hover failed
  → Bridge: timeout after 5000ms
    → Pike: compile error at line 42
```

**Current state:** When hover fails, you have to:
1. Check if the server received the request
2. Check if the bridge sent it to Pike
3. Check if Pike received it
4. Check if Pike processed it
5. Check if Pike sent a response
6. Check if the bridge received it
7. Check if the server formatted it correctly

**After refactor:** The error tells you which layer failed and why. Debugging becomes:
1. Read the error chain
2. Go to that layer
3. Fix it

---

## 4. Each Phase Delivers Standalone Value

This isn't an all-or-nothing refactor. Each phase improves the codebase independently:

| Phase | Value Delivered Even If You Stop Here |
|-------|---------------------------------------|
| Phase 1: Errors | Clear error messages with context, easier debugging |
| Phase 2: Logging | Configurable verbosity, trace request flow |
| Phase 3: Testing | Pre-commit guards, CI catches regressions |
| Phase 4: Bridge | IPC isolation, bridge bugs are obvious |
| Phase 5: Pike | Smaller Pike files, easier to understand |
| Phase 6: Server | Handler isolation, features don't interfere |

If priorities change mid-refactor, you've still improved the codebase. No wasted work.

---

## 5. Proven Patterns From Successful Projects

This structure mirrors how well-maintained codebases are organized:

**VS Code itself:**
- `src/vs/editor/contrib/hover/` - hover feature isolated
- `src/vs/editor/contrib/gotoSymbol/` - go-to-definition isolated
- `src/vs/platform/log/` - logging infrastructure

**TypeScript language server:**
- `src/services/` - service layer
- `src/server/` - protocol handlers

**The pattern:**
- Core infrastructure (errors, logging) available everywhere
- Features in isolated directories
- Services shared across features
- Thin entry point wiring it together

These aren't arbitrary choices - they're patterns that emerged from maintaining large codebases over years.

---

## 6. Defense in Depth Testing Strategy

Three layers of testing, each catching different bugs:

**Pre-commit (< 30 seconds):**
- Catches: syntax errors, type errors, obvious regressions
- Fast enough to run on every commit
- Blocks commits that would obviously break things

**CI unit + smoke tests:**
- Catches: integration issues, protocol errors, edge cases
- Runs on every push
- Blocks merges that would break the LSP

**CI VSCode E2E:**
- Catches: real-world failures, VSCode-specific issues
- Proves the actual user experience works
- Final gate before release

**Why all three?**
- Pre-commit alone misses integration issues
- CI alone is too slow for fast iteration
- E2E alone is too slow and flaky for every change

Each layer adds confidence without slowing down the others.

---

## 7. Observability Is Built-In, Not Bolted-On

Many projects add logging and health checks as an afterthought, leading to:
- Inconsistent log formats
- Missing context in errors
- No way to inspect system state

This design makes observability a first-class concern:

**Structured errors:** Every error carries its origin, cause chain, and context
**Configurable logging:** One setting controls verbosity across all layers
**Health checks:** Single command shows status of every component

When something goes wrong in production (or development), you have the tools to diagnose it immediately.

---

## 8. Respects Pike's Module Idioms

The Pike structure uses `.pmod` directories correctly:

```
Intelligence.pmod/
  module.pmod         # Shared utilities
  Introspection.pike  # Can use .Resolution, access module.pmod directly
  Resolution.pike
```

**Why this matters:**
- Pike developers will recognize the pattern
- Module-local references (`.ClassName`) work naturally
- Shared code in `module.pmod` is available without imports
- Follows Pike standard library conventions

A refactor that fights the language's idioms creates friction. This one works with Pike, not against it.

---

## 9. Low Risk, High Confidence

**Risk mitigations built into the approach:**

| Risk | Mitigation |
|------|------------|
| Refactor breaks LSP | Pre-commit + CI tests catch regressions |
| Too much change at once | Six phases, each small and focused |
| Lose track of progress | Each phase has clear deliverables |
| Pike changes break TS | Error chain shows exactly where |
| Hard to debug new structure | Logging and health checks from Phase 2 |
| Can't pause mid-refactor | Each phase leaves working code |

**Confidence boosters:**
- Existing test suite provides baseline coverage
- Infrastructure phases establish patterns before big changes
- Zero breaking changes constraint forces small, safe steps

---

## 10. The Cost of Not Doing This

Without this refactor:

**Debugging stays painful:**
- Silent failures continue
- Hours spent tracing through 4,700-line files
- "Works on my machine" with no way to diagnose

**Changes stay risky:**
- Any change to `server.ts` risks breaking unrelated features
- Fear of refactoring leads to more band-aids
- Technical debt compounds

**Onboarding stays hard:**
- New contributors face a wall of monolithic files
- No clear entry points or boundaries
- Tribal knowledge required

**The stdin bug repeats:**
- Next IPC issue will be just as hard to catch
- No systematic way to prevent similar failures

---

## Summary

This design addresses the root causes of the current pain:

| Pain | Root Cause | How Design Fixes It |
|------|------------|---------------------|
| Hard to debug | No error context | Structured error chains |
| Silent failures | No observability | Logging + health checks |
| Regressions | Inadequate testing | Pre-commit + CI + E2E |
| Fear of changes | Monolithic files | Isolated modules |
| IPC bugs | No isolation | Bridge layer split |

The infrastructure-first approach ensures that every subsequent improvement is protected by the guardrails established in the early phases.
