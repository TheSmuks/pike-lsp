import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { Diagnostic, DiagnosticRelatedInformation } from 'vscode-languageserver/node.js';
import type { CoreDiagnostic } from '../core/types.js';
import { CORE_DIAGNOSTIC_TAG } from '../core/types.js';
import {
  toCorePosition,
  toProtocolPosition,
  toCoreRange,
  toProtocolRange,
  toCoreDiagnostic,
  toProtocolDiagnostic,
  toCoreDiagnostics,
  toProtocolDiagnostics,
  toCoreTextDocumentIdentifier,
  toProtocolTextDocumentIdentifier,
  toCoreVersionedTextDocumentIdentifier,
  toProtocolVersionedTextDocumentIdentifier,
  toCoreTextDocumentItem,
  toProtocolTextDocumentItem,
} from '../services/protocol-mappers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pos = (line: number, character: number) => ({ line, character });
const range = (sl: number, sc: number, el: number, ec: number) => ({
  start: pos(sl, sc),
  end: pos(el, ec),
});
const coreRange = (sl: number, sc: number, el: number, ec: number) => ({
  start: { line: sl, character: sc },
  end: { line: el, character: ec },
});

// ---------------------------------------------------------------------------
// Position & Range
// ---------------------------------------------------------------------------

describe('protocol-mappers', () => {
  describe('toCorePosition / toProtocolPosition', () => {
    it('round-trips a position', () => {
      const original = pos(3, 42);
      assert.deepStrictEqual(toProtocolPosition(toCorePosition(original)), original);
    });
  });

  describe('toCoreRange / toProtocolRange', () => {
    it('round-trips a range', () => {
      const original = range(1, 0, 5, 10);
      assert.deepStrictEqual(toProtocolRange(toCoreRange(original)), original);
    });
  });

  // ---------------------------------------------------------------------------
  // Diagnostic (the main target of the issue)
  // ---------------------------------------------------------------------------

  describe('toCoreDiagnostic', () => {
    it('maps required fields only (range + message)', () => {
      const diag: Diagnostic = {
        range: range(0, 0, 1, 10),
        message: 'expected semicolon',
      };

      const core = toCoreDiagnostic(diag);

      assert.deepStrictEqual(core.range, coreRange(0, 0, 1, 10));
      assert.strictEqual(core.message, 'expected semicolon');
      assert.strictEqual(core.severity, undefined);
      assert.strictEqual(core.code, undefined);
      assert.strictEqual(core.source, undefined);
      assert.strictEqual(core.data, undefined);
      assert.strictEqual(core.tags, undefined);
      assert.strictEqual(core.relatedInformation, undefined);
    });

    it('maps all optional fields', () => {
      const relatedInfo: DiagnosticRelatedInformation = {
        location: {
          uri: 'file:///included.pike',
          range: range(5, 0, 5, 20),
        },
        message: 'declared here',
      };

      const diag: Diagnostic = {
        range: range(2, 4, 2, 12),
        message: 'unused variable',
        severity: 2, // Warning
        code: 'PIKE001',
        source: 'pike-lsp',
        data: { fix: 'remove' },
        tags: [1], // Unnecessary
        relatedInformation: [relatedInfo],
      };

      const core = toCoreDiagnostic(diag);

      assert.deepStrictEqual(core.range, coreRange(2, 4, 2, 12));
      assert.strictEqual(core.message, 'unused variable');
      assert.strictEqual(core.severity, 2);
      assert.strictEqual(core.code, 'PIKE001');
      assert.strictEqual(core.source, 'pike-lsp');
      assert.deepStrictEqual(core.data, { fix: 'remove' });
      assert.deepStrictEqual(core.tags, [CORE_DIAGNOSTIC_TAG.UNNECESSARY]);
      const ri = core.relatedInformation!;
      assert.strictEqual(ri.length, 1);
      assert.strictEqual(ri[0]!.message, 'declared here');
      assert.strictEqual(ri[0]!.location.uri, 'file:///included.pike');
    });

    it('maps numeric diagnostic code', () => {
      const diag: Diagnostic = {
        range: range(0, 0, 0, 1),
        message: 'error',
        code: 42,
      };
      const core = toCoreDiagnostic(diag);
      assert.strictEqual(core.code, 42);
    });

    it('skips code when it is neither string nor number', () => {
      // LSP allows code to be { value: string; target: Uri } — should be skipped
      const diag = {
        range: range(0, 0, 0, 1),
        message: 'error',
        code: { value: 'E001', target: 'file:///doc' },
      } as unknown as Diagnostic;
      const core = toCoreDiagnostic(diag);
      assert.strictEqual(core.code, undefined);
    });

    it('skips data when key is absent (not undefined)', () => {
      const diag = { range: range(0, 0, 0, 1), message: 'err' } as Diagnostic;
      const core = toCoreDiagnostic(diag);
      assert.strictEqual(core.data, undefined);
    });

    it('maps multiple relatedInformation entries', () => {
      const diag: Diagnostic = {
        range: range(0, 0, 0, 1),
        message: 'ambiguous reference',
        relatedInformation: [
          {
            location: { uri: 'file:///a.pike', range: range(1, 0, 1, 5) },
            message: 'candidate 1',
          },
          {
            location: { uri: 'file:///b.pike', range: range(3, 0, 3, 5) },
            message: 'candidate 2',
          },
        ],
      };

      const core = toCoreDiagnostic(diag);

      const ri = core.relatedInformation!;
      assert.strictEqual(ri.length, 2);
      assert.strictEqual(ri[0]!.location.uri, 'file:///a.pike');
      assert.strictEqual(ri[1]!.location.uri, 'file:///b.pike');
    });
  });

  describe('toProtocolDiagnostic', () => {
    it('maps required fields only (range + message)', () => {
      const core: CoreDiagnostic = {
        range: coreRange(0, 0, 1, 10),
        message: 'expected semicolon',
      };

      const proto = toProtocolDiagnostic(core);

      assert.deepStrictEqual(proto.range, range(0, 0, 1, 10));
      assert.strictEqual(proto.message, 'expected semicolon');
      assert.strictEqual(proto.severity, undefined);
      assert.strictEqual(proto.code, undefined);
      assert.strictEqual(proto.source, undefined);
      assert.strictEqual(proto.data, undefined);
      assert.strictEqual(proto.tags, undefined);
      assert.strictEqual(proto.relatedInformation, undefined);
    });

    it('maps all optional fields', () => {
      const core: CoreDiagnostic = {
        range: coreRange(2, 4, 2, 12),
        message: 'unused variable',
        severity: 2,
        code: 'PIKE001',
        source: 'pike-lsp',
        data: { fix: 'remove' },
        tags: [CORE_DIAGNOSTIC_TAG.DEPRECATED],
        relatedInformation: [
          {
            location: {
              uri: 'file:///included.pike',
              range: coreRange(5, 0, 5, 20),
            },
            message: 'declared here',
          },
        ],
      };

      const proto = toProtocolDiagnostic(core);

      assert.strictEqual(proto.severity, 2);
      assert.strictEqual(proto.code, 'PIKE001');
      assert.strictEqual(proto.source, 'pike-lsp');
      assert.deepStrictEqual(proto.data, { fix: 'remove' });
      assert.deepStrictEqual(proto.tags, [2]);
      const ri = proto.relatedInformation!;
      assert.strictEqual(ri.length, 1);
      assert.strictEqual(ri[0]!.message, 'declared here');
      assert.strictEqual(ri[0]!.location.uri, 'file:///included.pike');
    });

    it('maps numeric code', () => {
      const core: CoreDiagnostic = {
        range: coreRange(0, 0, 0, 1),
        message: 'error',
        code: 42,
      };
      const proto = toProtocolDiagnostic(core);
      assert.strictEqual(proto.code, 42);
    });
  });

  // ---------------------------------------------------------------------------
  // Round-trip: Protocol -> Core -> Protocol
  // ---------------------------------------------------------------------------

  describe('round-trip fidelity', () => {
    it('round-trips a minimal diagnostic', () => {
      const original: Diagnostic = {
        range: range(0, 0, 1, 10),
        message: 'expected semicolon',
      };

      const roundTripped = toProtocolDiagnostic(toCoreDiagnostic(original));

      assert.deepStrictEqual(roundTripped, original);
    });

    it('round-trips a full diagnostic with all optional fields', () => {
      const original: Diagnostic = {
        range: range(2, 4, 2, 12),
        message: 'unused variable',
        severity: 2,
        code: 'PIKE001',
        source: 'pike-lsp',
        data: { fix: 'remove' },
        tags: [1, 2],
        relatedInformation: [
          {
            location: { uri: 'file:///a.pike', range: range(1, 0, 1, 5) },
            message: 'candidate 1',
          },
        ],
      };

      const roundTripped = toProtocolDiagnostic(toCoreDiagnostic(original));

      assert.deepStrictEqual(roundTripped, original);
    });

    it('round-trips diagnostic arrays', () => {
      const diags: Diagnostic[] = [
        { range: range(0, 0, 0, 1), message: 'a' },
        { range: range(1, 0, 1, 5), message: 'b', severity: 1 },
      ];

      const roundTripped = toProtocolDiagnostics(toCoreDiagnostics(diags));

      assert.deepStrictEqual(roundTripped, diags);
    });
  });

  // ---------------------------------------------------------------------------
  // Document identifiers
  // ---------------------------------------------------------------------------

  describe('toCoreTextDocumentIdentifier / toProtocolTextDocumentIdentifier', () => {
    it('round-trips a URI', () => {
      const id = { uri: 'file:///test.pike' };
      assert.deepStrictEqual(
        toProtocolTextDocumentIdentifier(toCoreTextDocumentIdentifier(id)),
        id
      );
    });
  });

  describe('toCoreVersionedTextDocumentIdentifier / toProtocolVersionedTextDocumentIdentifier', () => {
    it('round-trips URI + version', () => {
      const id = { uri: 'file:///test.pike', version: 7 };
      assert.deepStrictEqual(
        toProtocolVersionedTextDocumentIdentifier(toCoreVersionedTextDocumentIdentifier(id)),
        id
      );
    });
  });

  describe('toCoreTextDocumentItem / toProtocolTextDocumentItem', () => {
    it('round-trips a full document item', () => {
      const item = {
        uri: 'file:///test.pike',
        languageId: 'pike',
        version: 3,
        text: 'int main() {}',
      };
      assert.deepStrictEqual(toProtocolTextDocumentItem(toCoreTextDocumentItem(item)), item);
    });
  });
});
