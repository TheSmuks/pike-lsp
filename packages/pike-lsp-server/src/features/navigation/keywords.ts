/**
 * Pike Language Keywords
 *
 * Built-in keywords for the Pike programming language with descriptions for hover provider.
 */

export interface PikeKeyword {
    name: string;
    category: 'type' | 'modifier' | 'control' | 'operator' | 'other';
    description: string;
}

/**
 * All Pike keywords with their categories and descriptions.
 */
export const PIKE_KEYWORDS: PikeKeyword[] = [
    // Type keywords
    { name: 'int', category: 'type', description: 'Integer type - whole numbers without decimal point' },
    { name: 'string', category: 'type', description: 'String type - sequence of characters' },
    { name: 'float', category: 'type', description: 'Floating-point type - numbers with decimal point' },
    { name: 'array', category: 'type', description: 'Array type - ordered list of values' },
    { name: 'mapping', category: 'type', description: 'Mapping type - associative array (key-value pairs)' },
    { name: 'multiset', category: 'type', description: 'Multiset type - set with optional duplicate tracking' },
    { name: 'object', category: 'type', description: 'Object type - instance of a class' },
    { name: 'function', category: 'type', description: 'Function type - callable with parameter and return types' },
    { name: 'program', category: 'type', description: 'Program type - a Pike program/class as data' },
    { name: 'mixed', category: 'type', description: 'Mixed type - any type' },
    { name: 'void', category: 'type', description: 'Void type - no return value' },
    { name: 'dynamic', category: 'type', description: 'Dynamic type - determined at runtime' },
    { name: 'auto', category: 'type', description: 'Auto type - type inferred from initializer' },

    // Modifier keywords
    { name: 'static', category: 'modifier', description: 'Static - method/variable only accessible within class' },
    { name: 'private', category: 'modifier', description: 'Private - member only accessible within defining class' },
    { name: 'public', category: 'modifier', description: 'Public - member accessible from anywhere (default)' },
    { name: 'protected', category: 'modifier', description: 'Protected - member accessible within class and subclasses' },
    { name: 'final', category: 'modifier', description: 'Final - member cannot be overridden in subclasses' },
    { name: 'local', category: 'modifier', description: 'Local - variable is local to the current scope' },
    { name: 'nomask', category: 'modifier', description: 'No mask - symbol cannot be overridden by inheritance' },
    { name: 'inline', category: 'modifier', description: 'Inline - hint to inline method body at call site' },
    { name: 'optional', category: 'modifier', description: 'Optional - method may not need to be implemented' },
    { name: 'variant', category: 'modifier', description: 'Variant - overloaded method based on argument types' },
    { name: 'const', category: 'modifier', description: 'Const - compile-time constant value' },
    { name: 'extern', category: 'modifier', description: 'Extern - symbol defined externally' },
    { name: 'deprecated', category: 'modifier', description: 'Deprecated - symbol should not be used' },

    // Control flow keywords
    { name: 'if', category: 'control', description: 'Conditional statement - executes code if condition is true' },
    { name: 'else', category: 'control', description: 'Else clause - executes code if previous condition was false' },
    { name: 'switch', category: 'control', description: 'Switch statement - multi-way branch based on value' },
    { name: 'case', category: 'control', description: 'Case clause - specific value in switch statement' },
    { name: 'default', category: 'control', description: 'Default clause - fallback case in switch statement' },
    { name: 'while', category: 'control', description: 'While loop - iterates while condition is true' },
    { name: 'do', category: 'control', description: 'Do-while loop - iterates at least once, then checks condition' },
    { name: 'for', category: 'control', description: 'For loop - iterate with initialization, condition, and update' },
    { name: 'foreach', category: 'control', description: 'Foreach loop - iterate over array/mapping elements' },
    { name: 'catch', category: 'control', description: 'Catch statement - catches exceptions from code block' },
    { name: 'gauge', category: 'control', description: 'Gauge expression - measures execution time of code' },
    { name: 'sscanf', category: 'control', description: 'Sscanf - parse string with format specifiers' },

    // Other keywords
    { name: 'return', category: 'other', description: 'Return statement - exit function and optionally return value' },
    { name: 'break', category: 'other', description: 'Break statement - exit loop or switch' },
    { name: 'continue', category: 'other', description: 'Continue statement - skip to next iteration of loop' },
    { name: 'class', category: 'other', description: 'Class definition - defines a new object type' },
    { name: 'interface', category: 'other', description: 'Interface definition - defines contract for classes' },
    { name: 'enum', category: 'other', description: 'Enum definition - set of named constant values' },
    { name: 'inherit', category: 'other', description: 'Inherit statement - include another class or module' },
    { name: 'import', category: 'other', description: 'Import statement - include symbols from module' },
    { name: 'lambda', category: 'other', description: 'Lambda expression - anonymous function' },
    { name: 'destruct', category: 'other', description: 'Destruct method - called when object is destroyed' },
    { name: 'new', category: 'other', description: 'New operator - create instance of class' },
    { name: 'this', category: 'other', description: 'This reference - reference to current object' },
    { name: 'typeof', category: 'other', description: 'Typeof operator - query or constrain type of expression' },
    { name: 'typed', category: 'other', description: 'Typed declaration - specify type in variable declarations' },
    { name: 'ref', category: 'other', description: 'Ref modifier - create reference to variable' },
    { name: 'aggregate', category: 'other', description: 'Aggregate operator - create array or mapping literal' },
    { name: 'autodoc', category: 'other', description: 'Autodoc attribute - marks documentation' },
];

/**
 * Map from keyword name to keyword info for O(1) lookup.
 */
export const KEYWORD_MAP: Map<string, PikeKeyword> = new Map(
    PIKE_KEYWORDS.map(kw => [kw.name, kw])
);

/**
 * Check if a word is a Pike keyword.
 */
export function isPikeKeyword(word: string): boolean {
    return KEYWORD_MAP.has(word);
}

/**
 * Get keyword info for a word.
 */
export function getKeywordInfo(word: string): PikeKeyword | undefined {
    return KEYWORD_MAP.get(word);
}
