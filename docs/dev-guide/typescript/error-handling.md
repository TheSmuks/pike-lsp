---
id: ts-error-handling
title: TypeScript Error Handling Pattern
description: Approved catch/throw patterns for pike-lsp-server TypeScript handlers and services
---

# TypeScript Error Handling Pattern

`pike-lsp-server/src` must not use bare catches (`catch { ... }`) or empty catches.

Use one of the two approved patterns below:

## 1) Request boundary errors: log + throw `ResponseError`

Use this when the request should fail and the client should receive an LSP error.

```ts
import { ErrorCodes, ResponseError } from 'vscode-languageserver/node.js';

try {
  // request handling
} catch (error) {
  logger.error('Formatting request failed', {
    uri,
    error: error instanceof Error ? error.message : String(error),
  });

  throw new ResponseError(
    ErrorCodes.InternalError,
    `Formatting failed: ${error instanceof Error ? error.message : String(error)}`
  );
}
```

## 2) Recoverable paths: log + explicit fallback

Use this when fallback behavior is intentional and behavior-compatible (e.g. best-effort cache read, optional index query).

```ts
try {
  return await optionalOperation();
} catch (error) {
  logger.debug('Optional operation failed, using fallback', {
    error: error instanceof Error ? error.message : String(error),
  });
  return fallbackValue;
}
```

## Rules

- Never swallow errors silently.
- Never use `catch { ... }`.
- If you choose fallback behavior, log at least `debug` with enough context (URI/path/request id).
- If the failure should propagate to the client, throw `ResponseError` at the request boundary.
