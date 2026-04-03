# ADR-001: Monorepo Structure

## Status

Accepted

## Context

The Pike LSP project consists of multiple components that need to be developed and released together:

- Core types and utilities
- Pike subprocess bridge
- LSP protocol server
- VS Code extension

We needed to decide between:

1. **Separate repositories** - Clean separation but coordination overhead
2. **Single repository (monorepo)** - Unified versioning but complexity
3. **Monorepo with workspace packages** - Best of both worlds

## Decision

We chose a monorepo with Bun workspaces, organized as:

```
packages/
  @pike-lsp/core/           - Shared types and utilities
  @pike-lsp/pike-bridge/    - Pike subprocess management
  @pike-lsp/pike-lsp-server/ - LSP protocol implementation
  vscode-pike/              - VS Code extension
```

## Consequences

### Positive

- Unified versioning across all components
- Atomic commits that span package boundaries
- Easy cross-package refactoring
- Single CI pipeline
- Shared tooling (linting, formatting, testing)

### Negative

- Larger repository size
- More complex build order dependencies
- Requires workspace-aware tooling
- Risk of tight coupling between packages

## Mitigations

- Strict package boundaries enforced by `scripts/quality-gate.sh`
- Clear dependency graph (core → bridge → server → extension)
- No cycles allowed
- Build order documented and enforced

## Related

- `docs/architecture.md` - Full architecture documentation
- `scripts/quality-gate.sh` - Enforces package boundaries
