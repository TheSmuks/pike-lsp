import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { formatPikeType, extractTypeName } from '../features/utils/pike-type-formatter.js';

describe('formatPikeType', () => {
  // ---------------------------------------------------------------------------
  // Null/undefined/edge case inputs
  // ---------------------------------------------------------------------------

  it('returns "mixed" for null input', () => {
    assert.strictEqual(formatPikeType(null), 'mixed');
  });

  it('returns "mixed" for undefined input', () => {
    assert.strictEqual(formatPikeType(undefined), 'mixed');
  });

  it('returns string directly for string input', () => {
    assert.strictEqual(formatPikeType('int'), 'int');
    assert.strictEqual(formatPikeType('string'), 'string');
    assert.strictEqual(formatPikeType('mapping'), 'mapping');
  });

  it('returns "mixed" for non-object primitive input', () => {
    assert.strictEqual(formatPikeType(42), 'mixed');
    assert.strictEqual(formatPikeType(true), 'mixed');
  });

  it('returns "mixed" for empty object', () => {
    assert.strictEqual(formatPikeType({}), 'mixed');
  });

  it('returns "mixed" for object without name or kind', () => {
    assert.strictEqual(formatPikeType({ foo: 'bar' }), 'mixed');
  });

  // ---------------------------------------------------------------------------
  // Simple types
  // ---------------------------------------------------------------------------

  it('formats simple int type', () => {
    assert.strictEqual(formatPikeType({ name: 'int' }), 'int');
  });

  it('formats simple string type', () => {
    assert.strictEqual(formatPikeType({ name: 'string' }), 'string');
  });

  it('formats simple float type', () => {
    assert.strictEqual(formatPikeType({ name: 'float' }), 'float');
  });

  it('formats void type', () => {
    assert.strictEqual(formatPikeType({ name: 'void' }), 'void');
  });

  it('formats mixed type', () => {
    assert.strictEqual(formatPikeType({ name: 'mixed' }), 'mixed');
  });

  it('formats zero type', () => {
    assert.strictEqual(formatPikeType({ name: 'zero' }), 'zero');
  });

  it('uses "kind" property as fallback for "name"', () => {
    // This comes from introspection data
    assert.strictEqual(formatPikeType({ kind: 'int' }), 'int');
    assert.strictEqual(formatPikeType({ kind: 'string' }), 'string');
  });

  // ---------------------------------------------------------------------------
  // Union types (OrType)
  // ---------------------------------------------------------------------------

  it('formats union types with "or"', () => {
    const formatted = formatPikeType({
      name: 'or',
      types: [{ name: 'int' }, { name: 'string' }],
    });
    assert.strictEqual(formatted, 'int | string');
  });

  it('formats union types with multiple alternatives', () => {
    const formatted = formatPikeType({
      name: 'or',
      types: [{ name: 'int' }, { name: 'string' }, { name: 'float' }],
    });
    assert.strictEqual(formatted, 'int | string | float');
  });

  it('formats nested union types', () => {
    const formatted = formatPikeType({
      name: 'or',
      types: [
        { name: 'int' },
        {
          name: 'or',
          types: [{ name: 'string' }, { name: 'float' }],
        },
      ],
    });
    assert.strictEqual(formatted, 'int | string | float');
  });

  // ---------------------------------------------------------------------------
  // Intersection types (AndType)
  // ---------------------------------------------------------------------------

  it('formats intersection types with "and"', () => {
    const formatted = formatPikeType({
      name: 'and',
      types: [{ name: 'A' }, { name: 'B' }],
    });
    assert.strictEqual(formatted, 'A & B');
  });

  it('formats intersection types with multiple types', () => {
    const formatted = formatPikeType({
      name: 'and',
      types: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    });
    assert.strictEqual(formatted, 'A & B & C');
  });

  // ---------------------------------------------------------------------------
  // Function types
  // ---------------------------------------------------------------------------

  it('formats function type without arguments', () => {
    const formatted = formatPikeType({
      name: 'function',
      returnType: { name: 'void' },
    });
    assert.strictEqual(formatted, 'function : void');
  });

  it('formats function type with single argument', () => {
    const formatted = formatPikeType({
      name: 'function',
      returnType: { name: 'int' },
      argTypes: [{ name: 'string' }],
    });
    assert.strictEqual(formatted, 'function(string arg) : int');
  });

  it('formats function type with multiple arguments', () => {
    const formatted = formatPikeType({
      name: 'function',
      returnType: { name: 'int' },
      argTypes: [{ name: 'string' }, { name: 'int' }],
    });
    assert.strictEqual(formatted, 'function(string arg, int arg) : int');
  });

  it('formats function type with void return (omitted)', () => {
    const formatted = formatPikeType({
      name: 'function',
      returnType: { name: 'void' },
      argTypes: [{ name: 'int' }],
    });
    assert.strictEqual(formatted, 'function(int arg)');
  });

  it('formats function type with mixed return type', () => {
    const formatted = formatPikeType({
      name: 'function',
      returnType: { name: 'mixed' },
    });
    assert.strictEqual(formatted, 'function : mixed');
  });

  it('formats function type with varargs parameter (type with ...)', () => {
    const formatted = formatPikeType({
      name: 'function',
      returnType: { name: 'void' },
      argTypes: [{ name: 'int' }, { name: 'mixed...' }],
    });
    assert.strictEqual(formatted, 'function(int arg, mixed...)');
  });

  it('formats function type with varargs parameter (kind=varargs)', () => {
    const formatted = formatPikeType({
      name: 'function',
      returnType: { name: 'void' },
      argTypes: [{ name: 'int' }, { kind: 'varargs', type: { name: 'string' } }],
    });
    assert.strictEqual(formatted, 'function(int arg, string...)');
  });

  it('formats function type with complex return type', () => {
    const formatted = formatPikeType({
      name: 'function',
      returnType: {
        name: 'or',
        types: [{ name: 'int' }, { name: 'string' }],
      },
      argTypes: [{ name: 'float' }],
    });
    assert.strictEqual(formatted, 'function(float arg) : int | string');
  });

  it('formats function type with complex argument types', () => {
    const formatted = formatPikeType({
      name: 'function',
      returnType: { name: 'void' },
      argTypes: [
        { name: 'array', valueType: { name: 'int' } },
        { name: 'mapping', indexType: { name: 'string' }, valueType: { name: 'int' } },
      ],
    });
    assert.strictEqual(formatted, 'function(array(int) arg, mapping(string:int) arg)');
  });

  // ---------------------------------------------------------------------------
  // Object types
  // ---------------------------------------------------------------------------

  it('formats object type with className', () => {
    const formatted = formatPikeType({
      name: 'object',
      className: 'Gmp.mpz',
    });
    assert.strictEqual(formatted, 'object(Gmp.mpz)');
  });

  it('formats object type with different className', () => {
    const formatted = formatPikeType({
      name: 'object',
      className: 'Sql.Sql',
    });
    assert.strictEqual(formatted, 'object(Sql.Sql)');
  });

  it('maps object(unknown) to "unknown"', () => {
    const formatted = formatPikeType({
      name: 'object',
      className: 'unknown',
    });
    assert.strictEqual(formatted, 'unknown');
  });

  it('returns "object" for object type without className', () => {
    const formatted = formatPikeType({ name: 'object' });
    assert.strictEqual(formatted, 'object');
  });

  // ---------------------------------------------------------------------------
  // Program types
  // ---------------------------------------------------------------------------

  it('formats program type with className', () => {
    const formatted = formatPikeType({
      name: 'program',
      className: 'MyModule.MyClass',
    });
    assert.strictEqual(formatted, 'program(MyModule.MyClass)');
  });

  it('returns "program" for program type without className', () => {
    const formatted = formatPikeType({ name: 'program' });
    assert.strictEqual(formatted, 'program');
  });

  // ---------------------------------------------------------------------------
  // Array types
  // ---------------------------------------------------------------------------

  it('formats array type with valueType', () => {
    const formatted = formatPikeType({
      name: 'array',
      valueType: { name: 'int' },
    });
    assert.strictEqual(formatted, 'array(int)');
  });

  it('formats array type with complex valueType', () => {
    const formatted = formatPikeType({
      name: 'array',
      valueType: { name: 'string' },
    });
    assert.strictEqual(formatted, 'array(string)');
  });

  it('formats nested array types', () => {
    const formatted = formatPikeType({
      name: 'array',
      valueType: {
        name: 'array',
        valueType: { name: 'int' },
      },
    });
    assert.strictEqual(formatted, 'array(array(int))');
  });

  it('returns "array" for array type without valueType', () => {
    const formatted = formatPikeType({ name: 'array' });
    assert.strictEqual(formatted, 'array');
  });

  // ---------------------------------------------------------------------------
  // Mapping types
  // ---------------------------------------------------------------------------

  it('formats mapping type with index and value types', () => {
    const formatted = formatPikeType({
      name: 'mapping',
      indexType: { name: 'string' },
      valueType: { name: 'int' },
    });
    assert.strictEqual(formatted, 'mapping(string:int)');
  });

  it('formats mapping type with complex types', () => {
    const formatted = formatPikeType({
      name: 'mapping',
      indexType: { name: 'int' },
      valueType: { name: 'string' },
    });
    assert.strictEqual(formatted, 'mapping(int:string)');
  });

  it('formats mapping type with missing indexType (defaults to mixed)', () => {
    const formatted = formatPikeType({
      name: 'mapping',
      valueType: { name: 'int' },
    });
    assert.strictEqual(formatted, 'mapping(mixed:int)');
  });

  it('formats mapping type with missing valueType (defaults to mixed)', () => {
    const formatted = formatPikeType({
      name: 'mapping',
      indexType: { name: 'string' },
    });
    assert.strictEqual(formatted, 'mapping(string:mixed)');
  });

  it('formats mapping type with no types (defaults to mixed:mixed)', () => {
    const formatted = formatPikeType({ name: 'mapping' });
    assert.strictEqual(formatted, 'mapping(mixed:mixed)');
  });

  // ---------------------------------------------------------------------------
  // Bounded integer ranges
  // ---------------------------------------------------------------------------

  it('formats int range with both bounds', () => {
    const formatted = formatPikeType({
      name: 'int',
      min: '0',
      max: '255',
    });
    assert.strictEqual(formatted, 'int(0..255)');
  });

  it('formats int range with only min', () => {
    const formatted = formatPikeType({
      name: 'int',
      min: '1',
    });
    assert.strictEqual(formatted, 'int(1..)');
  });

  it('formats int range with only max', () => {
    const formatted = formatPikeType({
      name: 'int',
      max: '255',
    });
    assert.strictEqual(formatted, 'int(..255)');
  });

  // ---------------------------------------------------------------------------
  // Bounded string ranges
  // ---------------------------------------------------------------------------

  it('formats string range with both bounds', () => {
    const formatted = formatPikeType({
      name: 'string',
      min: '0',
      max: '255',
    });
    assert.strictEqual(formatted, 'string(0..255)');
  });

  it('formats string range with only min', () => {
    const formatted = formatPikeType({
      name: 'string',
      min: '1',
    });
    assert.strictEqual(formatted, 'string(1..)');
  });

  it('formats string range with only max', () => {
    const formatted = formatPikeType({
      name: 'string',
      max: '255',
    });
    assert.strictEqual(formatted, 'string(..255)');
  });

  // ---------------------------------------------------------------------------
  // Varargs types
  // ---------------------------------------------------------------------------

  it('formats varargs with type property', () => {
    const formatted = formatPikeType({
      name: 'varargs',
      type: { name: 'int' },
    });
    assert.strictEqual(formatted, 'int...');
  });

  it('formats varargs with elementType property', () => {
    const formatted = formatPikeType({
      name: 'varargs',
      elementType: { name: 'string' },
    });
    assert.strictEqual(formatted, 'string...');
  });

  it('prefers type over elementType', () => {
    const formatted = formatPikeType({
      name: 'varargs',
      type: { name: 'int' },
      elementType: { name: 'string' },
    });
    assert.strictEqual(formatted, 'int...');
  });

  // ---------------------------------------------------------------------------
  // Attribute types
  // ---------------------------------------------------------------------------

  it('formats __attribute__ with attribute name', () => {
    const formatted = formatPikeType({
      name: '__attribute__',
      attribute: 'deprecated',
      type: { name: 'int' },
    });
    assert.strictEqual(formatted, '__attribute__(deprecated) int');
  });

  it('formats __attribute__ without attribute', () => {
    const formatted = formatPikeType({
      name: '__attribute__',
      type: { name: 'string' },
    });
    assert.strictEqual(formatted, '__attribute__() string');
  });

  it('formats __attribute__ without type (defaults to mixed)', () => {
    const formatted = formatPikeType({
      name: '__attribute__',
      attribute: 'deprecated',
    });
    assert.strictEqual(formatted, '__attribute__(deprecated) mixed');
  });

  // ---------------------------------------------------------------------------
  // Complex nested types
  // ---------------------------------------------------------------------------

  it('formats nested array in mapping', () => {
    const formatted = formatPikeType({
      name: 'mapping',
      indexType: { name: 'string' },
      valueType: {
        name: 'array',
        valueType: { name: 'int' },
      },
    });
    assert.strictEqual(formatted, 'mapping(string:array(int))');
  });

  it('formats nested union in array', () => {
    const formatted = formatPikeType({
      name: 'array',
      valueType: {
        name: 'or',
        types: [{ name: 'int' }, { name: 'string' }],
      },
    });
    assert.strictEqual(formatted, 'array(int | string)');
  });

  it('formats intersection in mapping', () => {
    const formatted = formatPikeType({
      name: 'mapping',
      indexType: {
        name: 'and',
        types: [{ name: 'A' }, { name: 'B' }],
      },
      valueType: { name: 'int' },
    });
    assert.strictEqual(formatted, 'mapping(A & B:int)');
  });

  it('formats function returning array', () => {
    const formatted = formatPikeType({
      name: 'function',
      returnType: {
        name: 'array',
        valueType: { name: 'string' },
      },
      argTypes: [{ name: 'int' }],
    });
    assert.strictEqual(formatted, 'function(int arg) : array(string)');
  });
});

describe('extractTypeName', () => {
  // ---------------------------------------------------------------------------
  // Null/undefined inputs
  // ---------------------------------------------------------------------------

  it('returns null for null input', () => {
    assert.strictEqual(extractTypeName(null), null);
  });

  it('returns null for undefined input', () => {
    assert.strictEqual(extractTypeName(undefined), null);
  });

  it('returns null for non-object input', () => {
    assert.strictEqual(extractTypeName('string'), null);
    assert.strictEqual(extractTypeName(42), null);
    assert.strictEqual(extractTypeName(true), null);
  });

  it('returns null for object without name', () => {
    assert.strictEqual(extractTypeName({}), null);
    assert.strictEqual(extractTypeName({ foo: 'bar' }), null);
  });

  // ---------------------------------------------------------------------------
  // Object types
  // ---------------------------------------------------------------------------

  it('extracts className from object type', () => {
    const result = extractTypeName({
      name: 'object',
      className: 'Gmp.mpz',
    });
    assert.strictEqual(result, 'Gmp.mpz');
  });

  it('extracts className from object type with simple name', () => {
    const result = extractTypeName({
      name: 'object',
      className: 'Sql',
    });
    assert.strictEqual(result, 'Sql');
  });

  it('returns null for object type without className', () => {
    const result = extractTypeName({ name: 'object' });
    assert.strictEqual(result, null);
  });

  // ---------------------------------------------------------------------------
  // Function types (return type extraction)
  // ---------------------------------------------------------------------------

  it('extracts type from function returnType', () => {
    const result = extractTypeName({
      name: 'function',
      kind: 'function',
      returnType: {
        name: 'object',
        className: 'MyClass',
      },
    });
    assert.strictEqual(result, 'MyClass');
  });

  it('returns null for function without returnType', () => {
    const result = extractTypeName({
      name: 'function',
      kind: 'function',
    });
    assert.strictEqual(result, null);
  });

  it('returns null when returnType has no extractable name', () => {
    const result = extractTypeName({
      name: 'function',
      kind: 'function',
      returnType: { name: 'int' },
    });
    assert.strictEqual(result, null);
  });

  it('returns null when name is missing (early exit)', () => {
    const result = extractTypeName({
      kind: 'function',
      returnType: {
        name: 'object',
        className: 'MyClass',
      },
    });
    assert.strictEqual(result, null);
  });

  // ---------------------------------------------------------------------------
  // Direct class references (uppercase names)
  // ---------------------------------------------------------------------------

  it('extracts name that starts with uppercase (class reference)', () => {
    const result = extractTypeName({ name: 'MyClass' });
    assert.strictEqual(result, 'MyClass');
  });

  it('extracts qualified class name (Module.Class)', () => {
    const result = extractTypeName({ name: 'MyModule.MyClass' });
    assert.strictEqual(result, 'MyModule.MyClass');
  });

  it('extracts class name with numbers', () => {
    const result = extractTypeName({ name: 'Class123' });
    assert.strictEqual(result, 'Class123');
  });

  it('returns null for lowercase name (not a class)', () => {
    const result = extractTypeName({ name: 'int' });
    assert.strictEqual(result, null);
  });

  it('returns null for name starting with lowercase', () => {
    const result = extractTypeName({ name: 'myClass' });
    assert.strictEqual(result, null);
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('returns null for simple types', () => {
    assert.strictEqual(extractTypeName({ name: 'int' }), null);
    assert.strictEqual(extractTypeName({ name: 'string' }), null);
    assert.strictEqual(extractTypeName({ name: 'float' }), null);
    assert.strictEqual(extractTypeName({ name: 'void' }), null);
    assert.strictEqual(extractTypeName({ name: 'mixed' }), null);
  });

  it('returns null for array types', () => {
    const result = extractTypeName({
      name: 'array',
      valueType: { name: 'int' },
    });
    assert.strictEqual(result, null);
  });

  it('returns null for mapping types', () => {
    const result = extractTypeName({
      name: 'mapping',
      indexType: { name: 'string' },
      valueType: { name: 'int' },
    });
    assert.strictEqual(result, null);
  });
});
