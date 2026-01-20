---
created: 2026-01-20T14:05
title: Fix Pike LSP server timeout on stdlib module loading
area: general
files:
  - pike-scripts/LSP.pmod/Parser.pike
  - pike-scripts/LSP.pmod/module.pmod
  - packages/vscode-pike/server/server.js
---

## Problem

The VSCode Pike LSP extension crashes when trying to load stdlib modules. Error occurs during bridge.introspect calls:

```
Failed to load stdlib module Stdio: Error: Request 1 timed out after 30000ms
```

The server process exits with code 1 and restarts, but all LSP features become non-functional. Key observations:
- Introspection is called multiple times on the same files (Parser.pike, module.pmod)
- `[DOC_LINKS] Found 0 links` - no document links being found
- Timeout is 30 seconds, suggesting the Pike process is hanging
- The extension was recently packaged with updated Analysis.pike via bundle-server.sh

## Solution

TBD - investigate:
1. Whether introspect requests are hanging in Pike code
2. If the updated LSP.pmod modules are causing issues
3. Whether the 30-second timeout is configurable
4. If there's a deadlock in the stdlib resolution code
