import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { DiagnosticSeverity, DiagnosticTag } from 'vscode-languageserver/node.js';
import {
  toCoreDiagnostic,
  toProtocolDiagnostic,
  toCoreDiagnostics,
  toProtocolDiagnostics,
  toCorePosition,
  toProtocolPosition,
  toCoreRange,
  toProtocolRange,
} from '../services/protocol-mappers.js';
import type { Diagnostic, DiagnosticRelatedInformation } from 'vscode-languageserver/node.js';
import type { CoreDiagnostic } from '../core/types.js';

function makeProtocolDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
    message: 'test error',
    ...overrides,
  };
}

function makeCoreDiagnostic(overrides: Partial<CoreDiagnostic> = {}): CoreDiagnostic {
  return {
    range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
    message: 'test error',
    ...overrides,
  };
}

describe('protocol-mappers', () => {
  describe('position and range', () => {
    it('maps protocol position to core position', () => {
      const core = toCorePosition({ line: 5, character: 12 });
      assert.deepStrictEqual(core, { line: 5, character: 12 });
    });

    it('maps core position to protocol position', () => {
      const proto = toProtocolPosition({ line: 5, character: 12 });
      assert.deepStrictEqual(proto, { line: 5, character: 12 });
    });

    it('maps protocol range to core range', () => {
      const core = toCoreRange({
        start: { line: 0, character: 0 },
        end: { line: 3, character: 20 },
      });
      assert.deepStrictEqual(core, {
        start: { line: 0, character: 0 },
        end: { line: 3, character: 20 },
      });
    });

    it('maps core range to protocol range', () => {
      const proto = toProtocolRange({
        start: { line: 0, character: 0 },
        end: { line: 3, character: 20 },
      });
      assert.deepStrictEqual(proto, {
        start: { line: 0, character: 0 },
        end: { line: 3, character: 20 },
      });
    });
  });

  describe('toCoreDiagnostic', () => {
    it('maps minimal diagnostic (range + message only)', () => {
      const proto = makeProtocolDiagnostic();
      const core = toCoreDiagnostic(proto);

      assert.deepStrictEqual(core, {
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
        message: 'test error',
      });
    });

    it('maps all optional fields', () => {
      const relatedInfo: DiagnosticRelatedInformation = {
        location: {
          uri: 'file:///other.pike',
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
        },
        message: 'see also',
      };

      const proto = makeProtocolDiagnostic({
        severity: DiagnosticSeverity.Error,
        code: 'E001',
        source: 'pike-lsp',
        data: { key: 'value' },
        tags: [DiagnosticTag.Unnecessary, DiagnosticTag.Deprecated],
        relatedInformation: [relatedInfo],
      });
      const core = toCoreDiagnostic(proto);

      assert.equal(core.severity, DiagnosticSeverity.Error);
      assert.equal(core.code, 'E001');
      assert.equal(core.source, 'pike-lsp');
      assert.deepStrictEqual(core.data, { key: 'value' });
      assert.deepStrictEqual(core.tags, [DiagnosticTag.Unnecessary, DiagnosticTag.Deprecated]);
      const info = core.relatedInformation!;
      assert.equal(info.length, 1);
      assert.equal(info[0]!.message, 'see also');
      assert.equal(info[0]!.location.uri, 'file:///other.pike');
    });

    it('omits undefined optional fields from output', () => {
      const core = toCoreDiagnostic(makeProtocolDiagnostic());
      assert.equal('severity' in core && core.severity !== undefined, false);
      assert.equal('code' in core && core.code !== undefined, false);
      assert.equal('source' in core && core.source !== undefined, false);
      assert.equal('data' in core && core.data !== undefined, false);
      assert.equal(core.tags, undefined);
      assert.equal(core.relatedInformation, undefined);
    });

    it('maps numeric code', () => {
      const core = toCoreDiagnostic(makeProtocolDiagnostic({ code: 42 }));
      assert.equal(core.code, 42);
    });

    it('maps data even when it is null', () => {
      const core = toCoreDiagnostic(makeProtocolDiagnostic({ data: null }));
      assert.strictEqual(core.data, null);
    });

    it('omits code when it is neither string nor number', () => {
      // LSP allows code to be { value: string, target: URI } — the mapper skips it
      const core = toCoreDiagnostic(
        makeProtocolDiagnostic({
          code: { value: 'E001', target: 'file:///a' },
        } as unknown as Diagnostic)
      );
      assert.equal('code' in core && core.code !== undefined, false);
    });
  });

  describe('toProtocolDiagnostic', () => {
    it('maps minimal diagnostic (range + message only)', () => {
      const core = makeCoreDiagnostic();
      const proto = toProtocolDiagnostic(core);

      assert.deepStrictEqual(proto, {
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
        message: 'test error',
      });
    });

    it('maps all optional fields', () => {
      const core = makeCoreDiagnostic({
        severity: DiagnosticSeverity.Warning,
        code: 'W001',
        source: 'pike',
        data: { count: 3 },
        tags: [DiagnosticTag.Deprecated],
        relatedInformation: [
          {
            location: {
              uri: 'file:///util.pike',
              range: { start: { line: 10, character: 2 }, end: { line: 10, character: 8 } },
            },
            message: 'defined here',
          },
        ],
      });
      const proto = toProtocolDiagnostic(core);

      assert.equal(proto.severity, DiagnosticSeverity.Warning);
      assert.equal(proto.code, 'W001');
      assert.equal(proto.source, 'pike');
      assert.deepStrictEqual(proto.data, { count: 3 });
      assert.deepStrictEqual(proto.tags, [DiagnosticTag.Deprecated]);
      const info = proto.relatedInformation!;
      assert.equal(info.length, 1);
      assert.equal(info[0]!.message, 'defined here');
      assert.equal(info[0]!.location.uri, 'file:///util.pike');
    });

    it('maps numeric code', () => {
      const proto = toProtocolDiagnostic(makeCoreDiagnostic({ code: 99 }));
      assert.equal(proto.code, 99);
    });
  });

  describe('round-trip: Protocol -> Core -> Protocol', () => {
    it('produces equivalent output for minimal diagnostic', () => {
      const original = makeProtocolDiagnostic();
      const roundTripped = toProtocolDiagnostic(toCoreDiagnostic(original));
      assert.deepStrictEqual(roundTripped, original);
    });

    it('produces equivalent output for full diagnostic', () => {
      const relatedInfo: DiagnosticRelatedInformation = {
        location: {
          uri: 'file:///a.pike',
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        },
        message: 'ref',
      };
      const original = makeProtocolDiagnostic({
        severity: DiagnosticSeverity.Error,
        code: 'E100',
        source: 'test',
        data: { x: true },
        tags: [DiagnosticTag.Unnecessary],
        relatedInformation: [relatedInfo],
      });
      const roundTripped = toProtocolDiagnostic(toCoreDiagnostic(original));
      assert.deepStrictEqual(roundTripped, original);
    });

    it('round-trips numeric code', () => {
      const original = makeProtocolDiagnostic({ code: 12345 });
      const roundTripped = toProtocolDiagnostic(toCoreDiagnostic(original));
      assert.deepStrictEqual(roundTripped, original);
    });
  });

  describe('batch mappers', () => {
    it('toCoreDiagnostics maps array of protocol diagnostics', () => {
      const protos = [
        makeProtocolDiagnostic({ message: 'a' }),
        makeProtocolDiagnostic({ message: 'b', severity: DiagnosticSeverity.Warning }),
      ];
      const cores = toCoreDiagnostics(protos);
      assert.equal(cores.length, 2);
      assert.equal(cores[0]!.message, 'a');
      assert.equal(cores[1]!.message, 'b');
      assert.equal(cores[1]!.severity, DiagnosticSeverity.Warning);
    });

    it('toProtocolDiagnostics maps array of core diagnostics', () => {
      const cores = [
        makeCoreDiagnostic({ message: 'x' }),
        makeCoreDiagnostic({ message: 'y', severity: DiagnosticSeverity.Hint }),
      ];
      const protos = toProtocolDiagnostics(cores);
      assert.equal(protos.length, 2);
      assert.equal(protos[0]!.message, 'x');
      assert.equal(protos[1]!.message, 'y');
      assert.equal(protos[1]!.severity, DiagnosticSeverity.Hint);
    });

    it('round-trips through batch mappers', () => {
      const original = [
        makeProtocolDiagnostic({ message: 'err1', severity: DiagnosticSeverity.Error }),
        makeProtocolDiagnostic({ message: 'err2', code: 'W1', source: 'src' }),
      ];
      const roundTripped = toProtocolDiagnostics(toCoreDiagnostics(original));
      assert.deepStrictEqual(roundTripped, original);
    });
  });
});
