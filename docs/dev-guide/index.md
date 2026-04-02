---
id: dev-guide
title: Development Guide
description: Auto-generated development guide for Pike LSP
slug: /docs/dev-guide
---

# Development Guide

This guide provides documentation for developers working on Pike LSP.

## API Documentation

For detailed API reference, see:

- **[TypeScript API Docs](/api/typescript/)** - Auto-generated from source code using TypeDoc
- **[Pike API Docs](/api/pike/)** - Auto-generated from Pike source code

## Architecture

See the [Architecture](/docs/architecture) document for detailed information about the system design.

## Contributing

See the [Contributing Guide](/docs/contributing) for information on how to contribute to the project.

## Project Structure

```
pike-lsp/
├── packages/
│   ├── pike-bridge/         # TypeScript ↔ Pike IPC layer
│   ├── pike-lsp-server/     # LSP server implementation
│   └── vscode-pike/          # VS Code extension
├── pike-scripts/
│   ├── analyzer.pike        # Pike parsing entry point
│   └── LSP.pmod/            # Pike modular analyzer logic
└── docs/                     # Documentation
```

## Key Technologies

- **TypeScript** - LSP server implementation
- **Pike** - Parser and analyzer modules
- **JSON-RPC** - Communication protocol between TypeScript and Pike
- **LSP** - Language Server Protocol for editor integration
