/**
 * Pike Type Formatting Utilities
 *
 * Shared functions for formatting Pike types across multiple features.
 */

/**
 * Format a Pike type for display.
 * Handles complex types like OrType (unions), ObjectType, ArrayType etc.
 */
export function formatPikeType(typeObj: unknown): string {
    if (!typeObj || typeof typeObj !== 'object') {
        // Handle string type directly (from introspection returnType/argType)
        if (typeof typeObj === 'string') {
            return typeObj;
        }
        return 'mixed';
    }

    const t = typeObj as Record<string, unknown>;
    // Support both 'name' (from parse) and 'kind' (from introspection)
    const name = (t['name'] ?? t['kind']) as string | undefined;

    if (!name) {
        return 'mixed';
    }

    // Handle function types: name="function", returnType, argTypes
    if (name === 'function') {
        const returnType = t['returnType'] ? formatPikeType(t['returnType']) : 'mixed';
        const argTypes = t['argTypes'] as unknown[] | undefined;

        if (argTypes && argTypes.length > 0) {
            const params = argTypes.map((arg) => {
                const typeStr = formatPikeType(arg);
                // Check if this is a varargs parameter (type contains "..." or kind is "varargs")
                const isVarargs = typeStr.includes('...') ||
                    (typeof arg === 'object' && (arg as Record<string, unknown>)['kind'] === 'varargs');
                return isVarargs ? typeStr : `${typeStr} arg`;
            }).join(', ');
            return `function(${params})${returnType !== 'void' ? ` : ${returnType}` : ''}`;
        }
        return `function : ${returnType}`;
    }

    // Handle union types (OrType): name="or", types=[...]
    if (name === 'or' && Array.isArray(t['types'])) {
        const parts = (t['types'] as unknown[]).map(sub => formatPikeType(sub));
        return parts.join(' | ');
    }

    // Handle intersection types (AndType): name="and", types=[...]
    if (name === 'and' && Array.isArray(t['types'])) {
        const parts = (t['types'] as unknown[]).map(sub => formatPikeType(sub));
        return parts.join(' & ');
    }

    // Handle type attributes: __attribute__(deprecated) int
    if (name === '__attribute__') {
        const attribute = t['attribute'] ? String(t['attribute']) : '';
        const inner = t['type'] ? formatPikeType(t['type']) : 'mixed';
        const attrArgs = attribute ? attribute : '';
        return `__attribute__(${attrArgs}) ${inner}`;
    }

    // Handle object types: name="object", className="Gmp.mpz"
    if (name === 'object' && t['className']) {
        if (t['className'] === 'unknown') {
            return 'unknown';
        }
        return `object(${t['className']})`;
    }

    // Handle program types: name="program", className="..."
    if (name === 'program' && t['className']) {
        return `program(${t['className']})`;
    }

    // Handle array types: name="array", valueType={...}
    if (name === 'array' && t['valueType']) {
        return `array(${formatPikeType(t['valueType'])})`;
    }

    // Handle mapping types: name="mapping", indexType, valueType
    if (name === 'mapping') {
        const key = t['indexType'] ? formatPikeType(t['indexType']) : 'mixed';
        const val = t['valueType'] ? formatPikeType(t['valueType']) : 'mixed';
        return `mapping(${key}:${val})`;
    }

    // Handle bounded integer/string ranges (int(0..255), int(..255), int(0..))
    if ((name === 'int' || name === 'string') && (t['min'] || t['max'])) {
        const min = typeof t['min'] === 'string' ? t['min'] : '';
        const max = typeof t['max'] === 'string' ? t['max'] : '';
        return `${name}(${min}..${max})`;
    }

    // Handle varargs: support both `type` and `elementType` payloads
    if (name === 'varargs' && (t['type'] || t['elementType'])) {
        return `${formatPikeType(t['type'] ?? t['elementType'])}...`;
    }

    // Simple types: int, string, float, void, mixed, zero
    return name;
}

/**
 * Extract a class/module name from a Pike type object
 */
export function extractTypeName(typeObj: unknown): string | null {
    if (!typeObj || typeof typeObj !== 'object') {
        return null;
    }

    const t = typeObj as Record<string, unknown>;
    const name = t['name'] as string | undefined;

    if (!name) {
        return null;
    }

    // Direct object type
    if (name === 'object' && t['className']) {
        return t['className'] as string;
    }

    // Function return type
    if (t['kind'] === 'function' && t['returnType']) {
        return extractTypeName(t['returnType']);
    }

    // Object with name that's a class reference
    if (/^[A-Z][a-zA-Z0-9_]*/.test(name)) {
        return name;
    }

    return null;
}
