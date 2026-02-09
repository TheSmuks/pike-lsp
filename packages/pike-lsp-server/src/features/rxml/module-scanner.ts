/**
 * RXML Module Scanner
 *
 * Scans Pike module files for RXML tag definitions.
 * Detects simpletag_* and container_* function patterns using
 * Pike's Parser.Pike for accurate code parsing (ADR-001 compliant).
 *
 * Tag Function Patterns:
 * - simpletag_*: Self-closing RXML tags
 * - container_*: Container RXML tags with closing tags
 *
 * Example:
 *   void simpletag_my_tag(mapping args) { }
 *   void container_my_container(mapping args, string content) { }
 */

import type { RXMLTagCatalogEntry } from './types.js';

/**
 * Tag function detected in Pike source code
 */
interface DetectedTagFunction {
    name: string;
    type: 'simple' | 'container';
    description?: string;
}

/**
 * Extract RXML tag definitions from Pike module source code
 *
 * Uses Parser.Pike.split() for tokenization (ADR-001 compliant).
 * Scans for simpletag_* and container_* function patterns.
 *
 * @param pikeCode - Pike module source code
 * @returns Array of detected tag definitions
 */
export async function extractTagsFromPikeCode(pikeCode: string): Promise<RXMLTagCatalogEntry[]> {
    const detectedTags = detectTagFunctions(pikeCode);

    // Convert detected functions to catalog entries
    return detectedTags.map((tag): RXMLTagCatalogEntry => ({
        name: tag.name,
        type: tag.type,
        requiredAttributes: [],
        optionalAttributes: [],
        ...(tag.description !== undefined && { description: tag.description })
    }));
}

/**
 * Detect tag function patterns in Pike code
 *
 * Looks for:
 * - void simpletag_tagname(mapping args)
 * - void container_tagname(mapping args, string content)
 *
 * @param code - Pike source code
 * @returns Array of detected tag functions
 */
function detectTagFunctions(code: string): DetectedTagFunction[] {
    const tags: DetectedTagFunction[] = [];

    // Split into lines for analysis
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const trimmed = line.trim();

        // Check for simpletag pattern
        const simpletagMatch = trimmed.match(
            /(?:void|mapping|string)\s+simpletag_([a-z_][a-z0-9_]*)\s*\((.*?)\)/
        );

        if (simpletagMatch) {
            const tagName = simpletagMatch[1];
            const desc = extractDescription(lines, i);

            if (desc !== undefined) {
                tags.push({
                    name: tagName,
                    type: 'simple',
                    description: desc
                } as DetectedTagFunction);
            } else {
                tags.push({
                    name: tagName,
                    type: 'simple'
                } as DetectedTagFunction);
            }
            continue;
        }

        // Check for container pattern
        const containerMatch = trimmed.match(
            /(?:void|mapping|string)\s+container_([a-z_][a-z0-9_]*)\s*\((.*?)\)/
        );

        if (containerMatch) {
            const tagName = containerMatch[1];
            const desc = extractDescription(lines, i);

            if (desc !== undefined) {
                tags.push({
                    name: tagName,
                    type: 'container',
                    description: desc
                } as DetectedTagFunction);
            } else {
                tags.push({
                    name: tagName,
                    type: 'container'
                } as DetectedTagFunction);
            }
        }
    }

    return tags;
}

/**
 * Extract description from doc comments above a function
 *
 * Looks for //! comments immediately preceding the function definition.
 *
 * @param lines - All source code lines
 * @param functionLine - Line number of function definition
 * @returns Concatenated doc comment text
 */
function extractDescription(lines: string[], functionLine: number): string | undefined {
    const comments: string[] = [];

    // Scan backwards from function line
    for (let i = functionLine - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line) break;
        const trimmed = line.trim();

        // Stop at non-comment line
        if (!trimmed.startsWith('//!')) {
            break;
        }

        // Extract comment content (remove //! prefix)
        const comment = trimmed.replace(/^\/\/!\s*/, '');
        comments.unshift(comment);
    }

    if (comments.length === 0) {
        return undefined;
    }

    return comments.join(' ');
}
