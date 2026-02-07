# ADR-004: 5 Package.json Version Sync Protocol

**Status:** active
**Area:** monorepo
**Date:** 2025-12-01

## Context

The monorepo has 5 package.json files (root, core, pike-bridge, pike-lsp-server, vscode-pike). Version drift causes confusing releases and broken cross-references.

## Decision

All 5 package.json files MUST have identical versions. The root `package.json` is the source of truth. Run `scripts/sync-versions.sh` after any version bump.

## Alternatives Rejected

- **Independent versioning** - Confusing for users. Which version is "the" version?
- **Lerna/changesets** - Overhead for a small monorepo. Our sync script is 10 lines.
- **Single package.json** - Would lose workspace isolation and per-package builds.

## Consequences

- One version number represents the entire project
- `sync-versions.sh` must be run after bumping root version
- Release skill enforces this automatically
- CI validates version match between tag and package.json

## Challenge Conditions

Revisit if:
- Packages need independent release cycles (e.g., core used by other projects)
- Monorepo grows beyond 5 packages
