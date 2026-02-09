# Mixed Pike + RXML Content Detection Strategy

**Design Document for Phase 4 - Roxen Support Roadmap**

**Status:** Design Complete - Ready for Implementation

**Created:** 2026-02-09

---

## Summary

This design provides a complete strategy for detecting and parsing RXML content embedded in Pike multiline string literals (`#"..."...`). The solution maintains compliance with ADR-001 (Parser.Pike over regex) and ADR-002 (Pike 8.0.1116 compatibility).

**File Created:** `/packages/pike-lsp-server/src/features/rxml/mixed-content.ts` (521 lines, 17KB)

---

## Architecture

### Three-Layer Design

```
┌─────────────────────────────────────────────────────────────────┐
│ TypeScript Layer (mixed-content.ts)                              │
│ - Position mapping (document ↔ RXML content)                     │
│ - Symbol tree merging (Pike + RXML symbols)                      │
│ - Context-aware completion routing                               │
│ - Confidence scoring and marker detection                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ Bridge Layer (pike-bridge)                                       │
│ - New method: roxenExtractRXMLStrings(code, uri)                │
│ - JSON-RPC transport to Pike subprocess                          │
│ - Position format conversion (1-indexed ↔ 0-indexed)             │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ Pike Layer (LSP.pmod/Roxen.pmod/MixedContent.pike)              │
│ - Extract multiline string literals using Parser.Pike.split()   │
│ - Calculate RXML confidence scores                               │
│ - Detect RXML markers (tags, entities)                           │
│ - Return structured results with positions                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Data Structures

### 1. RXMLStringLiteral

Represents a multiline string that may contain RXML:

```typescript
interface RXMLStringLiteral {
    content: string;              // The RXML content (excluding quotes)
    range: Range;                 // Content position in document
    fullRange: Range;             // Position including #"..." quotes
    confidence: number;           // 0-1 score of RXML likelihood
    markers: RXMLMarker[];        // Detected RXML tags/entities
}
```

### 2. RXMLMarker

Individual RXML pattern found in content:

```typescript
interface RXMLMarker {
    type: 'tag' | 'entity' | 'directive';
    name: string;                 // e.g., "roxen", "set", "emit"
    position: Position;           // Position within RXML content
}
```

### 3. PositionMapping

Bidirectional mapping between document and extracted content:

```typescript
interface PositionMapping {
    documentRange: Range;
    contentOffset: number;
    lineOffset: number;           // Document line - content line
    characterOffset: number;      // Char offset on first line
}
```

---

## Key Functions

### Detection

**`detectRXMLStrings(code, uri, bridge)`**
- Calls Pike-side `roxenExtractRXMLStrings()`
- Transforms Pike results to TypeScript types
- Converts 1-indexed Pike positions to 0-indexed LSP positions

**`calculateRXMLConfidence(content)`**
- Scores content (0-1) based on RXML indicators:
  - `<roxen>` tags: +0.4
  - `<set>`, `<emit>`: +0.2 each
  - `<if>`, `<elseif>`, `<else>`: +0.15
  - RXML entities (`&roxen.*`, `&form.*`): +0.2
  - XML structure: +0.1
- Strings with confidence < 0.3 are filtered out

**`detectRXMLMarkers(content)`**
- Scans for known RXML tags (27 standard tags)
- Detects RXML entity prefixes
- Returns positions within RXML content

### Position Mapping

**`mapContentToDocumentPosition(position, mapping)`**
- Maps position from RXML content to original document
- Used for diagnostics, symbols, completions

**`mapDocumentToContentPosition(position, rxmlString)`**
- Maps document position to RXML content position
- Returns `null` if position is outside RXML string

**`findRXMLStringAtPosition(position, rxmlStrings)`**
- Determines if cursor is within an RXML string
- Enables context-aware completion (Pike vs RXML)

### Symbol Tree Merging

**`mergeSymbolTrees(pikeSymbols, rxmlStrings)`**
- Creates unified symbol tree
- Adds "RXML Template" container symbols (SymbolKind.Namespace)
- Nests RXML markers as children
- Filters low-confidence strings (< 0.3)

---

## Pike-Side Implementation

### File to Create
`pike-scripts/LSP.pmod/Roxen.pmod/MixedContent.pike`

### Key Algorithm

```pike
mixed roxen_extract_rxml_strings(mapping params) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";

    // PER ADR-001: Use Parser.Pike.split() for tokenization
    array(mixed) tokens = Parser.Pike.split(code);
    array(results) = ({});

    // Detect multiline string literals: #"..."..."
    // Track positions using find_token_position() helper
    // Calculate confidence using heuristics
    // Detect markers: <roxen>, <set>, <emit>, &roxen.*, etc.

    return (["result": (["strings": results])]);
}
```

### Position Tracking

Uses existing helpers from `Roxen.pike`:
- `build_newline_offsets()` - O(1) line/column lookup
- `offset_to_position()` - Convert byte offset to position
- `find_token_position()` - Find token in source code

### Compliance

- **ADR-001:** Uses `Parser.Pike.split()` for all parsing (not regex)
- **ADR-002:** Uses `String.trim_all_whites()` for whitespace

---

## Bridge Layer Integration

### New Method

**File:** `packages/pike-bridge/src/bridge.ts`

```typescript
async roxenExtractRXMLStrings(
    code: string,
    uri: string
): Promise<{ strings: RXMLStringResult[] }>
```

### Handler Registration

**File:** `pike-scripts/analyzer.pike`

```pike
// In HANDLERS mapping
"roxenExtractRXMLStrings": Roxen.MixedContent.roxen_extract_rxml_strings,
```

---

## Example Usage

### Detecting RXML in Pike Code

**Input Pike Code:**
```pike
// my_template.pike
inherit "module";
constant module_type = MODULE_TAG;

string simpletag_foo(string tag_name, mapping args, string contents, RequestID id) {
    return #"
        <set variable='foo'>bar</set>
        <emit source='sql'>SELECT * FROM table</emit>
    ";
}
```

**Detection Result:**
```typescript
{
    strings: [{
        content: "\n        <set variable='foo'>bar</set>\n        <emit source='sql'>SELECT * FROM table</emit>\n    ",
        range: {
            start: { line: 6, character: 15 },
            end: { line: 8, character: 5 }
        },
        fullRange: {
            start: { line: 6, character: 12 },
            end: { line: 8, character: 6 }
        },
        confidence: 0.8,
        markers: [
            { type: 'tag', name: 'set', position: { line: 1, character: 9 } },
            { type: 'tag', name: 'emit', position: { line: 2, character: 9 } }
        ]
    }]
}
```

### Symbol Tree Output

```typescript
[
    // Pike symbols...
    { name: 'simpletag_foo', kind: SymbolKind.Method, ... },
    // RXML template container
    {
        name: 'RXML Template',
        kind: SymbolKind.Namespace,
        range: { start: { line: 6, character: 15 }, end: { line: 8, character: 5 } },
        detail: '2 RXML markers',
        children: [
            { name: 'set', kind: SymbolKind.Method, detail: 'tag', ... },
            { name: 'emit', kind: SymbolKind.Method, detail: 'tag', ... }
        ]
    }
]
```

---

## Integration Points

### 1. Document Symbols Provider

**File:** `packages/pike-lsp-server/src/features/symbols.ts`

```typescript
import { detectRXMLStrings, mergeSymbolTrees } from './features/rxml/mixed-content.js';

connection.onDocumentSymbol(async (params) => {
    const pikeSymbols = await documentCache.getSymbols(uri);

    // Detect RXML strings
    const rxmlStrings = await detectRXMLStrings(code, uri, bridge);

    // Merge symbol trees
    const mergedSymbols = mergeSymbolTrees(pikeSymbols, rxmlStrings);

    return mergedSymbols;
});
```

### 2. Completion Provider

**File:** `packages/pike-lsp-server/src/features/editing/completion.ts`

```typescript
import { findRXMLStringAtPosition } from './features/rxml/mixed-content.js';

connection.onCompletion(async (params) => {
    const rxmlStrings = await detectRXMLStrings(code, uri, bridge);
    const inRXML = findRXMLStringAtPosition(params.position, rxmlStrings);

    if (inRXML) {
        // Provide RXML tag/attribute completions
        return getRXMLCompletions(inRXML, params.position);
    } else {
        // Provide Pike completions
        return getPikeCompletions(params);
    }
});
```

### 3. Diagnostics Provider

**File:** `packages/pike-lsp-server/src/features/diagnostics.ts`

```typescript
import { detectRXMLStrings, mapContentToDocumentPosition } from './features/rxml/mixed-content.js';

connection.onDiagnostics(async (params) => {
    const rxmlStrings = await detectRXMLStrings(code, uri, bridge);
    const diagnostics = [];

    for (const rxmlString of rxmlStrings) {
        // Validate RXML content
        const rxmlDiags = await validateRXML(rxmlString.content);

        // Map positions back to document
        for (const diag of rxmlDiags) {
            diagnostics.push({
                ...diag,
                range: mapContentToDocumentPosition(diag.range, rxmlString)
            });
        }
    }

    return diagnostics;
});
```

---

## Testing Strategy

### Unit Tests

**File:** `packages/pike-lsp-server/src/tests/features/rxml/mixed-content.test.ts`

1. **Confidence Calculation**
   - Test known RXML patterns score high (> 0.7)
   - Test plain text scores low (< 0.3)
   - Test edge cases (empty strings, mixed content)

2. **Marker Detection**
   - Test all 27 known RXML tags detected
   - Test entity prefixes detected
   - Test position accuracy within content

3. **Position Mapping**
   - Test content → document mapping
   - Test document → content mapping
   - Test boundary conditions (first line, last line)

4. **Symbol Tree Merging**
   - Test Pike symbols preserved
   - Test RXML containers added
   - Test low-confidence strings filtered

### Bridge Tests

**File:** `packages/pike-bridge/src/roxen-mixed-content.test.ts`

1. Test `roxenExtractRXMLStrings()` method
2. Test position format conversion (1-indexed ↔ 0-indexed)
3. Test error handling

### Pike-Side Tests

**File:** `pike-scripts/LSP.pmod/Roxen.pmod/tests/test_mixed_content.pike`

1. Test multiline string literal detection
2. Test position tracking with `Parser.Pike.split()`
3. Test confidence calculation
4. Test marker detection

### E2E Tests

**File:** `packages/vscode-pike/src/test/integration/rxml-mixed.test.ts`

1. Test document symbols include RXML templates
2. Test completion switches context (Pike ↔ RXML)
3. Test hover works in RXML content
4. Test diagnostics mapped to correct positions

---

## Implementation Order

### Phase 1: Pike-Side (Priority: HIGH)
1. Create `LSP.pmod/Roxen.pmod/MixedContent.pike`
2. Implement `roxen_extract_rxml_strings()`
3. Add unit tests in `tests/test_mixed_content.pike`
4. Register handler in `analyzer.pike`

### Phase 2: Bridge Layer (Priority: HIGH)
1. Add `roxenExtractRXMLStrings()` to `PikeBridge`
2. Add TypeScript types
3. Add bridge tests
4. Verify position format conversion

### Phase 3: TypeScript Layer (Priority: MEDIUM)
1. Create `mixed-content.ts` (DONE ✓)
2. Add unit tests
3. Implement position mapping tests
4. Implement confidence scoring tests

### Phase 4: Integration (Priority: MEDIUM)
1. Integrate with document symbols provider
2. Integrate with completion provider
3. Integrate with diagnostics provider
4. Add E2E tests

---

## Known Limitations

1. **String Concatenation:** Doesn't detect RXML built via string concatenation
2. **Dynamic Strings:** Only handles literal string constants
3. **Nested Quotes:** May fail with escaped quotes inside strings
4. **Performance:** Full document scan on every parse (caching recommended)

---

## Future Enhancements

1. **RXML Tag Catalog Integration** (Phase 5)
   - Load available tags from running Roxen server
   - Validate against server's tag registry
   - Show tag documentation on hover

2. **Advanced Parsing**
   - Handle string concatenation patterns
   - Support for RXML in constant definitions
   - Detect RXML in function call arguments

3. **Semantic Analysis**
   - Detect undefined RXML tags
   - Validate tag-specific attributes
   - Check for unclosed container tags

---

## References

- **ADR-001:** Use Parser.Pike over regex for code parsing
- **ADR-002:** Target Pike 8.0.1116 compatibility
- **Roxen Roadmap:** `/ROXEN_SUPPORT_ROADMAP.md` Phase 4
- **Existing Roxen Support:** `/packages/pike-lsp-server/src/features/roxen/`

---

## Sign-Off

**Design Status:** ✅ COMPLETE

**Ready for Implementation:** YES

**Recommended Next Step:** Assign to executor agent for Phase 1 (Pike-side implementation)

**Estimated Implementation Effort:** 2-3 days (per roadmap estimate)
