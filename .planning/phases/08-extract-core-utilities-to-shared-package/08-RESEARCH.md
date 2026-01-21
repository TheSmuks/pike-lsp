# Phase 08: Extract Core Utilities to Shared Package - Research

**Researched:** 2026-01-21
**Domain:** TypeScript Monorepo Infrastructure
**Confidence:** HIGH

## Summary

This phase focuses on eliminating code duplication between `@pike-lsp/pike-lsp-server` and `@pike-lsp/pike-bridge`. Currently, ~400 lines of critical utility code (Logging, Error handling, and Constants) are duplicated to avoid circular dependencies (Server imports Bridge, so Bridge cannot import from Server).

The standard solution in a pnpm workspace is to extract these shared utilities into a leaf package (e.g., `@pike-lsp/core`) that both packages can depend on.

**Primary recommendation:** Create a new `@pike-lsp/core` package and migrate Logger, LSPError, and shared constants to it.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.3.0 | Type safety | Project standard |
| pnpm | 8.x+ | Workspace management | Already used in repo |
| node:test | Native | Test runner | Used in other packages |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsc | Native | Compilation | Building the core package |

**Installation:**
```bash
# In packages/core
pnpm init
```

## Architecture Patterns

### Recommended Project Structure
```
packages/
├── core/                # New package
│   ├── src/
│   │   ├── logging.ts   # Extracted Logger
│   │   ├── errors.ts    # Extracted Error classes
│   │   ├── constants.ts # Shared constants
│   │   └── index.ts     # Public exports
│   ├── package.json
│   └── tsconfig.json
├── pike-bridge/         # Depends on @pike-lsp/core
└── pike-lsp-server/     # Depends on @pike-lsp/core
```

### Pattern 1: Workspace Dependency
Using `workspace:*` ensures the packages always use the local version of the shared utilities without needing to publish to an external registry.

### Pattern 2: Barrel Exports
The `src/index.ts` should export all public utilities to provide a clean import interface:
```typescript
export * from './logging.js';
export * from './errors.js';
export * from './constants.js';
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Package linking | Relative path imports | pnpm workspaces | Manages symlinks and versioning correctly |
| Build pipeline | Custom build scripts | `tsc` | Standard and consistent with existing packages |

## Common Pitfalls

### Pitfall 1: ESM Extension Requirement
**What goes wrong:** Imports fail at runtime with "Module not found" or "Cannot find module".
**Why it happens:** In ESM (`"type": "module"`), imports must include the `.js` extension, even when writing `.ts` files.
**How to avoid:** Ensure all internal imports in `@pike-lsp/core` and packages using it use `.js` extensions (e.g., `import { Logger } from './logging.js'`).

### Pitfall 2: tsconfig Inheritance
**What goes wrong:** Build output differs from other packages or fails to find workspace types.
**Why it happens:** Inconsistent `tsconfig` settings across packages.
**How to avoid:** Copy or extend the `tsconfig.json` from `pike-bridge` or `pike-lsp-server` to maintain consistency.

## Code Examples

### Shared Logger Migration
```typescript
// packages/core/src/logging.ts
export enum LogLevel { ... }
export class Logger {
  static globalLevel: LogLevel = LogLevel.WARN;
  // ... implementation
}
```

### Shared Error Migration
```typescript
// packages/core/src/errors.ts
export type ErrorLayer = 'server' | 'bridge' | 'pike';
export class LSPError extends Error { ... }
export class BridgeError extends LSPError { ... }
export class PikeError extends LSPError { ... }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Duplicated Code | Shared Core Package | 2026-01-21 | Reduced maintenance burden, consistent logging/errors |

## Open Questions

1. **Validation Utilities:** Should `validatePikeResponse` and type guards from `pike-lsp-server/src/utils/validation.ts` move to core?
   - **Recommendation:** Keep them in `pike-lsp-server` for now unless they are needed by `pike-bridge` (which currently they aren't, as bridge doesn't validate Pike's output beyond basic JSON parsing).
2. **Regex Patterns:** `regex-patterns.ts` are currently in `pike-lsp-server`.
   - **Recommendation:** Keep in server until needed elsewhere.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `packages/pike-bridge/src/logging.ts`, `packages/pike-lsp-server/src/core/logging.ts`
- Codebase analysis: `packages/pike-bridge/src/errors.ts`, `packages/pike-lsp-server/src/core/errors.ts`
- Workspace config: `pnpm-workspace.yaml`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Already established in monorepo
- Architecture: HIGH - Standard pnpm workspace pattern
- Pitfalls: HIGH - Common ESM/TS issues in this repo

**Research date:** 2026-01-21
**Valid until:** 2026-02-21
