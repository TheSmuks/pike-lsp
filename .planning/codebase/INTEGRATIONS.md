# External Integrations

**Analysis Date:** 2026-01-19

## APIs & External Services

**Language Server Protocol:**
- vscode-languageserver - LSP server implementation
  - SDK/Client: `vscode-languageserver/node.js` from `vscode-languageserver` package
  - Provides: createConnection, TextDocuments, LSP feature handlers
  - Location: `/home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/server.ts`

**VSCode Extension API:**
- vscode-languageclient - LSP client for VSCode
  - SDK/Client: `vscode-languageclient/node` from `vscode-languageclient` package
  - Auth: None (local extension)
  - Provides: LanguageClient, LanguageClientOptions for extension communication
  - Location: `/home/smuks/OpenCode/pike-lsp/packages/vscode-pike/src/extension.ts`

**GitHub Actions:**
- CI/CD pipeline for testing and releases
  - Service: GitHub Actions (`.github/workflows/test.yml`, `.github/workflows/release.yml`)
  - Actions used: actions/checkout@v4, pnpm/action-setup@v2, actions/setup-node@v4, softprops/action-gh-release@v1, actions/upload-artifact@v4
  - Triggers: Push to main/master, pull requests, version tags

## Data Storage

**Databases:**
- None (no external database)

**File Storage:**
- Local filesystem only
- Pike source files: `*.pike`, `*.pmod` extensions
- Workspace indexing: Scans project directories via `fs` module
- Stdlib indexing: Reads Pike installation at `/usr/local/pike/` or system path

**Caching:**
- In-memory caching only
- Document cache: `Map<string, DocumentCache>` in LSP server
- Type database: `TypeDatabase` class with 50MB memory limit
- Program cache: Pike-side `mapping(string:program)` with 30 program limit
- Stdlib cache: Pike-side `mapping(string:mapping)` with 50 module limit

## Authentication & Identity

**Auth Provider:**
- Custom (none required)
- Implementation: Local VSCode extension with no external auth

**Environment Variables:**
- `PIKE_MODULE_PATH` - Module search paths passed to Pike subprocess
- `PIKE_INCLUDE_PATH` - Include search paths passed to Pike subprocess
- `PIKE_SOURCE_ROOT` - Optional override for Pike stdlib source location
- `PIKE_STDLIB` - Optional override for stdlib modules path
- `PIKE_TOOLS` - Optional override for Pike tools/include path

## Monitoring & Observability

**Error Tracking:**
- None (no external error tracking service)

**Logs:**
- Console-based logging only
- LSP server logs to `connection.console.log()`
- Extension logs to VSCode Output panel ("Pike Language Server" channel)
- Pike bridge stderr forwarding to VSCode client
- Debug mode: `pike.trace.server` VSCode setting for LSP communication tracing

## CI/CD & Deployment

**Hosting:**
- GitHub (source repository: https://github.com/pike-lsp/pike-lsp)
- VSCode Marketplace (extension distribution)

**CI Pipeline:**
- GitHub Actions
- Test workflow: `.github/workflows/test.yml`
  - Runs on: push to main/master, pull requests
  - Platform: ubuntu-24.04
  - Steps: Install Pike, build, test bridge, test server, integration tests
- Release workflow: `.github/workflows/release.yml`
  - Runs on: version tags (v*)
  - Creates: GitHub releases with VSIX artifacts

## Environment Configuration

**Required env vars:**
- None strictly required (has sensible defaults)
- `PIKE_MODULE_PATH` - Optional module path override
- `PIKE_INCLUDE_PATH` - Optional include path override

**Secrets location:**
- No secrets required for local development
- GitHub Actions uses `GITHUB_TOKEN` (provided automatically)

**VSCode Configuration:**
- `pike.pikePath` - Path to Pike executable (default: "pike")
- `pike.pikeModulePath` - Array of module paths
- `pike.pikeIncludePath` - Array of include paths
- `pike.trace.server` - LSP trace level

## Webhooks & Callbacks

**Incoming:**
- None (server does not expose HTTP endpoints)

**Outgoing:**
- None (no external HTTP calls)

## System Integration

**Pike Interpreter Integration:**
- Spawns Pike subprocess via Node.js `child_process.spawn()`
- Communication: JSON-RPC over stdin/stdout
- Script location: `pike-scripts/analyzer.pike` (auto-detected)
- Health check: `pike --version` command for availability verification
- Methods: parse, tokenize, compile, resolve, introspect, resolve_stdlib, get_inherited, find_occurrences, batch_parse, set_debug, analyze_uninitialized, get_completion_context

**VSCode Language Client Integration:**
- Activation: `onLanguage:pike` event
- Document sync: `workspace.createFileSystemWatcher('**/*.{pike,pmod}')`
- Configuration change handling: `workspace.onDidChangeConfiguration()`
- Commands registered: `pike-module-path.add`, `pike.showReferences`

---

*Integration audit: 2026-01-19*
