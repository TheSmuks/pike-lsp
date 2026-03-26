/**
 * RXML Diagnostics Tests - TDD Phase
 */

import assert from 'node:assert/strict';
import { describe, test } from 'bun:test';
import { validateRXMLDocument } from '../../../features/rxml/diagnostics.js';
import type { RXMLTagInfo } from '../../../features/rxml/types.js';

describe('RXML Diagnostics', () => {
  describe('Unknown tag detection', () => {
    test('Unknown tag <faketag> -> returns error diagnostic', async () => {
      const code = '<faketag>';
      const tags: RXMLTagInfo[] = [
        {
          name: 'faketag',
          type: 'simple',
          position: { line: 0, column: 0 },
          attributes: {},
        },
      ];

      const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
      assert.ok(diagnostics.length > 0, 'Should report diagnostic for unknown tag');
    });

    test('Known tag <set> -> no diagnostic', async () => {
      const code = '<set variable="foo">bar</set>';
      const tags: RXMLTagInfo[] = [
        {
          name: 'set',
          type: 'container',
          position: { line: 0, column: 0 },
          attributes: { variable: 'foo' },
        },
      ];

      const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
      const unknownTagDiag = diagnostics.find(
        d => d.message.includes('set') && d.message.includes('unknown')
      );
      assert.ok(!unknownTagDiag, 'Known tag <set> should not be reported as unknown');
    });
  });

  describe('Missing required attributes', () => {
    test('<set> without variable attribute -> error diagnostic', async () => {
      const code = '<set>value</set>';
      const tags: RXMLTagInfo[] = [
        {
          name: 'set',
          type: 'container',
          position: { line: 0, column: 0 },
          attributes: {},
        },
      ];

      const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
      const missingAttrDiag = diagnostics.find(
        d => d.message.includes('variable') && d.message.includes('required')
      );
      assert.ok(missingAttrDiag, 'Should report missing required "variable" attribute');
    });
  });

  describe('Unclosed container tags', () => {
    test('Container tag without closing tag -> error diagnostic', async () => {
      const code = '<set variable="foo">bar';
      const tags: RXMLTagInfo[] = [
        {
          name: 'set',
          type: 'container',
          position: { line: 0, column: 0 },
          attributes: { variable: 'foo' },
          isSelfClosing: false,
          isUnclosed: true,
        },
      ];

      const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
      const unclosedDiag = diagnostics.find(
        d => d.message.includes('Unclosed') && d.message.includes('set')
      );
      assert.ok(unclosedDiag, 'Should report unclosed container tag');
    });

    test('Properly closed container -> no diagnostic', async () => {
      const code = '<set variable="foo">bar</set>';
      const tags: RXMLTagInfo[] = [
        {
          name: 'set',
          type: 'container',
          position: { line: 0, column: 0 },
          attributes: { variable: 'foo' },
          isSelfClosing: false,
          isUnclosed: false,
        },
      ];

      const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
      const unclosedDiag = diagnostics.find(d => d.message.includes('Unclosed'));
      assert.ok(!unclosedDiag, 'Should not report unclosed for properly closed tag');
    });
  });

  describe('Edge cases', () => {
    test('Empty document -> no diagnostics', async () => {
      const code = '';
      const tags: RXMLTagInfo[] = [];

      const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
      assert.equal(diagnostics.length, 0, 'Empty document should have no diagnostics');
    });

    test('Debounced diagnostics failure logs and rejects instead of silently swallowing', async () => {
      const validationError = new Error('Injected RXML validation failure');
      const loggedErrors: Array<{ message: string; error?: unknown }> = [];
      const logger = {
        error: (message: string, error?: unknown) => {
          loggedErrors.push({ message, error });
        },
      };

      const brokenTag = {
        name: 'set',
        type: 'container',
        position: { line: 0, column: 0 },
        get attributes() {
          throw validationError;
        },
      } as unknown as RXMLTagInfo;

      await assert.rejects(validateRXMLDocument('<set>', 'test.rxml', [brokenTag], 0, logger), {
        message: 'Injected RXML validation failure',
      });

      assert.equal(loggedErrors.length, 1, 'Validation error should be logged once');
      assert.match(
        loggedErrors[0].message,
        /\[RXML Validation\] Error during validation for test\.rxml:/,
        'Logged message should include validation context and URI'
      );
      assert.strictEqual(
        loggedErrors[0].error,
        validationError,
        'Logger should receive the original error object'
      );
    });
  });
});
