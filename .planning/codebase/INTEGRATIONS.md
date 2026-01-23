# External Integrations

**Analysis Date:** 2026-01-23

## APIs & External Services

**Version Control:**
- GitHub - Repository hosting, releases, issue tracking
  - Actions: `.github/workflows/test.yml`, `.github/workflows/release.yml`, `.github/workflows/bench.yml`, `.github/workflows/security.yml`
  - Auth: GITHUB_TOKEN (automatically provided by Actions)

**Package Registry:**
- npm registry - pnpm dependency installation
  - No auth required for public packages
  - Workspace protocol used for internal packages

**Benchmarking:**
- benchmark-action/github-action-benchmark@v1 - Performance tracking
  - Stores historical data on gh-pages branch
  - Auto-pushes benchmark results
  - Alerts on performance regression (>120% threshold)

## Data Storage

**Databases:**
- None (Local filesystem only)

**File Storage:**
- Local filesystem - Pike module path, source files
  - Configuration: `pike.pikeModulePath` (VSCode setting)
  - Configuration: `pike.pikeIncludePath` (VSCode setting)

**Caching:**
- In-memory LRU caches - TypeScript side
- In-memory singleton caches - Pike side (`LSP.Cache.pmod`)
- No external cache services

## Authentication & Identity

**Auth Provider:**
- None (Local development tool)

**Implementation:**
- No authentication required
- VSCode extension runs with user permissions
- Pike subprocess inherits user environment

## Monitoring & Observability

**Error Tracking:**
- None (no external error tracking service)

**Logs:**
- Console output - VSCode output channel
- Connection.console - LSP server logging
- Debug mode via `pike.trace.server` VSCode setting

**Performance Monitoring:**
- Benchmark CI workflow - Tracks parse time, cache hit rate
- Mitata benchmark framework - Local benchmarking
- GitHub Actions benchmark history - Performance trends

## CI/CD & Deployment

**Hosting:**
- GitHub - Source code, releases, issues
- VSCode Marketplace - Extension distribution (via `vsce package`)

**CI Pipeline:**
- GitHub Actions (ubuntu-24.04, ubuntu-latest)
  - Test workflow: `.github/workflows/test.yml` - Push to main/master, PRs
  - Release workflow: `.github/workflows/release.yml` - Tag push (`v*`)
  - Benchmark workflow: `.github/workflows/bench.yml` - Push to main, PRs
  - Security workflow: `.github/workflows/security.yml` - Push, PRs, weekly schedule

**Testing Matrix:**
- Node.js 20.x
- Pike 8.0 (baseline), Pike 8.1116 (target), Pike latest (allow-fail)

**Build Artifacts:**
- VSIX files uploaded as GitHub Releases
- VSIX artifacts retained 30-90 days
- Benchmark data stored on gh-pages branch

## Environment Configuration

**Required env vars:**
- `PIKE_LSP_TEST_MODE` - Extension test mode (optional, set to "true")
- `PIKE_SOURCE_ROOT` - Pike source location for tests (optional, defaults to `/usr/local/pike/8.0.1116`)
- `MITATA_JSON` - Benchmark output format (optional)
- `PATH` - Must include `pike` executable

**Secrets location:**
- GitHub Secrets for CI (GITHUB_TOKEN auto-provided)
- No local secrets required

## Webhooks & Callbacks

**Incoming:**
- None (LSP server receives requests from VSCode via stdio)

**Outgoing:**
- None (No external API calls)

## LSP Protocol Integration

**Protocol:**
- JSON-RPC over stdio
- Server: `packages/pike-lsp-server/src/server.ts`
- Client: `packages/vscode-pike/src/extension.ts`

**LSP Capabilities Provided:**
- Document symbols
- Hover information
- Go-to-definition
- Find references
- Code completion
- Diagnostics (syntax errors)
- Signature help
- Semantic tokens
- Call hierarchy
- Workspace symbols

## Pike Bridge Integration

**Communication:**
- JSON-RPC over stdin/stdout
- TypeScript side: `packages/pike-bridge/src/bridge.ts`
- Pike side: `pike-scripts/analyzer.pike`

**Methods exposed:**
- `parse` - Tokenization and parsing
- `introspect` - Type introspection
- `resolve` - Symbol resolution
- `resolve_stdlib` - Stdlib module resolution
- `get_inherited` - Inheritance information
- `find_occurrences` - Find symbol references
- `analyze_uninitialized` - Uninitialized variable detection
- `get_completion_context` - Code completion context

---

*Integration audit: 2026-01-23*
