/**
 * RXML Diagnostics Provider
 *
 * Validates RXML template files for:
 * - Unknown RXML tags
 * - Missing required attributes
 * - Unclosed container tags
 * - Invalid attribute values
 */

import type { Diagnostic } from 'vscode-languageserver';
import type { RXMLTagInfo } from './types.js';

/**
 * RXML tag catalog with known tags and their attributes
 * This is a minimal catalog for Phase 2 - will be expanded in Phase 5
 */
const RXML_TAG_CATALOG: Record<string, {
    type: 'simple' | 'container';
    requiredAttributes: string[];
    optionalAttributes: string[];
    enumeratedAttributes?: Record<string, string[]>;
}> = {
    set: {
        type: 'container',
        requiredAttributes: ['variable'],
        optionalAttributes: ['scope', 'prestate'],
    },
    emit: {
        type: 'container',
        requiredAttributes: ['source'],
        optionalAttributes: ['query', 'rowinfo', 'scope'],
        enumeratedAttributes: {
            source: ['sql', 'file', 'dir', 'variables', 'users', 'groups'],
        },
    },
    if: {
        type: 'container',
        requiredAttributes: ['variable', 'matches'],
        optionalAttributes: ['scope'],
    },
    elseif: {
        type: 'container',
        requiredAttributes: ['variable', 'matches'],
        optionalAttributes: ['scope'],
    },
    else: {
        type: 'simple',
        requiredAttributes: [],
        optionalAttributes: [],
    },
    then: {
        type: 'container',
        requiredAttributes: [],
        optionalAttributes: [],
    },
    roxen: {
        type: 'container',
        requiredAttributes: [],
        optionalAttributes: [],
    },
    configimage: {
        type: 'simple',
        requiredAttributes: ['src'],
        optionalAttributes: ['alt', 'align', 'border'],
    },
    insert: {
        type: 'container',
        requiredAttributes: ['from'],
        optionalAttributes: ['variables', 'scope'],
    },
};

/**
 * Debounce timeouts per URI
 */
const debounceTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Main validation function for RXML documents
 * @param code - RXML source code
 * @param uri - Document URI
 * @param tags - Extracted RXML tags
 * @param debounceMs - Debounce timeout in milliseconds (default 500)
 * @returns Promise that resolves to array of diagnostics
 */
export async function validateRXMLDocument(
    _code: string,
    uri: string,
    tags: RXMLTagInfo[],
    debounceMs = 500
): Promise<Diagnostic[]> {
    return new Promise((resolve) => {
        const existingTimeout = debounceTimeouts.get(uri);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        const timeout = setTimeout(() => {
            const diagnostics: Diagnostic[] = [];

            // Check for unknown tags
            diagnostics.push(...checkUnknownTags(tags));

            // Check for missing required attributes
            for (const tag of tags) {
                diagnostics.push(...checkMissingRequiredAttributes(tag));
            }

            // Check for unclosed container tags
            diagnostics.push(...checkUnclosedContainerTags(tags));

            // Check for invalid attribute values
            for (const tag of tags) {
                diagnostics.push(...checkInvalidAttributeValues(tag));
            }

            resolve(diagnostics);
        }, debounceMs);

        debounceTimeouts.set(uri, timeout);
    });
}

/**
 * Check for unknown RXML tags
 * @param tags - Array of RXML tags
 * @returns Array of diagnostics for unknown tags
 */
export function checkUnknownTags(tags: RXMLTagInfo[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const tag of tags) {
        const knownTag = RXML_TAG_CATALOG[tag.name];
        if (!knownTag) {
            diagnostics.push({
                range: {
                    start: { line: tag.position.line, character: tag.position.column },
                    end: { line: tag.position.line, character: tag.position.column + tag.name.length + 1 },
                },
                severity: 1, // Error
                message: `Unknown RXML tag '<${tag.name}>'`,
                source: 'rxml',
            });
        }
    }

    return diagnostics;
}

/**
 * Check for missing required attributes on a tag
 * @param tag - RXML tag to check
 * @returns Array of diagnostics for missing required attributes
 */
export function checkMissingRequiredAttributes(tag: RXMLTagInfo): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const catalogEntry = RXML_TAG_CATALOG[tag.name];

    if (!catalogEntry) {
        return diagnostics; // Unknown tag - already reported by checkUnknownTags
    }

    for (const requiredAttr of catalogEntry.requiredAttributes) {
        if (!(requiredAttr in tag.attributes)) {
            diagnostics.push({
                range: {
                    start: { line: tag.position.line, character: tag.position.column },
                    end: { line: tag.position.line, character: tag.position.column + tag.name.length + 1 },
                },
                severity: 1, // Error
                message: `Tag '<${tag.name}>' is missing required attribute '${requiredAttr}'`,
                source: 'rxml',
            });
        }
    }

    return diagnostics;
}

/**
 * Check for unclosed container tags
 * @param tags - Array of RXML tags
 * @returns Array of diagnostics for unclosed container tags
 */
export function checkUnclosedContainerTags(tags: RXMLTagInfo[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const tag of tags) {
        // Check if this is a container tag that's unclosed
        if (tag.type === 'container' && tag.isUnclosed && !tag.isSelfClosing) {
            diagnostics.push({
                range: {
                    start: { line: tag.position.line, character: tag.position.column },
                    end: { line: tag.position.line, character: tag.position.column + tag.name.length + 1 },
                },
                severity: 1, // Error
                message: `Unclosed container tag '<${tag.name}>'`,
                source: 'rxml',
            });
        }
    }

    return diagnostics;
}

/**
 * Check for invalid attribute values (e.g., enumerated attributes with wrong values)
 * @param tag - RXML tag to check
 * @returns Array of diagnostics for invalid attribute values
 */
export function checkInvalidAttributeValues(tag: RXMLTagInfo): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const catalogEntry = RXML_TAG_CATALOG[tag.name];

    if (!catalogEntry || !catalogEntry.enumeratedAttributes) {
        return diagnostics;
    }

    for (const [attrName, validValues] of Object.entries(catalogEntry.enumeratedAttributes)) {
        const attrValue = tag.attributes[attrName];
        if (attrValue && !validValues.includes(attrValue)) {
            diagnostics.push({
                range: {
                    start: { line: tag.position.line, character: tag.position.column },
                    end: { line: tag.position.line, character: tag.position.column + tag.name.length + 1 },
                },
                severity: 2, // Warning
                message: `Invalid value '${attrValue}' for attribute '${attrName}' on tag '<${tag.name}>'. Valid values: ${validValues.join(', ')}`,
                source: 'rxml',
            });
        }
    }

    return diagnostics;
}
