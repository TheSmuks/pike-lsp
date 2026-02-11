# ADR-013: Strict Type Safety - No `any`, No Ignored Errors

**Status:** active
**Area:** workflow
**Date:** 2026-02-10

## Context

Agents use `any` as a shortcut when they can't figure out the correct type. This undermines TypeScript's entire value proposition - if types are bypassed, bugs slip through silently. Similarly, `@ts-ignore` and `@ts-expect-error` suppress legitimate compiler warnings that indicate real problems.

The codebase currently has zero explicit `any` annotations and only 6 `@ts-ignore`/`@ts-expect-error` instances. This is the right time to lock it down before technical debt accumulates.

## Decision

1. **`any` is banned.** No explicit `any` type annotations in any TypeScript file.
   - Use `unknown` when the type is truly unknown (requires narrowing before use)
   - Use `Record<string, unknown>` for arbitrary object shapes
   - Use specific types, interfaces, or generics whenever possible
   - Use `never` for impossible states

2. **`@ts-ignore` is banned.** Never suppress TypeScript errors silently.

3. **`@ts-nocheck` is banned.** Never disable type checking for entire files.

4. **`@ts-expect-error` is allowed with description.** Must include a 10+ character description explaining why. This is for genuine edge cases (e.g., third-party type mismatches).

5. **Zero warnings on push.** The pre-push hook runs ESLint with `--max-warnings 0`. Any warning or error blocks the push.

## Enforcement

| Layer | Mechanism | What It Catches |
|-------|-----------|----------------|
| Real-time | `type-safety-gate.sh` Claude hook | Blocks agents from writing `any` or `@ts-ignore` |
| Pre-push | `bun run lint -- --max-warnings 0` | Catches any lint warning/error before push |
| ESLint | `no-explicit-any: error` | Flags `any` in all TS files |
| ESLint | `ban-ts-comment: error` | Flags `@ts-ignore` and `@ts-nocheck` |
| CI | GitHub required status checks | Build must pass (includes type checking) |

## Alternatives Rejected

- **`any` as warning only** - Agents routinely ignore warnings. Only `error` stops them.
- **Allow `@ts-ignore` with description** - Unlike `@ts-expect-error`, `@ts-ignore` doesn't verify the error still exists. It silently hides issues that may have been fixed or changed.
- **Gradual migration** - The codebase already has zero `any` usage. No migration needed.

## Consequences

- Agents must think harder about types instead of using `any` as an escape hatch
- Slightly slower development when dealing with complex third-party types
- Significantly fewer runtime type errors
- Better IDE support (hover, autocomplete, refactoring all work better with real types)
- Existing 6 `@ts-expect-error` instances need to be reviewed and fixed

## Challenge Conditions

Revisit this decision if:
- A third-party library genuinely requires `any` at the boundary (add a typed wrapper instead)
- TypeScript introduces a better alternative to `unknown` for untyped boundaries
- The rule causes more than 10% development slowdown on typical tasks
