# Pike Formatter Replacement Design

**Date:** 2026-03-18
**Status:** Proposed
**Scope:** Replace the current broken formatting/indentation architecture for Pike editing in `pike-lsp`

---

## Problem Statement

The current formatting stack is broken at an architectural level, not just at a rule-tuning level.

Today, Pike editing behavior is split across four overlapping systems:

1. `packages/vscode-pike/language-configuration.json`
   - regex-based `indentationRules`
2. `packages/pike-lsp-server/src/features/advanced/on-type-formatting.ts`
   - LSP on-type formatting for `\n`, `;`, `}`
3. `packages/vscode-pike/src/extension.ts`
   - extension-host `onDidChangeTextDocument` hook that calls `vscode.executeFormatRangeProvider`
4. `packages/pike-lsp-server/src/features/advanced/formatting.ts`
   - document/range formatter with its own indentation model and line rewriting behavior

These systems do not share one source of truth. They use different heuristics, different ownership boundaries, and different edit timing. That explains the reported failures:

- Enter/newline breaks indentation
- Tab indentation is inconsistent or blocked
- moving lines reindents incorrectly
- format selection / format document do not match live editor behavior

This design replaces that overlap with a strict two-layer model.

---

## Design Goals

1. Make Enter, Tab, paste auto-indent, and move-line indentation stable in VS Code.
2. Make format document and format selection deterministic and Pike-aware.
3. Remove duplicate formatting authorities.
4. Reuse Pike parsing infrastructure instead of growing more regex/state-machine logic.
5. Keep phase 1 focused on reliable indentation and whitespace normalization, not a full pretty-printer.

---

## Non-Goals

- building a canonical full-code pretty-printer
- rewriting expressions, spacing style, or line-breaking policy across the language
- introducing a third-party formatter dependency
- preserving the current on-type formatting pipeline

---

## Current Architecture Assessment

### Server formatting

`packages/pike-lsp-server/src/features/advanced/formatting.ts`

- exposes document formatting and range formatting
- computes indentation with a line-based stack machine in `computeIndentEdits()`
- includes `expandSingleLinePike()` which inserts newlines and changes document structure
- range formatting slices the selected lines and formats them as if they were a standalone fragment

### Server on-type formatting

`packages/pike-lsp-server/src/features/advanced/on-type-formatting.ts`

- uses a separate indentation algorithm from document/range formatting
- handles `\n`, `;`, and `}` only
- mixes column math with ad hoc brace matching
- partially hardcodes whitespace behavior instead of deferring fully to editor tab settings

### Extension-host formatting loop

`packages/vscode-pike/src/extension.ts`
`packages/vscode-pike/src/format-on-change.ts`

- watches indentation-sensitive edits
- schedules range formatting after live text changes
- applies returned edits back into the document
- creates overlap/race potential with both editor auto-indent and on-type formatting

### Language configuration

`packages/vscode-pike/language-configuration.json`

- currently defines `indentationRules`
- does not define `onEnterRules`
- stress tests already document coverage gaps for Pike constructs
- this file is the correct VS Code layer for Enter, paste auto-indent, and line-move indentation, but it is under-specified today

---

## Root Cause

The core problem is duplicated authority.

The editor, the extension host, and the LSP server all attempt to influence indentation during editing, but they do so through different code paths with different models:

- regex-based structural hints in language configuration
- simplified on-type indentation in the server
- post-edit range formatting in the extension host
- separate full/range formatting logic in the server

As long as those paths coexist, fixing one rule will keep breaking another interaction.

---

## Replacement Architecture

Collapse the system from four formatting paths into two clearly separated layers:

### Layer 1: VS Code owns live editing indentation

Owned by:

- `packages/vscode-pike/language-configuration.json`

Responsibilities:

- Enter/newline indentation
- Tab and Shift+Tab indentation behavior via native editor behavior
- paste auto-indent behavior that depends on language indentation rules
- move-line indentation / reindent behavior
- comment continuation behavior on Enter

Mechanisms:

- `indentationRules`
- new `onEnterRules`
- brackets/autoclosing pairs where relevant

Extension host responsibility here: none beyond contributing the language configuration.

### Layer 2: LSP owns explicit formatting

Owned by:

- new shared server formatting service
- `textDocument/formatting`
- `textDocument/rangeFormatting`

Responsibilities:

- explicit Format Document
- explicit Format Selection
- format-on-paste, when VS Code routes that through range formatting

Mechanisms:

- one Pike-aware formatting engine
- one indentation model
- edit materialization based on LSP `FormattingOptions` (`tabSize`, `insertSpaces`)

### Removed completely

- `textDocument/onTypeFormatting`
- extension-host auto-format-on-change loop

This means:

- remove `documentOnTypeFormattingProvider` registration from `packages/pike-lsp-server/src/server.ts`
- retire `packages/pike-lsp-server/src/features/advanced/on-type-formatting.ts`
- remove `onDidChangeTextDocument` formatting flow from `packages/vscode-pike/src/extension.ts`
- remove `packages/vscode-pike/src/format-on-change.ts`

---

## Ownership Rules

This ownership split must be explicit and enforced.

| Behavior | Owner | Why |
|---|---|---|
| Enter indentation | VS Code language configuration | native editor behavior, immediate, tab-aware |
| Tab / Shift+Tab | VS Code editor | editor already owns indentation commands |
| Move line up/down reindent | VS Code language configuration | official indentation-rules responsibility |
| Paste auto-indent | VS Code language configuration | editor-native indentation |
| Format on paste | LSP range formatting | VS Code routes this through formatting providers |
| Format selection | LSP range formatting | explicit command |
| Format document | LSP document formatting | explicit command |

If future behavior crosses those boundaries, it must justify why the native owner is insufficient.

---

## Server-Side Replacement: `FormattingService`

Introduce a new shared service in the server, for example:

`packages/pike-lsp-server/src/services/formatting/`

Suggested structure:

```text
services/formatting/
  formatting-service.ts
  line-state.ts
  indent-model.ts
  edit-builder.ts
  types.ts
```

### Responsibilities

#### `formatting-service.ts`

- public entry point for document and range formatting
- obtains parse/token context from Pike infrastructure
- computes line states for the full document
- delegates edit creation

#### `line-state.ts`

- converts Pike parse/token output into per-line structural state
- tracks contexts such as:
  - block open / close
  - switch / case / default
  - Pike literals like `([`, `(<`, `({`
  - multiline comments
  - multiline strings
  - continuation lines if represented in token context

#### `indent-model.ts`

- turns line states into logical indentation levels
- returns logical indent depth, not literal whitespace
- contains the single authoritative indentation policy

#### `edit-builder.ts`

- materializes whitespace edits from logical levels
- converts indent depth into tabs/spaces from LSP `FormattingOptions`
- limits edits to the requested range while using full-document context

### Critical design rules

1. The formatter must analyze full-document context even for range formatting.
2. The formatter must return indentation/whitespace edits only in phase 1.
3. The formatter must not insert or remove structural newlines.
4. `expandSingleLinePike()` behavior must be removed from the replacement path.
5. Range formatting must not treat the selected range as indentation level 0.

---

## Parser/Bridge Integration

Do not build another regex parser.

The replacement formatter should reuse existing Pike infrastructure through `pike-bridge` / `Parser.Pike`-backed analysis.

### Recommended approach

Add lightweight formatting-context data from the analyzer side if current data is not sufficient.

That context should expose enough information to derive indentation safely, such as:

- token kinds relevant to structure
- opener/closer pairs
- line spans for multiline strings/comments
- switch/case/default markers
- Pike literal opener/closer markers

This is intentionally lighter than a full pretty-printer AST.

### Why this is the right level

- regexes have already failed on Pike syntax coverage
- a full AST pretty-printer is too large for the current goal
- formatting-context tokens let us build a correct indentation engine without taking on full canonical formatting

---

## VS Code Language Configuration Replacement

Expand `packages/vscode-pike/language-configuration.json` to own live editing correctly.

### Required additions

1. Keep `indentationRules`, but narrow them to structural editor scenarios.
2. Add `onEnterRules` for cases where Enter behavior needs more than generic indent/outdent.
3. Add explicit handling for Pike constructs currently missing or weakly represented.

### Minimum behaviors to cover

- braces `{}`
- Pike literals `({`, `([`, `(<` and matching closers
- `switch`, `case`, `default`
- multiline comment continuation
- comment block open/close Enter behavior
- block close alignment where `onEnterRules` improves clarity

### Important constraint

Do not try to replicate full Pike syntax in JSON regexes.

Language configuration should cover editor-native structural behavior only. If a rule needs parser-grade understanding, it belongs in the server formatter, not in `language-configuration.json`.

---

## What Gets Deleted or Reworked

### Delete

- `packages/pike-lsp-server/src/features/advanced/on-type-formatting.ts`
- `packages/vscode-pike/src/format-on-change.ts`

### Remove wiring

- `registerOnTypeFormattingHandler(...)` from `packages/pike-lsp-server/src/features/advanced/index.ts`
- `documentOnTypeFormattingProvider` capability from `packages/pike-lsp-server/src/server.ts`
- extension-host auto-format-on-change registration from `packages/vscode-pike/src/extension.ts`

### Replace

- `packages/pike-lsp-server/src/features/advanced/formatting.ts`

It can either:

- be slimmed down to request handlers that delegate into `FormattingService`, or
- be split so handlers stay in `features/advanced/formatting.ts` and actual logic lives in `services/formatting/`

### Retain conceptually, but not implementation-wise

- explicit document formatting
- explicit range formatting

---

## Request Flow After Replacement

### Enter / Tab / move line

1. user presses Enter / Tab or moves lines
2. VS Code evaluates `language-configuration.json`
3. editor applies native indentation behavior
4. no LSP formatting request is sent as part of normal typing

### Format document

1. user triggers Format Document
2. VS Code sends `textDocument/formatting`
3. server `FormattingService` computes full-document line states
4. server returns indentation/whitespace edits for the document

### Format selection / format on paste

1. user triggers Format Selection, or VS Code routes format-on-paste to range formatting
2. VS Code sends `textDocument/rangeFormatting`
3. server computes full-document context
4. server returns edits limited to lines in the requested range

---

## Data Model

The formatter should work from logical line state, not directly from raw text scans.

Suggested types:

```ts
type LineState = {
  line: number;
  baseDepth: number;
  visualDepth: number;
  startsWithClosingToken: boolean;
  opensBlock: boolean;
  closesBlock: boolean;
  isCaseLabel: boolean;
  isDefaultLabel: boolean;
  isCommentLine: boolean;
  isInMultilineComment: boolean;
  isInMultilineString: boolean;
  continuationKind: 'none' | 'call' | 'literal' | 'expression';
};

type LogicalIndent = {
  line: number;
  depth: number;
};
```

The exact fields can change, but the rule is fixed:

- parser/token stage discovers structure
- indent model decides depth
- edit builder decides concrete whitespace

---

## Behavior Rules for Phase 1

These rules define the intended first implementation.

1. Preserve existing line breaks.
2. Normalize leading indentation only.
3. Preserve non-leading spacing except where required for indentation edits.
4. Preserve multiline string and comment bodies.
5. Keep case/default alignment deterministic.
6. Respect `insertSpaces` and `tabSize` at edit materialization time only.

This keeps the project focused on fixing broken indentation without turning the work into a language-wide pretty-printer.

---

## Migration Plan

### Phase 0: Guardrails

- document ownership boundaries in code comments and docs
- mark on-type formatting and auto-format-on-change as deprecated internally
- add failing regression tests for the current bugs before removal

### Phase 1: VS Code live-indentation reset

- add `onEnterRules`
- tighten `indentationRules`
- remove extension-host auto-format-on-change
- remove on-type formatting capability/handler

Expected outcome:

- Enter/Tab/move-line behavior becomes editor-native and predictable

### Phase 2: Server formatting service extraction

- create `FormattingService`
- move document/range formatting to one shared engine
- remove newline insertion behavior
- make range formatting context-aware

Expected outcome:

- format document and format selection use one model

### Phase 3: Parser-backed formatting context

- expose formatting-context tokens or analyzer output needed by the formatter
- replace remaining hand-rolled regex/state scanning in server formatting

Expected outcome:

- Pike-aware indentation without regex explosion

### Phase 4: Caching and performance

- if needed, cache per-line formatting state for large files
- optimize edit generation without reintroducing extension-side formatting loops

Expected outcome:

- stable latency on larger files

---

## Risks

### 1. Language configuration under-covers Pike syntax

Mitigation:

- keep live behavior scope intentionally structural
- push parser-grade cases into explicit formatting only

### 2. Analyzer output is not rich enough

Mitigation:

- add lightweight formatting-context tokens instead of a full formatter AST

### 3. Range formatting still behaves incorrectly at boundaries

Mitigation:

- force all range formatting to compute from full-document state
- add dedicated tests for partial ranges inside nested blocks, switch blocks, literals, and comments

### 4. Scope creep into full pretty-printing

Mitigation:

- freeze phase 1 to indentation and leading-whitespace normalization only

---

## Verification Plan

Verification must be split by ownership boundary.

### A. Language configuration tests

Target:

- `packages/vscode-pike/language-configuration.json`
- `packages/vscode-pike/src/test/indentation-stress.test.ts`

Add coverage for:

- Enter after block open
- Enter inside multiline comments
- move line up/down around nested blocks
- Pike literals `({`, `([`, `(<`
- `switch` / `case` / `default`

### B. Server unit tests

Target:

- new `FormattingService`

Add coverage for:

- full document indentation
- range formatting with outer-context dependency
- case/default indentation
- multiline comments and multiline strings
- tabs vs spaces materialization
- no structural newline insertion

### C. VS Code integration tests

Target:

- `packages/vscode-pike/src/test/integration/`

Add coverage for:

- Enter behavior
- Tab / Shift+Tab behavior in Pike files
- move-line indentation behavior
- Format Document
- Format Selection
- format-on-paste

### D. Protocol tests

Update protocol/capability tests to assert:

- `documentFormattingProvider: true`
- `documentRangeFormattingProvider: true`
- `documentOnTypeFormattingProvider` is removed

---

## Acceptance Criteria

This design is successful when all of the following are true:

1. Pressing Enter in Pike code uses stable editor-native indentation.
2. Pressing Tab/Shift+Tab behaves like a normal VS Code language with Pike-aware structure.
3. Moving lines up/down no longer corrupts indentation.
4. Format Selection and Format Document use the same server indentation model.
5. Range formatting respects surrounding document context.
6. The server no longer rewrites code by inserting structural newlines.
7. There is no extension-host formatting loop and no LSP on-type formatting provider.

---

## Final Recommendation

Do not try to rescue the current system by improving regexes or patching one more handler.

The correct move is to simplify ownership:

- VS Code language configuration owns live indentation behavior.
- one parser-backed server formatting engine owns explicit formatting.
- the extension host owns no formatting logic.

That is the smallest architecture that can realistically make Pike formatting reliable without turning this into a full pretty-printer rewrite.
