# Phase 5: Verification - Context

**Gathered:** 2026-01-20
**Status:** Ready for planning

## Phase Boundary

Validate the refactored codebase runs correctly on all target Pike versions (7.6, 7.8, 8.0.x) with comprehensive cross-version testing. Scope is testing infrastructure and compatibility validation, not adding new features to the LSP server.

## Implementation Decisions

### Test Environments

- **Local development**: Pike 8.1116 only (developer's installed version)
- **CI primary**: Pike 8.1116 (current target, ~5 years old)
- **CI secondary**: Latest stable Pike (forward compatibility check)
- **Rationale**: Fast local iteration, comprehensive CI verification. No Docker dependency for contributors
- **CI approach**: Agent should verify during implementation if `.github/workflows/` exists. Extend existing or create GitHub Actions workflow with Pike version matrix

### Version Support Policy

Two-tier support model:

| Tier | Versions | Policy |
|------|----------|--------|
| Required | Pike 8.1116 | Must pass to merge |
| Best-effort | Newer Pike | Warn but don't block (continue-on-error: true) |

- **When newer Pike fails**: Investigate severity, fix if easy (compat shim), document if not
- **Decision criteria**: Quick fix → do it; Complex fix without user demand → document; Complex fix with user demand → open issue

### Compatibility Documentation

- **README.md** initially: Add "Compatibility" section with Known Issues table
- **Extract to COMPATIBILITY.md** when: 6+ issues, complex workarounds, or version-specific install steps
- **Version labels**: Add GitHub labels like `pike-8.1116`, `pike-latest` for tracking version-specific issues

### Module Loading Tests

- **Import test via master()->resolv()**: Tests real usage path, catches syntax errors, missing deps, circular imports, compat shim failures
- **Minimal smoke check**: Verify 1-2 critical exports per module (e.g., LSP.Cache, LSP.Parser), not full export verification
- **Run once at start**: module-load-tests.pike as first CI step for fail-fast behavior
- **Circular dependency**: Implicit detection via Pike's compiler, no explicit test needed

### Test Coverage

- **Full matrix**: All 12 LSP methods tested on all Pike versions (24 combinations)
- **Edge cases**: Compat-relevant edge cases (String API, error messages, exception handling) on all versions; pure logic edge cases on primary only
- **Tracking**: CI output as source of truth, PLAN.md checklist for phase completion
- **Approach**: Extend existing test suites with CI matrix, add module-load-tests.pike and response-format-tests.pike

## Specific Ideas

- "I like how GitHub Actions shows version matrix results side-by-side"
- CONTRIBUTING.md should explain: local dev on 8.1116, CI handles matrix, when to add compat shims
- Add CLA.md (Contributor License Agreement) alongside CONTRIBUTING.md

## Deferred Ideas

- CLA.md implementation — note for project setup, not part of verification phase

---

*Phase: 05-verification*
*Context gathered: 2026-01-20*
