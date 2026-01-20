---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-bridge/src/types.ts
type: model
updated: 2025-01-20
status: active
---

# types.ts

## Purpose

Defines the complete TypeScript type system for Pike-LSP communication, matching Pike's output from Tools.AutoDoc.PikeParser and Tools.AutoDoc.PikeObjects. Enables type-safe IPC between TypeScript and Pike subprocess.

## Exports

- `PikeSymbol` - Base symbol interface with name, kind, modifiers, position, type, and children
- `PikeType` - Discriminated union for all Pike types (int, float, string, array, mapping, function, object, etc.)
- `PikePosition` - Source position with file, line, and optional column
- `PikeParseResult` - Result of parsing with symbols and diagnostics arrays
- `PikeDiagnostic` - Error/warning diagnostic with severity and position
- `IntrospectedSymbol` - Runtime type information from compiled Pike code
- `IntrospectionResult` - Complete introspection output with symbols categorized by kind
- `StdlibResolveResult` - Standard library module resolution with symbols and inheritance
- `BatchParseResult` - PERF-002: Batch parsing result for multiple files
- `FindOccurrencesResult` - PERF-001: Token occurrence positions for references
- `CompletionContext` - Completion context from Pike's tokenizer
- `PikeRequest` - JSON-RPC request to Pike subprocess
- `PikeResponse` - JSON-RPC response from Pike subprocess

## Dependencies

None - pure type definitions

## Used By

TBD
