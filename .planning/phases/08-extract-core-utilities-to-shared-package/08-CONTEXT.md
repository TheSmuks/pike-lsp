# Phase 8: Extract Core Utilities to Shared Package - Context

**Gathered:** 2026-01-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate code duplication by extracting Logger and Error classes to a shared `@pike-lsp/core` package. Currently, these ~400 lines are duplicated between `pike-lsp-server` and `pike-bridge` to avoid circular dependencies.

</domain>

<decisions>
## Implementation Decisions

### Package Interface
- **Public API**: Hybrid approach. Primary entry point via barrel file (`import { Logger } from '@pike-lsp/core'`). Subpaths supported for optimization (`@pike-lsp/core/logging`).
- **Export Style**: Named exports enforced by default (`export class Logger`). Default exports allowed only for single-purpose modules where file name matches export.
- **Module Format**: ESM (ECMAScript Modules) target.
- **Naming**: Domain-clean names (`Logger`, `LSPError`). No package prefixes (e.g., avoid `PikeLogger`). Consumers use import aliases if collisions occur.

### Testing Strategy
- **Location**: Hybrid. Unit tests colocated with source (`src/logging/logger.test.ts`). Integration/Contract tests in `test/integration/`.
- **CI Pipeline**: Phased. Core tests (unit -> integration -> package) must pass before consumer integration tests (server/bridge) run.
- **Contract Verification**: Automated snapshot testing for exports and type testing for public interfaces.
- **Migration**: Staged rollout. Canary releases for CI validation -> Local verification -> Production release.

### Refactoring Scope
- **Extraction Scope**: Strict initially (Logger and LSPError only). Future expansion requires usage in 3+ packages and team approval.
- **Cleanup**: Deprecate-Then-Delete. Mark old files as `@deprecated` with redirection for one sprint cycle before deletion.
- **Domain Layering**: Core is pure infrastructure (Generic `LSPError`). Pike-specific domain logic (`PikeErrorCode`) belongs in a separate `@pike-lsp/common` layer (or remains in bridge/server if specific).
- **Dependencies**: Near-zero runtime dependencies policy. `vscode-languageserver-types` allowed as optional peer dependency.

### Claude's Discretion
- Exact `package.json` configuration for exports map.
- Specific devDependencies versions (TypeScript, Vitest, etc.).
- Internal directory structure for the core package (beyond the public interface decisions).

</decisions>

<specifics>
## Specific Ideas

- "Searchability is a tooling problem, not a naming problem" - keep names simple.
- "Green main, not green commits" philosophy applies to the CI pipeline structure too.

</specifics>

<deferred>
## Deferred Ideas

- Extraction of `type guards` or other utilities - deferred until 3+ package usage is demonstrated.
- Creation of `@pike-lsp/common` for Pike domain logic - deferred/separate from this core infrastructure phase.

</deferred>

---

*Phase: 08-extract-core-utilities-to-shared-package*
*Context gathered: 2026-01-21*
