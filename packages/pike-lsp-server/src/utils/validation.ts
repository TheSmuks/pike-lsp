/**
 * Type Guards and Validation Utilities for Pike Responses
 *
 * QUAL-003: Runtime type validation for data from Pike subprocess
 * Prevents crashes from malformed or unexpected responses.
 */

import type { PikeSymbol, PikeParseResult, PikeDiagnostic, PikePosition, TokenOccurrence, FindOccurrencesResult, BatchParseFileResult, BatchParseResult } from '@pike-lsp/pike-bridge';

/**
 * Type guard for PikePosition
 */
export function isPikePosition(obj: unknown): obj is PikePosition {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const pos = obj as Record<string, unknown>;
    return typeof pos['file'] === 'string' &&
           typeof pos['line'] === 'number';
}

/**
 * Type guard for PikeDiagnostic
 */
export function isPikeDiagnostic(obj: unknown): obj is PikeDiagnostic {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const diag = obj as Record<string, unknown>;
    return typeof diag['message'] === 'string' &&
           (diag['severity'] === 'error' || diag['severity'] === 'warning' || diag['severity'] === 'info') &&
           isPikePosition(diag['position']);
}

/**
 * Type guard for PikeSymbol
 */
export function isPikeSymbol(obj: unknown): obj is PikeSymbol {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const sym = obj as Record<string, unknown>;
    if (typeof sym['name'] !== 'string' || typeof sym['kind'] !== 'string') {
        return false;
    }
    // Optional position
    if (sym['position'] !== undefined && sym['position'] !== null) {
        if (!isPikePosition(sym['position'])) {
            return false;
        }
    }
    // Optional modifiers
    if (sym['modifiers'] !== undefined) {
        if (!Array.isArray(sym['modifiers'])) {
            return false;
        }
    }
    return true;
}

/**
 * Type guard for PikeParseResult
 */
export function isPikeParseResult(obj: unknown): obj is PikeParseResult {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const result = obj as Record<string, unknown>;

    if (!Array.isArray(result['symbols'])) {
        return false;
    }

    if (!Array.isArray(result['diagnostics'])) {
        return false;
    }

    // Validate symbols
    for (const sym of result['symbols']) {
        if (!isPikeSymbol(sym)) {
            return false;
        }
    }

    // Validate diagnostics
    for (const diag of result['diagnostics']) {
        if (!isPikeDiagnostic(diag)) {
            return false;
        }
    }

    return true;
}

/**
 * Type guard for TokenOccurrence
 */
export function isTokenOccurrence(obj: unknown): obj is TokenOccurrence {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const occ = obj as Record<string, unknown>;
    return typeof occ['text'] === 'string' &&
           typeof occ['line'] === 'number' &&
           typeof occ['character'] === 'number';
}

/**
 * Type guard for FindOccurrencesResult
 */
export function isFindOccurrencesResult(obj: unknown): obj is FindOccurrencesResult {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const result = obj as Record<string, unknown>;

    if (!Array.isArray(result['occurrences'])) {
        return false;
    }

    for (const occ of result['occurrences']) {
        if (!isTokenOccurrence(occ)) {
            return false;
        }
    }

    return true;
}

/**
 * Type guard for BatchParseFileResult
 */
export function isBatchParseFileResult(obj: unknown): obj is BatchParseFileResult {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const result = obj as Record<string, unknown>;

    if (typeof result['filename'] !== 'string') {
        return false;
    }

    if (!Array.isArray(result['symbols'])) {
        return false;
    }

    if (!Array.isArray(result['diagnostics'])) {
        return false;
    }

    return true;
}

/**
 * Type guard for BatchParseResult
 */
export function isBatchParseResult(obj: unknown): obj is BatchParseResult {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const result = obj as Record<string, unknown>;

    if (typeof result['count'] !== 'number') {
        return false;
    }

    if (!Array.isArray(result['results'])) {
        return false;
    }

    for (const fileResult of result['results']) {
        if (!isBatchParseFileResult(fileResult)) {
            return false;
        }
    }

    return true;
}

/**
 * Validate a Pike response and throw if invalid
 * @throws Error if the response doesn't match expected type
 */
export function validatePikeResponse<T>(obj: unknown, typeGuard: (obj: unknown) => obj is T, typeName: string): T {
    if (!typeGuard(obj)) {
        const received = obj === null ? 'null' : obj === undefined ? 'undefined' : typeof obj;
        throw new Error(`Invalid Pike response: expected type '${typeName}', but received ${received}. This may indicate a version mismatch between the Pike bridge and the LSP server, or the Pike subprocess crashed. Received data: ${JSON.stringify(obj).slice(0, 200)}`);
    }
    return obj;
}

/**
 * Safe array access with type validation
 * Returns empty array if input is not a valid array of expected type
 */
export function safeArray<T>(arr: unknown, typeGuard: (item: unknown) => item is T): T[] {
    if (!Array.isArray(arr)) {
        return [];
    }
    const result: T[] = [];
    for (const item of arr) {
        if (typeGuard(item)) {
            result.push(item);
        }
    }
    return result;
}
