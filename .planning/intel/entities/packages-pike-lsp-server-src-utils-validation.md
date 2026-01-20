---
path: /home/smuks/OpenCode/pike-lsp/packages/pike-lsp-server/src/utils/validation.ts
type: util
updated: 2025-01-20
status: active
---

# validation.ts

## Purpose

Provides runtime type guards for validating responses from the Pike subprocess (QUAL-003). Prevents crashes from malformed or unexpected JSON-RPC responses by checking structure before use.

## Exports

- `isPikePosition()` - Type guard for PikePosition
- `isPikeDiagnostic()` - Type guard for PikeDiagnostic
- `isPikeSymbol()` - Type guard for PikeSymbol
- `isPikeParseResult()` - Type guard for PikeParseResult
- `isTokenOccurrence()` - Type guard for TokenOccurrence
- `isFindOccurrencesResult()` - Type guard for FindOccurrencesResult
- `isBatchParseFileResult()` - Type guard for BatchParseFileResult
- `isBatchParseResult()` - Type guard for BatchParseResult
- `validatePikeResponse()` - Validates and throws with descriptive error if invalid
- `safeArray()` - Returns empty array if input is not valid array of expected type

## Dependencies

- [[packages-pike-bridge-src-types]] - All Pike types for type guard definitions

## Used By

TBD

## Notes

QUAL-003: Critical for runtime safety given untrusted input from external subprocess.
