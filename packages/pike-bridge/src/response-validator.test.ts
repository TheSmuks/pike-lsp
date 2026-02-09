import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    BridgeResponseError,
    assertObject,
    assertArray,
    assertString,
    assertNumber,
    assertBoolean,
    assertStringArray,
} from './response-validator.js';

describe('response-validator', () => {
    describe('BridgeResponseError', () => {
        it('should include method and field in message', () => {
            const err = new BridgeResponseError('get_pike_paths', 'include_paths', 'array', 0);
            assert.ok(err.message.includes('get_pike_paths'));
            assert.ok(err.message.includes('include_paths'));
            assert.ok(err.message.includes('array'));
            assert.strictEqual(err.method, 'get_pike_paths');
            assert.strictEqual(err.field, 'include_paths');
            assert.ok(err instanceof Error);
        });

        it('should describe null values', () => {
            const err = new BridgeResponseError('test', 'field', 'string', null);
            assert.ok(err.message.includes('null'));
        });

        it('should describe undefined values', () => {
            const err = new BridgeResponseError('test', 'field', 'string', undefined);
            assert.ok(err.message.includes('undefined'));
        });

        it('should describe array values', () => {
            const err = new BridgeResponseError('test', 'field', 'object', [1, 2, 3]);
            assert.ok(err.message.includes('array(3)'));
        });
    });

    describe('assertObject', () => {
        it('should pass for plain objects', () => {
            assert.doesNotThrow(() => assertObject({}, 'field', 'test'));
            assert.doesNotThrow(() => assertObject({ a: 1 }, 'field', 'test'));
        });

        it('should reject null', () => {
            assert.throws(() => assertObject(null, 'field', 'test'), BridgeResponseError);
        });

        it('should reject arrays', () => {
            assert.throws(() => assertObject([], 'field', 'test'), BridgeResponseError);
        });

        it('should reject primitives', () => {
            assert.throws(() => assertObject(0, 'field', 'test'), BridgeResponseError);
            assert.throws(() => assertObject('string', 'field', 'test'), BridgeResponseError);
        });
    });

    describe('assertArray', () => {
        it('should pass for arrays', () => {
            assert.doesNotThrow(() => assertArray([], 'field', 'test'));
            assert.doesNotThrow(() => assertArray([1, 2, 3], 'field', 'test'));
        });

        it('should reject non-arrays', () => {
            assert.throws(() => assertArray(0, 'field', 'test'), BridgeResponseError);
            assert.throws(() => assertArray(null, 'field', 'test'), BridgeResponseError);
            assert.throws(() => assertArray({}, 'field', 'test'), BridgeResponseError);
        });
    });

    describe('assertString', () => {
        it('should pass for strings', () => {
            assert.doesNotThrow(() => assertString('hello', 'field', 'test'));
            assert.doesNotThrow(() => assertString('', 'field', 'test'));
        });

        it('should reject non-strings', () => {
            assert.throws(() => assertString(0, 'field', 'test'), BridgeResponseError);
            assert.throws(() => assertString(null, 'field', 'test'), BridgeResponseError);
        });
    });

    describe('assertNumber', () => {
        it('should pass for numbers', () => {
            assert.doesNotThrow(() => assertNumber(42, 'field', 'test'));
            assert.doesNotThrow(() => assertNumber(0, 'field', 'test'));
        });

        it('should reject non-numbers', () => {
            assert.throws(() => assertNumber('42', 'field', 'test'), BridgeResponseError);
            assert.throws(() => assertNumber(null, 'field', 'test'), BridgeResponseError);
        });
    });

    describe('assertBoolean', () => {
        it('should pass for booleans', () => {
            assert.doesNotThrow(() => assertBoolean(true, 'field', 'test'));
            assert.doesNotThrow(() => assertBoolean(false, 'field', 'test'));
        });

        it('should reject non-booleans', () => {
            assert.throws(() => assertBoolean(0, 'field', 'test'), BridgeResponseError);
            assert.throws(() => assertBoolean(1, 'field', 'test'), BridgeResponseError);
        });
    });

    describe('assertStringArray', () => {
        it('should pass for string arrays', () => {
            assert.doesNotThrow(() => assertStringArray(['a', 'b'], 'field', 'test'));
            assert.doesNotThrow(() => assertStringArray([], 'field', 'test'));
        });

        it('should reject non-arrays', () => {
            assert.throws(() => assertStringArray(0, 'field', 'test'), BridgeResponseError);
        });

        it('should reject arrays with non-string elements', () => {
            assert.throws(() => assertStringArray(['a', 0], 'field', 'test'), BridgeResponseError);
        });

        it('should include element index in error for non-string elements', () => {
            try {
                assertStringArray(['ok', 42], 'paths', 'test');
                assert.fail('Should have thrown');
            } catch (err) {
                assert.ok(err instanceof BridgeResponseError);
                assert.ok(err.message.includes('paths[1]'));
            }
        });
    });

    describe('catches the exact bug scenario', () => {
        it('should catch Pike returning 0 instead of array', () => {
            const pikeResponse = { include_paths: 0, module_paths: 0 };

            assert.throws(
                () => assertStringArray(pikeResponse.include_paths, 'include_paths', 'get_pike_paths'),
                (err) => {
                    assert.ok(err instanceof BridgeResponseError);
                    assert.ok(err.message.includes('get_pike_paths'));
                    assert.ok(err.message.includes('include_paths'));
                    assert.ok(err.message.includes('array'));
                    return true;
                }
            );
        });
    });
});
