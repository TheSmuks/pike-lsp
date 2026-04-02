---
id: features
title: Features
description: Complete list of LSP features provided by Pike LSP
---

# Features

Pike LSP provides a comprehensive set of Language Server Protocol features for Pike development.

## Core Language Features

| Feature                 | Description                                    | Status       |
| ----------------------- | ---------------------------------------------- | ------------ |
| **Syntax Highlighting** | Full semantic token-based highlighting         | ✅ Available |
| **Code Completion**     | Intelligent autocomplete with snippets         | ✅ Available |
| **Go to Definition**    | Navigate to symbol definitions (F12)           | ✅ Available |
| **Find References**     | Find all usages of a symbol (Shift+F12)        | ✅ Available |
| **Hover Information**   | Type info, documentation, deprecation warnings | ✅ Available |
| **Diagnostics**         | Real-time syntax error detection               | ✅ Available |
| **Signature Help**      | Parameter hints while typing                   | ✅ Available |

## Advanced Features

| Feature               | Description                                | Status       |
| --------------------- | ------------------------------------------ | ------------ |
| **Rename Symbol**     | Safely rename across files (F2)            | ✅ Available |
| **Call Hierarchy**    | View incoming/outgoing calls               | ✅ Available |
| **Type Hierarchy**    | Explore class inheritance                  | ✅ Available |
| **Code Lens**         | Reference counts above functions           | ✅ Available |
| **Document Links**    | Clickable paths in comments                | ✅ Available |
| **Workspace Symbols** | Search symbols project-wide (Ctrl+T)       | ✅ Available |
| **Code Actions**      | Quick fixes and organize imports           | ✅ Available |
| **Formatting**        | Document and range formatting              | ✅ Available |
| **Folding Ranges**    | Smart code folding                         | ✅ Available |
| **Selection Ranges**  | Smart selection expansion                  | ✅ Available |
| **Semantic Tokens**   | Advanced syntax highlighting               | ✅ Available |
| **Inlay Hints**       | Parameter name hints inline                | ✅ Available |
| **Document Symbols**  | Navigate document structure (Ctrl+Shift+O) | ✅ Available |
| **Linked Editing**    | Multi-cursor editing for linked ranges     | ✅ Available |

## Pike-Specific Features

| Feature                       | Description                                                        | Status       |
| ----------------------------- | ------------------------------------------------------------------ | ------------ |
| **Smart Completion**          | Scope operator (`::`, `->`) completion with deprecated tag support | ✅ Available |
| **AutoDoc Rendering**         | Full AutoDoc tag support (@returns, @mapping, @member)             | ✅ Available |
| **Nested Classes**            | Recursive extraction up to depth 5 with full symbol resolution     | ✅ Available |
| **Preprocessor Extraction**   | Token-based symbol extraction from conditional blocks              | ✅ Available |
| **Stdlib Resolution**         | Smart caching for Pike 8 stdlib modules                            | ✅ Available |
| **Module Resolution**         | Automatic module path discovery                                    | ✅ Available |
| **Import/Inherit Resolution** | Navigate to imported/inherited modules                             | ✅ Available |

## Roxen Framework Support

| Feature                  | Description                                      | Status       |
| ------------------------ | ------------------------------------------------ | ------------ |
| **Module Detection**     | Automatic detection of Roxen modules via markers | ✅ Available |
| **RXML Tag Completion**  | Tag and attribute completion for RXML templates  | ✅ Available |
| **Defvar Extraction**    | Variable extraction and symbol grouping          | ✅ Available |
| **Lifecycle Callbacks**  | Detection and validation of module callbacks     | ✅ Available |
| **Constant Completions** | MODULE*\*, TYPE*_, VAR\__ constant completions   | ✅ Available |
| **RequestID Members**    | Properties and methods completion for RequestID  | ✅ Available |
| **Roxen Diagnostics**    | Validation of Roxen module structure             | ✅ Available |

## Keyboard Shortcuts

| Action               | Shortcut           |
| -------------------- | ------------------ |
| Go to Definition     | `F12`              |
| Find References      | `Shift+F12`        |
| Rename Symbol        | `F2`               |
| Trigger Completion   | `Ctrl+Space`       |
| Signature Help       | `Ctrl+Shift+Space` |
| Go to Symbol         | `Ctrl+Shift+O`     |
| Workspace Symbol     | `Ctrl+T`           |
| Show Hover           | `Ctrl+K Ctrl+I`    |
| Trigger Code Actions | `Ctrl+.`           |
| Format Document      | `Shift+Alt+F`      |

## Performance

Pike LSP is designed for performance:

- Parses 1000+ line files in ~15ms
- Batch parsing for fast workspace indexing
- Smart caching for stdlib modules
- Request deduplication for concurrent operations
- Lazy loading of modules

## Supported File Types

- `.pike` - Pike source files
- `.pmod` - Pike module files
- `.inc` - Pike include files (via file association)
- `.pike` files within Roxen modules
- `.rjs` - Roxen JavaScript files (via file association)

## Known Limitations

### Analysis Limitations

| Limitation                  | Description                                                         |
| --------------------------- | ------------------------------------------------------------------- |
| **Preprocessor Directives** | Token-based extraction for symbols in `#if`/`#else`/`#endif` blocks |
| **Nested Classes**          | Recursive extraction up to depth 5 (configurable)                   |
| **Type Inference**          | Basic types from literals and function signatures                   |
| **Dynamic Modules**         | Runtime-loaded modules cannot be statically analyzed                |

:::info Live Benchmarks
View performance benchmarks at [thesmuks.github.io/pike-lsp](https://thesmuks.github.io/pike-lsp)
:::
