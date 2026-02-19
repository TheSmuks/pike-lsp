/**
 * RXML Template Parser
 *
 * Parses HTML/XML template files containing RXML tags and extracts
 * tag information including name, type, attributes, and positions.
 *
 * This is Phase 2 of Roxen Framework Support - see ROXEN_SUPPORT_ROADMAP.md
 */

import { parseDocument } from 'htmlparser2';
import type { Range } from 'vscode-languageserver';

/**
 * Known RXML simple tags (self-closing, no content)
 *
 * These tags don't have closing tags and are typically used for
 * outputting values or performing side effects.
 */
const SIMPLE_TAGS = new Set([
    'output',
    'input',
    'config',
    'header',
    'cache',
    'insert',
    'date',
    'apre',
]);

/**
 * Known RXML container tags (have opening and closing tags)
 *
 * These tags wrap content and can contain nested RXML or HTML.
 */
const CONTAINER_TAGS = new Set([
    'set',
    'emit',
    'if',
    'elseif',
    'else',
    'roxen',
    'container',
    'contents',
    'then',
    'elseif',
    'for',
    'foreach',
    'while',
    'case',
    'switch',
    'default',
]);

/**
 * RXML tag information extracted from template
 */
export interface RXMLTag {
    /** Tag name (e.g., "set", "emit", "if") */
    name: string;
    /** Tag type - simple (self-closing) or container (has closing tag) */
    type: 'simple' | 'container';
    /** Position of the tag in the document */
    range: Range;
    /** Attributes defined on the tag */
    attributes: RXMLAttribute[];
    /** Nested child tags (only for container tags) */
    children?: RXMLTag[];
}

/**
 * RXML tag attribute
 */
export interface RXMLAttribute {
    /** Attribute name */
    name: string;
    /** Attribute value (unquoted) */
    value: string;
    /** Position of the attribute in the document */
    range: Range;
}

/**
 * Parse RXML template and extract all RXML tags
 *
 * For .rjs files (JavaScript with RXML), first extracts multiline strings
 * before parsing. For .rxml files, parses directly as HTML/XML.
 *
 * @param code - Template content (HTML/XML with RXML tags, or JS with RXML in strings)
 * @param uri - Document URI for error reporting
 * @returns Array of RXML tags found in the document
 */
export function parseRXMLTemplate(code: string, uri: string): RXMLTag[] {
    try {
        // Check if this is a .rjs file (JavaScript with embedded RXML)
        const isRJS = uri.endsWith('.rjs');

        let contentToParse = code;

        if (isRJS) {
            // For .rjs files, extract string literals that may contain RXML
            // This handles both template literals (`...`) and regular strings ("...")
            contentToParse = extractRXMLFromJavaScript(code);
        }

        const document = parseDocument(contentToParse, {
            withStartIndices: true,
            withEndIndices: true,
            xmlMode: true,  // RXML is XML-like with proper self-closing tags
            lowerCaseTags: true,
        });

        // Walk the DOM tree to find RXML tags with hierarchy preserved
        return walkDOM(document.children, contentToParse);
    } catch (error) {
        // Log parsing errors but don't fail - return empty array
        console.error(`Failed to parse RXML template in ${uri}:`, error);
        return [];
    }
}

/**
 * Walk DOM tree recursively and extract RXML tags with hierarchy
 *
 * @param nodes - DOM nodes to walk
 * @param sourceCode - Original source code for position calculations
 * @returns Array of RXML tags found (with nested children)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkDOM(nodes: any[], sourceCode: string): RXMLTag[] {
    const tags: RXMLTag[] = [];

    for (const node of nodes) {
        if (node.type === 'tag') {
            const tagName = node.name.toLowerCase();

            // Check if this is an RXML tag
            if (isRXMLTag(tagName)) {
                const tag = extractTagInfo(node, sourceCode);
                if (tag) {
                    // Recursively extract child tags
                    if (node.children && node.children.length > 0) {
                        tag.children = walkDOM(node.children, sourceCode);
                    }
                    tags.push(tag);
                }
            } else {
                // Not an RXML tag, but check its children for RXML tags
                if (node.children && node.children.length > 0) {
                    const childTags = walkDOM(node.children, sourceCode);
                    tags.push(...childTags);
                }
            }
        } else if (node.children && node.children.length > 0) {
            // Text node or other - check children
            const childTags = walkDOM(node.children, sourceCode);
            tags.push(...childTags);
        }
    }

    return tags;
}

/**
 * Extract tag information from DOM node
 *
 * @param node - DOM node from htmlparser2
 * @param sourceCode - Original source code
 * @returns RXML tag info or null if extraction fails
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTagInfo(node: any, sourceCode: string): RXMLTag | null {
    const tagName = node.name;

    // Determine if container or simple
    // Tag type is determined by the tag name, not by whether it has children
    // Container tags (set, emit, if, etc.) are always "container" type
    // Simple tags (output, config, etc.) are always "simple" type
    const isSimple = isContainerTag(tagName) === false;

    // Calculate range
    const range = calculateTagRange(node, sourceCode);

    // Extract attributes
    const attributes = getTagAttributes(node);

    return {
        name: tagName,
        type: isSimple ? 'simple' : 'container',
        range,
        attributes,
    };
}

/**
 * Calculate the range of a tag in the source code
 *
 * @param node - DOM node
 * @param sourceCode - Original source code
 * @returns Range covering the entire tag (open to close, or just open if self-closing)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateTagRange(node: any, sourceCode: string): Range {
    // htmlparser2 provides startIndex and endIndex for nodes
    // We need to convert these to line/column positions

    const startPos = positionAt(node.startIndex, sourceCode);
    const endPos = positionAt(node.endIndex, sourceCode);

    return {
        start: startPos,
        end: endPos,
    };
}

/**
 * Convert byte offset to line/column position
 *
 * @param offset - Character offset in source code
 * @param sourceCode - Source code text
 * @returns Position with line and character
 */
function positionAt(offset: number, sourceCode: string): { line: number; character: number } {
    let line = 0;
    let character = 0;

    for (let i = 0; i < offset && i < sourceCode.length; i++) {
        if (sourceCode[i] === '\n') {
            line++;
            character = 0;
        } else {
            character++;
        }
    }

    return { line, character };
}

/**
 * Extract attributes from a DOM node
 *
 * @param tagElement - DOM element node
 * @returns Array of attributes with ranges
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTagAttributes(tagElement: any): RXMLAttribute[] {
    const attributes: RXMLAttribute[] = [];

    if (!tagElement.attribs || typeof tagElement.attribs !== 'object') {
        return attributes;
    }

    // htmlparser2 doesn't provide attribute positions in the DOM
    // We'll return attributes without precise ranges for now
    // Future improvement: parse the source string to find attribute positions
    for (const [name, value] of Object.entries(tagElement.attribs)) {
        attributes.push({
            name,
            value: String(value),
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
            },
        });
    }

    return attributes;
}

/**
 * Check if a tag name is an RXML tag
 *
 * @param tagName - Tag name to check (lowercase)
 * @returns true if this is a known RXML tag
 */
function isRXMLTag(tagName: string): boolean {
    // Known RXML tags from Roxen documentation
    const knownTags = [
        // Control flow
        'if', 'elseif', 'else', 'then', 'case', 'switch', 'default',
        'for', 'foreach', 'while',

        // Output and variables
        'set', 'output', 'insert',

        // Database and queries
        'emit', 'sqlquery',

        // Page structure
        'roxen', 'container', 'contents',

        // Configuration
        'config', 'header',

        // Caching
        'cache',

        // Forms and input
        'input',

        // Date/time
        'date',

        // Other common RXML tags
        'apre', 'locale', 'referrer', 'user',
    ];

    return knownTags.includes(tagName);
}

/**
 * Check if a tag is a container tag (has closing tag)
 *
 * Defaults to true for unknown tags (safe default - assume it's a container)
 *
 * @param tagName - Tag name to check
 * @returns true if this is a container tag
 */
export function isContainerTag(tagName: string): boolean {
    const name = tagName.toLowerCase();

    // Known simple tags
    if (SIMPLE_TAGS.has(name)) {
        return false;
    }

    // Known container tags
    if (CONTAINER_TAGS.has(name)) {
        return true;
    }

    // Default to container for unknown tags (safe default)
    return true;
}

/**
 * Extract RXML content from JavaScript code
 *
 * For .rjs files, we need to extract template literals and strings that may
 * contain RXML tags. The challenge is that RXML itself uses quotes in attributes,
 * so we need to be careful to only extract JavaScript-level string delimiters.
 *
 * Strategy: Use a simple state machine to track JavaScript string boundaries
 *
 * @param code - JavaScript source code
 * @returns Concatenated string content from all string literals
 */
function extractRXMLFromJavaScript(code: string): string {
    const contents: string[] = [];
    let i = 0;

    while (i < code.length) {
        const char = code[i];

        // Skip single-line comments
        if (char === '/' && i + 1 < code.length && code[i + 1] === '/') {
            while (i < code.length && code[i] !== '\n') {
                i++;
            }
            i++;
            continue;
        }

        // Skip multi-line comments
        if (char === '/' && i + 1 < code.length && code[i + 1] === '*') {
            i += 2;
            while (i < code.length && !(code[i] === '*' && i + 1 < code.length && code[i + 1] === '/')) {
                i++;
            }
            i += 2;
            continue;
        }

        // Match template literals: `...`
        if (char === '`' && (i === 0 || code[i - 1] !== '\\')) {
            i++; // Skip opening backtick
            let content = '';

            while (i < code.length) {
                if (code[i] === '`' && code[i - 1] !== '\\') {
                    // Found closing backtick
                    contents.push(content);
                    break;
                }
                content += code[i];
                i++;
            }
            i++;
            continue;
        }

        // Match single-quoted strings: '...'
        if (char === '\'' && (i === 0 || code[i - 1] !== '\\')) {
            i++; // Skip opening quote
            let content = '';

            while (i < code.length) {
                if (code[i] === '\'' && code[i - 1] !== '\\') {
                    // Found closing quote
                    contents.push(content);
                    break;
                }
                content += code[i];
                i++;
            }
            i++;
            continue;
        }

        // Match double-quoted strings: "..."
        if (char === '"' && (i === 0 || code[i - 1] !== '\\')) {
            i++; // Skip opening quote
            let content = '';

            while (i < code.length) {
                if (code[i] === '"' && code[i - 1] !== '\\') {
                    // Found closing quote
                    contents.push(content);
                    break;
                }
                content += code[i];
                i++;
            }
            i++;
            continue;
        }

        i++;
    }

    // Join all extracted strings with newlines for parsing
    return contents.join('\n');
}

/**
 * Flatten hierarchical RXML tags into a single-level array
 *
 * Useful for tests or operations that need to process all tags without hierarchy
 *
 * @param tags - Array of RXML tags (may have nested children)
 * @returns Flat array of all tags
 */
export function flattenTags(tags: RXMLTag[]): RXMLTag[] {
    const result: RXMLTag[] = [];

    for (const tag of tags) {
        result.push(tag);
        if (tag.children && tag.children.length > 0) {
            result.push(...flattenTags(tag.children));
        }
    }

    return result;
}
