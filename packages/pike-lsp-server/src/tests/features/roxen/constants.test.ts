import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import {
  MODULE_ZERO,
  MODULE_EXTENSION,
  MODULE_LOCATION,
  MODULE_URL,
  MODULE_FILE_EXTENSION,
  MODULE_TAG,
  MODULE_PARSER,
  MODULE_LAST,
  MODULE_FIRST,
  MODULE_AUTH,
  MODULE_MAIN_PARSER,
  MODULE_TYPES,
  MODULE_DIRECTORIES,
  MODULE_PROXY,
  MODULE_LOGGER,
  MODULE_FILTER,
  MODULE_PROVIDER,
  MODULE_USERDB,
  MODULE_DEPRECATED,
  MODULE_PROTOCOL,
  MODULE_CONFIG,
  MODULE_SECURITY,
  MODULE_EXPERIMENTAL,
  MODULE_TYPE_MASK,
  TYPE_STRING,
  TYPE_FILE,
  TYPE_INT,
  TYPE_DIR,
  TYPE_STRING_LIST,
  TYPE_MULTIPLE_STRING,
  TYPE_INT_LIST,
  TYPE_MULTIPLE_INT,
  TYPE_FLAG,
  TYPE_TOGGLE,
  TYPE_DIR_LIST,
  TYPE_FILE_LIST,
  TYPE_LOCATION,
  TYPE_TEXT_FIELD,
  TYPE_TEXT,
  TYPE_PASSWORD,
  TYPE_FLOAT,
  TYPE_MODULE,
  TYPE_FONT,
  TYPE_CUSTOM,
  TYPE_URL,
  TYPE_URL_LIST,
  VAR_TYPE_MASK,
  VAR_EXPERT,
  VAR_MORE,
  VAR_DEVELOPER,
  VAR_INITIAL,
  VAR_NOT_CFIF,
  VAR_INVISIBLE,
  VAR_PUBLIC,
  VAR_NO_DEFAULT,
  MODULE_CONSTANTS,
  TYPE_CONSTANTS,
  VAR_FLAGS,
} from '../../../features/roxen/constants.js';

describe('Roxen Constants', () => {
  describe('Module type bit positions', () => {
    it('MODULE_ZERO should be 0', () => {
      assert.equal(MODULE_ZERO, 0);
    });

    it('MODULE_EXTENSION should be 1<<0 (1)', () => {
      assert.equal(MODULE_EXTENSION, 1);
    });

    it('MODULE_LOCATION should be 1<<1 (2)', () => {
      assert.equal(MODULE_LOCATION, 2);
    });

    it('MODULE_URL should be 1<<2 (4)', () => {
      assert.equal(MODULE_URL, 4);
    });

    it('MODULE_FILE_EXTENSION should be 1<<3 (8)', () => {
      assert.equal(MODULE_FILE_EXTENSION, 8);
    });

    it('MODULE_TAG should be 1<<4 (16)', () => {
      assert.equal(MODULE_TAG, 16);
    });

    it('MODULE_LAST should be 1<<5 (32)', () => {
      assert.equal(MODULE_LAST, 32);
    });

    it('MODULE_FIRST should be 1<<6 (64)', () => {
      assert.equal(MODULE_FIRST, 64);
    });

    it('MODULE_AUTH should be 1<<7 (128)', () => {
      assert.equal(MODULE_AUTH, 128);
    });

    it('MODULE_MAIN_PARSER should be 1<<8 (256)', () => {
      assert.equal(MODULE_MAIN_PARSER, 256);
    });

    it('MODULE_TYPES should be 1<<9 (512)', () => {
      assert.equal(MODULE_TYPES, 512);
    });

    it('MODULE_DIRECTORIES should be 1<<10 (1024)', () => {
      assert.equal(MODULE_DIRECTORIES, 1024);
    });

    it('MODULE_PROXY should be 1<<11 (2048)', () => {
      assert.equal(MODULE_PROXY, 2048);
    });

    it('MODULE_LOGGER should be 1<<12 (4096)', () => {
      assert.equal(MODULE_LOGGER, 4096);
    });

    it('MODULE_FILTER should be 1<<13 (8192)', () => {
      assert.equal(MODULE_FILTER, 8192);
    });

    it('MODULE_PROVIDER should be 1<<15 (32768)', () => {
      assert.equal(MODULE_PROVIDER, 32768);
    });

    it('MODULE_USERDB should be 1<<16 (65536)', () => {
      assert.equal(MODULE_USERDB, 65536);
    });

    it('MODULE_DEPRECATED should be 1<<27', () => {
      assert.equal(MODULE_DEPRECATED, 1 << 27);
    });

    it('MODULE_PROTOCOL should be 1<<28', () => {
      assert.equal(MODULE_PROTOCOL, 1 << 28);
    });

    it('MODULE_CONFIG should be 1<<29', () => {
      assert.equal(MODULE_CONFIG, 1 << 29);
    });

    it('MODULE_SECURITY should be 1<<30', () => {
      assert.equal(MODULE_SECURITY, 1 << 30);
    });

    it('MODULE_EXPERIMENTAL should be 1<<31', () => {
      assert.equal(MODULE_EXPERIMENTAL, 1 << 31);
    });

    it('MODULE_TYPE_MASK should be (1<<27) - 1', () => {
      assert.equal(MODULE_TYPE_MASK, (1 << 27) - 1);
    });
  });

  describe('Module type aliases', () => {
    it('MODULE_TAG === MODULE_PARSER', () => {
      assert.equal(MODULE_TAG, MODULE_PARSER);
    });
  });

  describe('Variable type constants', () => {
    it('TYPE_STRING should be 1', () => {
      assert.equal(TYPE_STRING, 1);
    });

    it('TYPE_FILE should be 2', () => {
      assert.equal(TYPE_FILE, 2);
    });

    it('TYPE_INT should be 3', () => {
      assert.equal(TYPE_INT, 3);
    });

    it('TYPE_DIR should be 4', () => {
      assert.equal(TYPE_DIR, 4);
    });

    it('TYPE_STRING_LIST should be 5', () => {
      assert.equal(TYPE_STRING_LIST, 5);
    });

    it('TYPE_INT_LIST should be 6', () => {
      assert.equal(TYPE_INT_LIST, 6);
    });

    it('TYPE_FLAG should be 7', () => {
      assert.equal(TYPE_FLAG, 7);
    });

    it('TYPE_DIR_LIST should be 9', () => {
      assert.equal(TYPE_DIR_LIST, 9);
    });

    it('TYPE_FILE_LIST should be 10', () => {
      assert.equal(TYPE_FILE_LIST, 10);
    });

    it('TYPE_LOCATION should be 11', () => {
      assert.equal(TYPE_LOCATION, 11);
    });

    it('TYPE_TEXT_FIELD should be 13', () => {
      assert.equal(TYPE_TEXT_FIELD, 13);
    });

    it('TYPE_PASSWORD should be 14', () => {
      assert.equal(TYPE_PASSWORD, 14);
    });

    it('TYPE_FLOAT should be 15', () => {
      assert.equal(TYPE_FLOAT, 15);
    });

    it('TYPE_MODULE should be 17', () => {
      assert.equal(TYPE_MODULE, 17);
    });

    it('TYPE_FONT should be 19', () => {
      assert.equal(TYPE_FONT, 19);
    });

    it('TYPE_CUSTOM should be 20', () => {
      assert.equal(TYPE_CUSTOM, 20);
    });

    it('TYPE_URL should be 21', () => {
      assert.equal(TYPE_URL, 21);
    });

    it('TYPE_URL_LIST should be 22', () => {
      assert.equal(TYPE_URL_LIST, 22);
    });
  });

  describe('Variable type aliases', () => {
    it('TYPE_STRING_LIST === TYPE_MULTIPLE_STRING', () => {
      assert.equal(TYPE_STRING_LIST, TYPE_MULTIPLE_STRING);
    });

    it('TYPE_INT_LIST === TYPE_MULTIPLE_INT', () => {
      assert.equal(TYPE_INT_LIST, TYPE_MULTIPLE_INT);
    });

    it('TYPE_FLAG === TYPE_TOGGLE', () => {
      assert.equal(TYPE_FLAG, TYPE_TOGGLE);
    });

    it('TYPE_TEXT_FIELD === TYPE_TEXT', () => {
      assert.equal(TYPE_TEXT_FIELD, TYPE_TEXT);
    });
  });

  describe('Variable flag bit positions', () => {
    it('VAR_TYPE_MASK should be 0xff', () => {
      assert.equal(VAR_TYPE_MASK, 0xff);
    });

    it('VAR_EXPERT should be 1<<8 (256)', () => {
      assert.equal(VAR_EXPERT, 1 << 8);
    });

    it('VAR_MORE should be 1<<9 (512)', () => {
      assert.equal(VAR_MORE, 1 << 9);
    });

    it('VAR_DEVELOPER should be 1<<10 (1024)', () => {
      assert.equal(VAR_DEVELOPER, 1 << 10);
    });

    it('VAR_INITIAL should be 1<<11 (2048)', () => {
      assert.equal(VAR_INITIAL, 1 << 11);
    });

    it('VAR_NOT_CFIF should be 1<<12 (4096)', () => {
      assert.equal(VAR_NOT_CFIF, 1 << 12);
    });

    it('VAR_INVISIBLE should be 1<<13 (8192)', () => {
      assert.equal(VAR_INVISIBLE, 1 << 13);
    });

    it('VAR_PUBLIC should be 1<<14 (16384)', () => {
      assert.equal(VAR_PUBLIC, 1 << 14);
    });

    it('VAR_NO_DEFAULT should be 1<<15 (32768)', () => {
      assert.equal(VAR_NO_DEFAULT, 1 << 15);
    });
  });

  describe('MODULE_CONSTANTS metadata', () => {
    const expectedModuleConstants = [
      'MODULE_ZERO',
      'MODULE_EXTENSION',
      'MODULE_LOCATION',
      'MODULE_URL',
      'MODULE_FILE_EXTENSION',
      'MODULE_TAG',
      'MODULE_PARSER',
      'MODULE_LAST',
      'MODULE_FIRST',
      'MODULE_AUTH',
      'MODULE_MAIN_PARSER',
      'MODULE_TYPES',
      'MODULE_DIRECTORIES',
      'MODULE_PROXY',
      'MODULE_LOGGER',
      'MODULE_FILTER',
      'MODULE_PROVIDER',
      'MODULE_USERDB',
      'MODULE_DEPRECATED',
      'MODULE_PROTOCOL',
      'MODULE_CONFIG',
      'MODULE_SECURITY',
      'MODULE_EXPERIMENTAL',
    ];

    it('should contain all MODULE_* constants', () => {
      for (const name of expectedModuleConstants) {
        assert.ok(MODULE_CONSTANTS[name] !== undefined, `MODULE_CONSTANTS should contain ${name}`);
      }
    });

    it('MODULE_CONSTANTS.MODULE_TAG.value should equal MODULE_TAG', () => {
      assert.equal(MODULE_CONSTANTS.MODULE_TAG.value, MODULE_TAG);
    });

    it('MODULE_CONSTANTS.MODULE_PARSER.value should equal MODULE_PARSER', () => {
      assert.equal(MODULE_CONSTANTS.MODULE_PARSER.value, MODULE_PARSER);
    });

    it('MODULE_CONSTANTS.MODULE_FILTER.value should equal MODULE_FILTER', () => {
      assert.equal(MODULE_CONSTANTS.MODULE_FILTER.value, MODULE_FILTER);
    });

    it('MODULE_CONSTANTS.MODULE_DEPRECATED.value should equal MODULE_DEPRECATED', () => {
      assert.equal(MODULE_CONSTANTS.MODULE_DEPRECATED.value, MODULE_DEPRECATED);
    });

    it('each MODULE_CONSTANTS entry should have description', () => {
      for (const name of expectedModuleConstants) {
        assert.ok(
          MODULE_CONSTANTS[name]?.description !== undefined,
          `${name} should have description`
        );
      }
    });
  });

  describe('TYPE_CONSTANTS metadata', () => {
    const expectedTypeConstants = [
      'TYPE_STRING',
      'TYPE_FILE',
      'TYPE_INT',
      'TYPE_DIR',
      'TYPE_STRING_LIST',
      'TYPE_MULTIPLE_STRING',
      'TYPE_INT_LIST',
      'TYPE_MULTIPLE_INT',
      'TYPE_FLAG',
      'TYPE_TOGGLE',
      'TYPE_DIR_LIST',
      'TYPE_FILE_LIST',
      'TYPE_LOCATION',
      'TYPE_TEXT_FIELD',
      'TYPE_TEXT',
      'TYPE_PASSWORD',
      'TYPE_FLOAT',
      'TYPE_MODULE',
      'TYPE_FONT',
      'TYPE_CUSTOM',
      'TYPE_URL',
      'TYPE_URL_LIST',
    ];

    it('should contain all TYPE_* constants', () => {
      for (const name of expectedTypeConstants) {
        assert.ok(TYPE_CONSTANTS[name] !== undefined, `TYPE_CONSTANTS should contain ${name}`);
      }
    });

    it('TYPE_CONSTANTS.TYPE_STRING.value should equal TYPE_STRING', () => {
      assert.equal(TYPE_CONSTANTS.TYPE_STRING.value, TYPE_STRING);
    });

    it('TYPE_CONSTANTS.TYPE_FLAG.value should equal TYPE_FLAG', () => {
      assert.equal(TYPE_CONSTANTS.TYPE_FLAG.value, TYPE_FLAG);
    });

    it('TYPE_CONSTANTS.TYPE_TOGGLE.value should equal TYPE_TOGGLE', () => {
      assert.equal(TYPE_CONSTANTS.TYPE_TOGGLE.value, TYPE_TOGGLE);
    });

    it('TYPE_CONSTANTS.TYPE_TEXT_FIELD.value should equal TYPE_TEXT_FIELD', () => {
      assert.equal(TYPE_CONSTANTS.TYPE_TEXT_FIELD.value, TYPE_TEXT_FIELD);
    });

    it('each TYPE_CONSTANTS entry should have description', () => {
      for (const name of expectedTypeConstants) {
        assert.ok(
          TYPE_CONSTANTS[name]?.description !== undefined,
          `${name} should have description`
        );
      }
    });
  });

  describe('VAR_FLAGS metadata', () => {
    const expectedVarFlags = [
      'VAR_EXPERT',
      'VAR_MORE',
      'VAR_DEVELOPER',
      'VAR_INITIAL',
      'VAR_NOT_CFIF',
      'VAR_INVISIBLE',
      'VAR_PUBLIC',
      'VAR_NO_DEFAULT',
    ];

    it('should contain all VAR_* flags', () => {
      for (const name of expectedVarFlags) {
        assert.ok(VAR_FLAGS[name] !== undefined, `VAR_FLAGS should contain ${name}`);
      }
    });

    it('VAR_FLAGS.VAR_EXPERT.value should equal VAR_EXPERT', () => {
      assert.equal(VAR_FLAGS.VAR_EXPERT.value, VAR_EXPERT);
    });

    it('VAR_FLAGS.VAR_MORE.value should equal VAR_MORE', () => {
      assert.equal(VAR_FLAGS.VAR_MORE.value, VAR_MORE);
    });

    it('VAR_FLAGS.VAR_INVISIBLE.value should equal VAR_INVISIBLE', () => {
      assert.equal(VAR_FLAGS.VAR_INVISIBLE.value, VAR_INVISIBLE);
    });

    it('each VAR_FLAGS entry should have description', () => {
      for (const name of expectedVarFlags) {
        assert.ok(VAR_FLAGS[name]?.description !== undefined, `${name} should have description`);
      }
    });
  });
});
