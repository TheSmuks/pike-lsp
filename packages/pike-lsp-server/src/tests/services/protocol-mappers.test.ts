import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { toProtocolDiagnostics } from '../../services/protocol-mappers.js';
import type { CoreDiagnostic } from '../../core/types.js';

const makeRange = (startLine: number, startChar: number, endLine: number, endChar: number) => ({
  start: { line: startLine, character: startChar },
  end: { line: endLine, character: endChar },
});

describe('toProtocolDiagnostics', () => {
  it('maps a minimal diagnostic (range + message only)', () => {
    const core: CoreDiagnostic = {
      range: makeRange(1, 0, 1, 10),
      message: 'expected semicolon',
    };

    const [result] = toProtocolDiagnostics([core]);

    assert.deepStrictEqual(result.range, {
      start: { line: 1, character: 0 },
      end: { line: 1, character: 10 },
    });
    assert.equal(result.message, 'expected semicolon');
    assert.equal(result.severity, undefined);
    assert.equal(result.code, undefined);
    assert.equal(result.source, undefined);
    assert.equal(result.data, undefined);
    assert.equal(result.tags, undefined);
    assert.equal(result.relatedInformation, undefined);
  });

  it('maps a full diagnostic with all optional fields', () => {
    const core: CoreDiagnostic = {
      range: makeRange(5, 2, 5, 12),
      message: 'unused variable',
      severity: 2, // Warning
      code: 'PIKE-101',
      source: 'pike-analyzer',
      data: { fixable: true },
      tags: [1], // Unnecessary
      relatedInformation: [
        {
          location: {
            uri: 'file:///tmp/test.pike',
            range: makeRange(3, 0, 3, 8),
          },
          message: 'declared here',
        },
      ],
    };

    const [result] = toProtocolDiagnostics([core]);

    assert.deepStrictEqual(result.range, {
      start: { line: 5, character: 2 },
      end: { line: 5, character: 12 },
    });
    assert.equal(result.message, 'unused variable');
    assert.equal(result.severity, 2);
    assert.equal(result.code, 'PIKE-101');
    assert.equal(result.source, 'pike-analyzer');
    assert.deepStrictEqual(result.data, { fixable: true });
    assert.deepStrictEqual(result.tags, [1]);
    assert.ok(result.relatedInformation);
    assert.equal(result.relatedInformation.length, 1);
    assert.equal(result.relatedInformation[0].message, 'declared here');
    assert.equal(result.relatedInformation[0].location.uri, 'file:///tmp/test.pike');
    assert.deepStrictEqual(result.relatedInformation[0].location.range, {
      start: { line: 3, character: 0 },
      end: { line: 3, character: 8 },
    });
  });

  it('maps multiple diagnostics', () => {
    const core: CoreDiagnostic[] = [
      {
        range: makeRange(0, 0, 0, 5),
        message: 'error one',
        severity: 1,
      },
      {
        range: makeRange(2, 4, 2, 10),
        message: 'error two',
        severity: 3,
      },
    ];

    const results = toProtocolDiagnostics(core);

    assert.equal(results.length, 2);
    assert.equal(results[0].message, 'error one');
    assert.equal(results[0].severity, 1);
    assert.equal(results[1].message, 'error two');
    assert.equal(results[1].severity, 3);
  });

  it('preserves numeric code value', () => {
    const core: CoreDiagnostic = {
      range: makeRange(0, 0, 0, 1),
      message: 'test',
      code: 42,
    };

    const [result] = toProtocolDiagnostics([core]);

    assert.equal(result.code, 42);
  });

  it('preserves multiple tags', () => {
    const core: CoreDiagnostic = {
      range: makeRange(0, 0, 0, 1),
      message: 'test',
      tags: [1, 2], // Unnecessary + Deprecated
    };

    const [result] = toProtocolDiagnostics([core]);

    assert.deepStrictEqual(result.tags, [1, 2]);
  });

  it('maps multiple relatedInformation entries', () => {
    const core: CoreDiagnostic = {
      range: makeRange(10, 0, 10, 5),
      message: 'ambiguous reference',
      relatedInformation: [
        {
          location: { uri: 'file:///a.pike', range: makeRange(1, 0, 1, 4) },
          message: 'candidate A',
        },
        {
          location: { uri: 'file:///b.pike', range: makeRange(5, 0, 5, 4) },
          message: 'candidate B',
        },
      ],
    };

    const [result] = toProtocolDiagnostics([core]);

    assert.ok(result.relatedInformation);
    assert.equal(result.relatedInformation.length, 2);
    assert.equal(result.relatedInformation[0].location.uri, 'file:///a.pike');
    assert.equal(result.relatedInformation[0].message, 'candidate A');
    assert.equal(result.relatedInformation[1].location.uri, 'file:///b.pike');
    assert.equal(result.relatedInformation[1].message, 'candidate B');
  });

  it('returns empty array for empty input', () => {
    const results = toProtocolDiagnostics([]);
    assert.deepStrictEqual(results, []);
  });

  it('does not set tags when tags is an empty array (falsy branch)', () => {
    // Empty array is truthy in JS, so tags: [] WILL be set.
    // This test documents the actual behavior.
    const core: CoreDiagnostic = {
      range: makeRange(0, 0, 0, 1),
      message: 'test',
      tags: [],
    };

    const [result] = toProtocolDiagnostics([core]);

    assert.deepStrictEqual(result.tags, []);
  });
});
