/**
 * Runtime response validation for Pike bridge responses.
 *
 * Pike's type system silently returns 0 for undefined properties.
 * TypeScript types are erased at runtime. This module provides
 * assertion functions that validate response shapes at the bridge
 * boundary, catching type mismatches before they propagate.
 *
 * @see ADR-012: Runtime Response Validation at Bridge Boundary
 */

import { PikeError } from '@pike-lsp/core';

/**
 * Error thrown when a Pike bridge response doesn't match expected shape.
 * Includes method name, field name, expected type, and actual value for
 * clear diagnostics.
 */
export class BridgeResponseError extends PikeError {
    readonly method: string;
    readonly field: string;

    constructor(method: string, field: string, expected: string, got: unknown) {
        const gotDesc = got === null ? 'null'
            : got === undefined ? 'undefined'
            : Array.isArray(got) ? `array(${(got as unknown[]).length})`
            : `${typeof got}(${String(got).substring(0, 50)})`;
        super(
            `Bridge '${method}': '${field}' expected ${expected}, got ${gotDesc}`
        );
        this.name = 'BridgeResponseError';
        this.method = method;
        this.field = field;
    }
}

/** Assert value is a non-null object (not array). */
export function assertObject(value: unknown, field: string, method: string): asserts value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new BridgeResponseError(method, field, 'object', value);
    }
}

/** Assert value is an array. */
export function assertArray(value: unknown, field: string, method: string): asserts value is unknown[] {
    if (!Array.isArray(value)) {
        throw new BridgeResponseError(method, field, 'array', value);
    }
}

/** Assert value is a string. */
export function assertString(value: unknown, field: string, method: string): asserts value is string {
    if (typeof value !== 'string') {
        throw new BridgeResponseError(method, field, 'string', value);
    }
}

/** Assert value is a number. */
export function assertNumber(value: unknown, field: string, method: string): asserts value is number {
    if (typeof value !== 'number') {
        throw new BridgeResponseError(method, field, 'number', value);
    }
}

/** Assert value is a boolean. */
export function assertBoolean(value: unknown, field: string, method: string): asserts value is boolean {
    if (typeof value !== 'boolean') {
        throw new BridgeResponseError(method, field, 'boolean', value);
    }
}

/** Assert every element in an array is a string. */
export function assertStringArray(value: unknown, field: string, method: string): asserts value is string[] {
    assertArray(value, field, method);
    for (let i = 0; i < value.length; i++) {
        if (typeof value[i] !== 'string') {
            throw new BridgeResponseError(method, `${field}[${i}]`, 'string', value[i]);
        }
    }
}

/** Validator function type for sendRequest. */
export type ResponseValidator<T> = (raw: unknown, method: string) => T;
