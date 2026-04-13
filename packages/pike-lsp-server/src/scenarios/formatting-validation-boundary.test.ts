import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { ErrorCodes, ResponseError } from 'vscode-languageserver/node.js';
import { FormattingService } from '../services/formatting-service.js';
import type { FormattingOptions } from '../services/formatting/formatting-profiles.js';

describe('validateFormattingOptions', () => {
  const service = new FormattingService();

  function expectInvalidParams(options: FormattingOptions, messageFragment: string) {
    try {
      service.validateFormattingOptions(options);
      assert.fail('Expected ResponseError with InvalidParams');
    } catch (err) {
      assert.ok(err instanceof ResponseError, `Expected ResponseError, got: ${err}`);
      assert.equal(err.code, ErrorCodes.InvalidParams);
      assert.ok(
        err.message.includes(messageFragment),
        `Expected message to include "${messageFragment}", got: "${err.message}"`
      );
    }
  }

  // --- tabSize boundary tests ---

  describe('tabSize', () => {
    it('rejects tabSize = 0', () => {
      expectInvalidParams({ tabSize: 0 }, 'tabSize must be between 1 and 16');
    });

    it('accepts tabSize = 1 (lower bound)', () => {
      service.validateFormattingOptions({ tabSize: 1 });
    });

    it('accepts tabSize = 16 (upper bound)', () => {
      service.validateFormattingOptions({ tabSize: 16 });
    });

    it('rejects tabSize = 17', () => {
      expectInvalidParams({ tabSize: 17 }, 'tabSize must be between 1 and 16');
    });

    it('rejects negative tabSize', () => {
      expectInvalidParams({ tabSize: -1 }, 'tabSize must be between 1 and 16');
    });

    it('rejects non-numeric tabSize (string)', () => {
      expectInvalidParams({ tabSize: '4' as unknown as number }, 'tabSize must be a number');
    });

    it('rejects non-numeric tabSize (boolean)', () => {
      expectInvalidParams({ tabSize: true as unknown as number }, 'tabSize must be a number');
    });
  });

  // --- insertSpaces tests ---

  describe('insertSpaces', () => {
    it('accepts insertSpaces = true', () => {
      service.validateFormattingOptions({ insertSpaces: true });
    });

    it('accepts insertSpaces = false', () => {
      service.validateFormattingOptions({ insertSpaces: false });
    });

    it('rejects non-boolean insertSpaces (string)', () => {
      expectInvalidParams(
        { insertSpaces: 'true' as unknown as boolean },
        'insertSpaces must be a boolean'
      );
    });

    it('rejects non-boolean insertSpaces (number)', () => {
      expectInvalidParams(
        { insertSpaces: 1 as unknown as boolean },
        'insertSpaces must be a boolean'
      );
    });
  });

  // --- maxLineLength tests ---

  describe('maxLineLength', () => {
    it('rejects negative maxLineLength', () => {
      expectInvalidParams({ maxLineLength: -1 }, 'maxLineLength must be between 0 and 200');
    });

    it('accepts maxLineLength = 0 (lower bound)', () => {
      service.validateFormattingOptions({ maxLineLength: 0 });
    });

    it('accepts maxLineLength = 200 (upper bound)', () => {
      service.validateFormattingOptions({ maxLineLength: 200 });
    });

    it('rejects maxLineLength = 201', () => {
      expectInvalidParams({ maxLineLength: 201 }, 'maxLineLength must be between 0 and 200');
    });

    it('rejects non-numeric maxLineLength (string)', () => {
      expectInvalidParams(
        { maxLineLength: '80' as unknown as number },
        'maxLineLength must be a number'
      );
    });
  });

  // --- braceStyle tests ---

  describe('braceStyle', () => {
    it('accepts braceStyle = "same-line"', () => {
      service.validateFormattingOptions({ braceStyle: 'same-line' });
    });

    it('accepts braceStyle = "new-line"', () => {
      service.validateFormattingOptions({ braceStyle: 'new-line' });
    });

    it('rejects invalid braceStyle string', () => {
      expectInvalidParams(
        { braceStyle: 'allman' as FormattingOptions['braceStyle'] },
        "braceStyle must be 'same-line' or 'new-line'"
      );
    });

    it('rejects empty string braceStyle', () => {
      expectInvalidParams(
        { braceStyle: '' as FormattingOptions['braceStyle'] },
        "braceStyle must be 'same-line' or 'new-line'"
      );
    });
  });

  // --- cross-field and empty options ---

  it('accepts empty options object', () => {
    service.validateFormattingOptions({});
  });

  it('rejects the first invalid field when multiple fields are wrong', () => {
    expectInvalidParams({ tabSize: 0, maxLineLength: -1 }, 'tabSize must be between 1 and 16');
  });
});
