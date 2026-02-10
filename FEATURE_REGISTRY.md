# Feature Registry
Last updated: 2026-02-10

Format: Feature Name (LSP method), Status, Last examined, Health score (0-100), Known issues, Notes

## Core LSP

| Feature | LSP Method | Status | Last Examined | Health | Known Issues | Notes |
|---------|------------|--------|---------------|--------|--------------|-------|
| Initialize | `initialize` | ✅ Implemented | 2026-02-10 | 95 | None | Server initialization with capabilities negotiation |
| Initialized | `initialized` | ✅ Implemented | 2026-02-10 | 95 | None | Post-initialization notification |
| Shutdown | `shutdown` | ✅ Implemented | 2026-02-10 | 95 | None | Graceful shutdown |
| Exit | `exit` | ✅ Implemented | 2026-02-10 | 95 | None | Cleanup and exit |
| DidOpen | `textDocument/didOpen` | ✅ Implemented | 2026-02-10 | 95 | None | Document open notification |
| DidChange | `textDocument/didChange` | ✅ Implemented | 2026-02-10 | 95 | None | Incremental document sync |
| DidClose | `textDocument/didClose` | ✅ Implemented | 2026-02-10 | 95 | None | Document close notification |
| DidSave | `textDocument/didSave` | ✅ Implemented | 2026-02-10 | 95 | None | Document save notification |

## Navigation

| Feature | LSP Method | Status | Last Examined | Health | Known Issues | Notes |
|---------|------------|--------|---------------|--------|--------------|-------|
| Go to Definition | `textDocument/definition` | ✅ Implemented | 2026-02-10 | 85 | Limited inherit chain navigation | Supports functions, classes, variables, inherit statements. Recent improvements for import navigation |
| Go to Declaration | `textDocument/declaration` | ✅ Implemented | 2026-02-10 | 75 | Returns same as definition | Pike doesn't have separate declaration concept - mirrors definition |
| Go to Type Definition | `textDocument/typeDefinition` | ✅ Implemented | 2026-02-10 | 70 | Basic type inference only | Navigate to class/typedef definitions |
| Go to Implementation | `textDocument/implementation` | ✅ Implemented | 2026-02-10 | 70 | Limited inherit resolution | Find class implementations |
| Find References | `textDocument/references` | ✅ Implemented | 2026-02-10 | 85 | Multi-document search working | Recently improved with comprehensive symbol usage tracking |
| Document Highlight | `textDocument/documentHighlight` | ✅ Implemented | 2026-02-10 | 80 | Highlights same symbol occurrences | Basic highlight support |

## Intelligence

| Feature | LSP Method | Status | Last Examined | Health | Known Issues | Notes |
|---------|------------|--------|---------------|--------|--------------|-------|
| Completion | `textDocument/completion` | ✅ Implemented | 2026-02-10 | 85 | Incomplete type-aware completions | Keywords, builtins, module members, symbols. Recent improvements for Roxen/RXML |
| Completion Resolve | `completionItem/resolve` | ✅ Implemented | 2026-02-10 | 75 | Documentation not always available | Lazy resolve for additional info |
| Hover | `textDocument/hover` | ✅ Implemented | 2026-02-10 | 85 | Autodoc parsing incomplete | Type info, doc comments, Roxen module docs. Uses hover-builder |
| Signature Help | `textDocument/signatureHelp` | ✅ Implemented | 2026-02-10 | 75 | Limited varargs support | Function signatures with parameter hints |

## Symbols

| Feature | LSP Method | Status | Last Examined | Health | Known Issues | Notes |
|---------|------------|--------|---------------|--------|--------------|-------|
| Document Symbols | `textDocument/documentSymbol` | ✅ Implemented | 2026-02-10 | 90 | Nested class extraction incomplete | Classes, functions, variables, inherits. Roxen module awareness |
| Workspace Symbols | `workspace/symbol` | ✅ Implemented | 2026-02-10 | 85 | Performance on large projects | Project-wide symbol search with prefix matching |

## Diagnostics

| Feature | LSP Method | Status | Last Examined | Health | Known Issues | Notes |
|---------|------------|--------|---------------|--------|--------------|-------|
| Publish Diagnostics | `textDocument/publishDiagnostics` | ✅ Implemented | 2026-02-10 | 80 | Syntax errors only, no type checking | Pike syntax errors, undefined references, Roxen module config errors |
| RXML Validation | - | ✅ Implemented | 2026-02-10 | 70 | Unknown tags, missing attributes | Validates RXML templates in Roxen context |
| Roxen Diagnostics | - | ✅ Implemented | 2026-02-10 | 75 | Missing callback detection | Roxen module-specific diagnostics |

## Refactoring

| Feature | LSP Method | Status | Last Examined | Health | Known Issues | Notes |
|---------|------------|--------|---------------|--------|--------------|-------|
| Code Actions | `textDocument/codeAction` | ✅ Implemented | 2026-02-10 | 70 | Quick fixes limited | Basic quick fixes for common Pike issues |
| Prepare Rename | `textDocument/prepareRename` | ✅ Implemented | 2026-02-10 | 75 | Validation incomplete | Validates rename before operation |
| Rename | `textDocument/rename` | ✅ Implemented | 2026-02-10 | 70 | Limited cross-file renaming | Rename symbols across files |
| Formatting | `textDocument/formatting` | ✅ Implemented | 2026-02-10 | 60 | Basic formatting only | Whole document formatting |
| Range Formatting | `textDocument/rangeFormatting` | ✅ Implemented | 2026-02-10 | 60 | Basic formatting only | Selection-based formatting |

## Advanced Features

| Feature | LSP Method | Status | Last Examined | Health | Known Issues | Notes |
|---------|------------|--------|---------------|--------|--------------|-------|
| Folding Range | `textDocument/foldingRange` | ✅ Implemented | 2026-02-10 | 75 | Limited region detection | Code folding regions |
| Semantic Tokens | `textDocument/semanticTokens` | ✅ Implemented | 2026-02-10 | 70 | Basic token classification | Rich syntax highlighting |
| Inlay Hints | `textDocument/inlayHint` | ✅ Implemented | 2026-02-10 | 65 | Parameter hints only | Type hints and parameter names |
| Selection Ranges | `textDocument/selectionRange` | ✅ Implemented | 2026-02-10 | 70 | Basic smart selection | Smart selection expansion |
| Document Links | `textDocument/documentLinks` | ✅ Implemented | 2026-02-10 | 70 | File path detection | Clickable file paths and URLs |
| Code Lens | `textDocument/codeLens` | ✅ Implemented | 2026-02-10 | 80 | Reference counts | Reference counts and quick actions. Recent peek view improvements |
| Linked Editing | `textDocument/linkedEditingRange` | ✅ Implemented | 2026-02-10 | 70 | Limited symbol support | Simultaneous editing of linked symbols |

## Hierarchy

| Feature | LSP Method | Status | Last Examined | Health | Known Issues | Notes |
|---------|------------|--------|---------------|--------|--------------|-------|
| Call Hierarchy | `callHierarchy/prepare` | ✅ Implemented | 2026-02-10 | 65 | Incoming/outgoing calls | Who calls this / what does this call |
| Type Hierarchy | `typeHierarchy/prepare` | ✅ Implemented | 2026-02-10 | 60 | Supertypes/subtypes | Type hierarchy navigation |

## Roxen-Specific

| Feature | Status | Last Examined | Health | Known Issues | Notes |
|---------|--------|---------------|--------|--------------|-------|
| Roxen Module Detection | ✅ Implemented | 2026-02-10 | 85 | 3-layer detection | Fast scan, cache, Pike confirmation |
| Roxen Symbol Enhancement | ✅ Implemented | 2026-02-10 | 80 | defvar, lifecycle callbacks | Enhances symbols with Roxen-specific info |
| Roxen Completion | ✅ Implemented | 2026-02-10 | 80 | MODULE_*, TYPE_*, RequestID | Roxen API completions |
| Roxen Diagnostics | ✅ Implemented | 2026-02-10 | 75 | Missing callbacks | Roxen module validation |
| RXML Tag Completion | ✅ Implemented | 2026-02-10 | 75 | Tag catalog integration | RXML tag and attribute completion |
| RXML Tag Navigation | ✅ Implemented | 2026-02-10 | 70 | Tag to definition | Navigate to RXML tag definitions |
| RXML Diagnostics | ✅ Implemented | 2026-02-10 | 70 | Unknown tag detection | Validate RXML templates |
| Roxen Configuration | ✅ Implemented | 2026-02-10 | 75 | Config file support | Roxen configuration file parsing |

## Pike-Specific Deep Features

| Feature | Status | Last Examined | Health | Known Issues | Notes |
|---------|--------|---------------|--------|--------------|-------|
| Pike Version Detection | ✅ Implemented | 2026-02-10 | 90 | Runtime discovery only | Queries Pike binary for version |
| Module Resolution | ✅ Implemented | 2026-02-10 | 85 | `.pmod` support | Pike module path resolution |
| Inherit Chain Resolution | ✅ Implemented | 2026-02-10 | 75 | Multi-level inherit | Tracks inherit relationships |
| Autodoc Parsing | ✅ Implemented | 2026-02-10 | 70 | `//!` comment parsing | Extracts Pike autodoc comments |
| Preprocessor Symbol Extraction | ✅ Implemented | 2026-02-10 | 75 | `#define` detection | Preprocessor symbol tracking |
| Pike Type Inference | ✅ Implemented | 2026-02-10 | 70 | Basic type tracking | String, mapping, array types |
| Stdlib Indexing | ✅ Implemented | 2026-02-10 | 85 | LRU caching | Pike standard library symbol index |
| Nested Class Support | ✅ Implemented | 2026-02-10 | 70 | Extraction incomplete | Nested class within class |

## Test Coverage Status

| Category | Total Tests | Placeholder Tests | Coverage |
|----------|-------------|-------------------|----------|
| Core LSP | 15 | 0 | 100% |
| Navigation | 45 | 8 | 82% |
| Intelligence | 62 | 12 | 81% |
| Symbols | 18 | 3 | 83% |
| Diagnostics | 44 | 30 | 32% |
| Refactoring | 52 | 28 | 46% |
| Advanced | 58 | 25 | 57% |
| Hierarchy | 114 | 114 | 0% |
| Roxen-Specific | 25 | 5 | 80% |
| RXML-Specific | 38 | 8 | 79% |
| Pike-Specific | 42 | 15 | 64% |
| **TOTAL** | **513** | **248** | **52%** |

## Priority Areas for Improvement

### Critical (Health < 70)
1. **Type Hierarchy** (60) - Supertype/subtype navigation barely works
2. **Formatting** (60) - Basic formatting, no style config
3. **Inlay Hints** (65) - Only parameter hints, no type hints
4. **Call Hierarchy** (65) - Limited call graph analysis
5. **Diagnostics** (80) - No type checking, syntax only

### High Impact (Many Users)
1. **Completion** (85) - Type-aware completions needed
2. **Hover** (85) - Autodoc parsing incomplete
3. **Rename** (70) - Cross-file renaming unreliable
4. **Code Actions** (70) - Very limited quick fixes

### Test Debt (Placeholders)
1. **Type Hierarchy Provider** (59 placeholders) - No E2E validation
2. **Call Hierarchy Provider** (55 placeholders) - No E2E validation
3. **Diagnostics Provider** (44 placeholders) - Critical but untested
4. **Formatting Provider** (38 placeholders) - No validation

## Notes

- **Health Score Calculation**: Based on test coverage, known issues, and feature completeness
- **Status Legend**: ✅ Implemented | 🚧 Partial | ❌ Not Implemented
- **Last Examined**: Most recent date the feature was audited by an agent
- **Test Coverage**: Percentage of non-placeholder tests

## Recent Improvements (2026-02-01 to 2026-02-10)

- ✅ Go to Definition: Improved import navigation support
- ✅ Find References: Enhanced multi-document search
- ✅ Hover: Better autodoc integration with hover-builder
- ✅ Code Lens: Added peek view and CTRL+CLICK navigation
- ✅ Completion: Roxen/RXML tag completion improvements
- ✅ Document Symbols: Nested class and preprocessor symbol extraction
- ✅ Roxen Support: Production-ready Roxen framework integration

## Next Sprint Recommendations

1. **Convert placeholder tests** in Type/Call Hierarchy (114 tests)
2. **Improve type checking** in Diagnostics (add semantic analysis)
3. **Enhance Rename** with reliable cross-file symbol tracking
4. **Add Code Actions** for common Pike refactoring patterns
5. **Implement formatting** configuration (Pike style guide)
