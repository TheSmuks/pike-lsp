# Token-Based Pike Source Analysis — Progress Tracker

ADR-001: All Pike source parsing uses `bridge.parse()`, `bridge.tokenize()`,
or `utils/pike-token-utils.ts`. No regex, no indexOf/charAt scanning loops.

## Shared Infrastructure

| File | Status | Notes |
|------|--------|-------|
| `src/utils/pike-token-utils.ts` | DONE | Shared findIdentifierOccurrences, tokenizeOrFallback, findPositionForIndex, isIdentifierToken |
| `src/utils/regex-patterns.ts` | DEPRECATED | Marked deprecated. Functions migrated to pike-token-utils or inlined. |

## HIGH Severity (Pike AST/syntax parsing)

| File | Function(s) | Anti-pattern | Bridge API | Status |
|------|-------------|-------------|------------|--------|
| `features/rxml/definition-provider.ts` | `getDefvarDefinitionIndex()` | regex `/defvar\s*\(\s*["']([^"']+)["']/g` | `extractDefvarsFromTokens()` via `tokenizeFn` | TODO |
| `features/rxml/definition-provider.ts` | `getTagDefinitionIndex()` | doesn't pass `symbols` to `findTagFunctionsInCode()` | `bridge.parse()` symbols | TODO |
| `features/rxml/rename-provider.ts` | rename position detection | regex for rename positions | `findIdentifierOccurrences()` | TODO |
| `features/advanced/folding.ts` | `getFoldingRanges()` | 130-line hand-rolled Pike lexer (brace/comment/string tracking) | `bridge.parse()` + `bridge.tokenize()` | TODO |
| `features/editing/autodoc.ts` | `parseFunctionSignature()`, `parseArguments()`, `extractArgumentName()` | regex + manual paren-depth parsing for Pike signatures | `bridge.parse()` PikeMethod with argNames/argTypes | TODO |
| `features/advanced/extract-method-utils.ts` | `stripCodeContent()`, `isIdentPresent()` | 85-line comment/string stripper + indexOf word-boundary check | `tokenizeCode()` tokens with `kind === 'identifier'` | DONE |

## MEDIUM Severity (identifier/token scanning)

| File | Function(s) | Anti-pattern | Bridge API | Status |
|------|-------------|-------------|------------|--------|
| `features/advanced/semantic-tokens-builder.ts` | `wholeWordPattern()`, `buildTokens()` | `\b` regex per symbol name, line-by-line exec | `findIdentifierOccurrences()` | TODO |
| `features/advanced/ignored-ranges.ts` | `buildIgnoredRangesFallback()` | 77-line hand-rolled scanner for comments/strings | Already has bridge path; eliminate fallback | TODO |
| `features/editing/completion-qe.ts` | `getCompletionContext()` | 82 lines of regex for Pike syntax context | `bridge.parse()` AST context | TODO |
| `features/navigation/references.ts` | write-occurrence detection | regex for `++/--` and assignment operators | `bridge.parse()` or `bridge.tokenize()` | TODO |
| `features/rxml/module-scanner.ts` | `findTagFunctionsInCode()` string fallback | indexOf-based scanning when symbols not provided | Remove fallback now that callers pass symbols | TODO |

## Already Fixed (reference implementations)

| File | Function | How |
|------|----------|-----|
| `features/roxen/defvar-scanner.ts` | `extractDefvarsFromTokens()` | Token-based defvar extraction via PikeToken[] |
| `features/roxen/config.ts` | defvar extraction orchestration | 3-tier: roxenDetect > extractDefvarsFromTokens > parse symbols |
| `features/rxml/references-provider.ts` | `findDefvarReferences()` | tokenizeFn parameter, RXML entity regex kept (not Pike) |
| `features/rxml/definition-provider.ts` | `getDefvarDefinitionIndex()` | tokenizeFn + extractDefvarsFromTokens (partial) |

## DGA Orchestrator Integration

- [x] Update KB entries to reference `pike-token-utils.ts` as canonical pattern
- [ ] Add issue-filing rule: file against shared module, not individual features
