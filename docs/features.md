---
id: features
title: Features
description: Complete list of LSP features provided by Pike LSP
---

# Features

## Core Language Features

| Feature | Description |
|---------|-------------|
| **Syntax Highlighting** | Full semantic token-based highlighting |
| **Code Completion** | Intelligent autocomplete with snippets |
| **Go to Definition** | Navigate to symbol definitions (F12) |
| **Find References** | Find all usages of a symbol |
| **Hover Information** | Type info, documentation, deprecation warnings |
| **Diagnostics** | Real-time syntax error detection |
| **Signature Help** | Parameter hints while typing |

## Advanced Features

| Feature | Description |
|---------|-------------|
| **Rename Symbol** | Safely rename across files (F2) |
| **Call Hierarchy** | View incoming/outgoing calls |
| **Type Hierarchy** | Explore class inheritance |
| **Code Lens** | Reference counts above functions |
| **Document Links** | Clickable paths in comments |
| **Inlay Hints** | Parameter name hints |
| **Workspace Symbols** | Search symbols project-wide |
| **Code Actions** | Quick fixes and organize imports |
| **Formatting** | Document and range formatting |
| **Smart Completion** | Scope operator (`::`, `->`) completion with deprecated tag support |
| **Linked Editing** | Multi-cursor editing for linked ranges |
| **Rate Limiting** | Configurable rate limiter for LSP requests |
| **AutoDoc Rendering** | Full AutoDoc tag support (@returns, @mapping, @member) |
| **Nested Classes** | Recursive extraction up to depth 5 with full symbol resolution |
| **Preprocessor Extraction** | Token-based symbol extraction from conditional blocks |

## Performance

- Parses 1000+ line files in ~15ms
- Batch parsing for fast workspace indexing
- Smart caching for stdlib modules
- 100% Pike 8 stdlib compatibility
- Modular architecture (TypeScript + Pike 8.1116)
- Runtime path discovery for cross-installation compatibility
- Hash-based cache eviction (7.2% faster on cache-intensive workloads)

:::info
View live benchmarks: [thesmuks.github.io/pike-lsp](https://thesmuks.github.io/pike-lsp)
:::

## Known Limitations

| Limitation | Description | Impact |
|------------|-------------|--------|
| **Preprocessor Directives** | Symbols inside `#if`/`#else`/`#endif` blocks are now indexed using token-based extraction. | Conditional symbols are now visible in outline, completion, and hover. |
| **Nested Classes** | Nested class declarations are recursively extracted up to depth 5. | Go-to-definition, hover, and completion work for nested class members at all levels. |
| **Type Inference** | Basic types from literals and signatures work. | Complex flow-sensitive analysis is not implemented. |
| **Dynamic Modules** | Runtime-loaded modules cannot be analyzed. | Completion won't show symbols from dynamically loaded code. |
| **Deep Nesting** | Nested classes deeper than 5 levels are capped for performance. | Very deep nesting (>5 levels) may have limited symbol extraction. |
