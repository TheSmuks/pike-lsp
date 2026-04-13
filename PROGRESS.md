# Token-Based Pike Source Analysis — Progress Tracker

ADR-001: All Pike source parsing uses `bridge.parse()`, `bridge.tokenize()`,
or `utils/pike-token-utils.ts`. No regex, no indexOf/charAt scanning loops.

## Shared Infrastructure

| File | Status | Notes |
|------|--------|-------|
| `src/utils/pike-token-utils.ts` | DONE | Shared findIdentifierOccurrences, tokenizeOrFallback, findPositionForIndex, isIdentifierToken |
| `src/utils/regex-patterns.ts` | DEPRECATED | Marked deprecated. Functions migrated to pike-token-utils or inlined. |

## Done

| File | What | PR |
|------|------|----|
| `features/advanced/extract-method-utils.ts` | Removed `stripCodeContent()` (85 lines) + `isIdentPresent()` (25 lines). Replaced with token kind filtering. | #1644 |
| `features/advanced/semantic-tokens-builder.ts` | Token-based symbol matching via identifierIndex when bridge available. Regex as fallback. | #1645 |
| `features/rxml/definition-provider.ts` | Deduplicated `findPositionForIndex` → shared import | #1643 |
| `features/rxml/references-provider.ts` | Deduplicated `findPositionForIndex` → shared import | #1643 |
| `features/rxml/rename-provider.ts` | Deduplicated `findPositionForIndex` → shared import | #1643 |

## Triage: Not Anti-patterns (verified)

| File | Why regex/string-scan is correct here |
|------|----------------------------------------|
| `features/rxml/rename-provider.ts` L112-121 | Reads `.pike` files from disk (not open LSP documents). Bridge only operates on open documents. Regex via `buildTagPattern()` is the only viable method. Also: exported functions are dead code (never imported). |
| `features/rxml/module-scanner.ts` L93-145 | String scan fallback is used by `definition-provider.ts:73` and `references-provider.ts:102`, which read files from disk via `readFileCached()`. Bridge requires open documents. Symbol-based path exists and is used when symbols are available. |
| `features/advanced/folding.ts` | Brace-matching scanner is generic document-structure analysis, not Pike parsing |
| `features/editing/autodoc.ts` | Single-line text extraction for completion snippets, not Pike source parsing |
| `features/advanced/ignored-ranges.ts` | Necessary fallback for when bridge is unavailable (tests, parse-under-edit) |
| `features/editing/completion-qe.ts` | Single-line regex heuristic for completion ranking. Bridge's CompletionContext solves a different problem |
| `features/navigation/references.ts` | PikeToken lacks operator metadata; regex is only viable method for write-detection |

## Already Fixed (reference implementations)

| File | Function | How |
|------|----------|-----|
| `features/roxen/defvar-scanner.ts` | `extractDefvarsFromTokens()` | Token-based defvar extraction via PikeToken[] |
| `features/roxen/config.ts` | defvar extraction orchestration | 3-tier: roxenDetect > extractDefvarsFromTokens > parse symbols |
| `features/rxml/references-provider.ts` | `findDefvarReferences()` | tokenizeFn parameter, RXML entity regex kept (not Pike) |
| `features/rxml/definition-provider.ts` | `getDefvarDefinitionIndex()` | tokenizeFn + extractDefvarsFromTokens (partial) |

## DGA Orchestrator Integration

- [x] Update KB entries to reference `pike-token-utils.ts` as canonical pattern
- [x] Update reviewer prompt and architect rules to reference shared module
- [ ] Add issue-filing rule: file against shared module, not individual features

## Metrics

- Total anti-pattern LOC removed: ~110 lines (extract-method-utils) + ~15 lines (dedup) = ~125 lines
- Files with genuine anti-patterns remaining: **0** (all triaged)
- PRs created: #1643, #1644, #1645
