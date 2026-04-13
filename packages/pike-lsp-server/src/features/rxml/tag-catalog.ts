/**
 * RXML Tag Catalog
 *
 * Public API for RXML tag metadata: types, lookup, and query functions.
 * Tag data is split across tag-catalog-output.ts, tag-catalog-content.ts,
 * and tag-catalog-advanced.ts to stay under the 500-line limit.
 *
 * Based on Roxen's RXML tag reference and source code.
 * Reference: docs/roxen/04-rxml-tag-reference.md
 */

// Types are defined in tag-catalog-types.ts to break circular deps with data files
export type { RXMLTagType, RXMLAttribute, RXMLTag } from './tag-catalog-types';
import type { RXMLTag, RXMLTagType } from './tag-catalog-types';

import { OUTPUT_AND_CONTROL_TAGS } from './tag-catalog-output';
import { CONTENT_AND_UTILITY_TAGS } from './tag-catalog-content';
import { ADVANCED_AND_MISC_TAGS } from './tag-catalog-advanced';

// Re-export data arrays for any consumer that needs direct access
export { OUTPUT_AND_CONTROL_TAGS } from './tag-catalog-output';
export { CONTENT_AND_UTILITY_TAGS } from './tag-catalog-content';
export { ADVANCED_AND_MISC_TAGS } from './tag-catalog-advanced';

/**
 * Complete catalog of built-in RXML tags
 */
export const RXML_TAG_CATALOG: RXMLTag[] = [
  ...OUTPUT_AND_CONTROL_TAGS,
  ...CONTENT_AND_UTILITY_TAGS,
  ...ADVANCED_AND_MISC_TAGS,
];

/**
 * Map of tag names to tag info for O(1) lookup (case-insensitive)
 */
const TAG_INFO_MAP = new Map<string, RXMLTag>();
for (const tag of RXML_TAG_CATALOG) {
  TAG_INFO_MAP.set(tag.name.toLowerCase(), tag);
}

/**
 * Get tag information by name (case-insensitive)
 *
 * @param tagName - Tag name to look up
 * @returns Tag info or undefined if not found
 *
 * @example
 * ```ts
 * const ifTag = getTagInfo('if');
 * // Returns: { name: 'if', type: 'container', ... }
 *
 * const uppercase = getTagInfo('IF');
 * // Same result (case-insensitive)
 *
 * const unknown = getTagInfo('nonexistent');
 * // Returns: undefined
 * ```
 */
export function getTagInfo(tagName: string): RXMLTag | undefined {
  return TAG_INFO_MAP.get(tagName.toLowerCase());
}

/**
 * Get all tags of a specific type
 *
 * @param type - Tag type to filter by
 * @returns Array of tags matching the type
 *
 * @example
 * ```ts
 * const containers = getTagsByType('container');
 * const simpleTags = getTagsByType('simple');
 * ```
 */
export function getTagsByType(type: RXMLTagType): RXMLTag[] {
  return RXML_TAG_CATALOG.filter(tag => tag.type === type);
}

/**
 * Search tags by name or description
 *
 * @param query - Search query
 * @returns Array of matching tags
 *
 * @example
 * ```ts
 * const sqlTags = searchTags('sql');
 * const cacheTags = searchTags('cache');
 * ```
 */
export function searchTags(query: string): RXMLTag[] {
  const lowerQuery = query.toLowerCase();
  return RXML_TAG_CATALOG.filter(
    tag => tag.name.includes(lowerQuery) || tag.description.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get deprecated tags
 *
 * @returns Array of deprecated tags
 */
export function getDeprecatedTags(): RXMLTag[] {
  return RXML_TAG_CATALOG.filter(tag => tag.deprecated);
}

/**
 * Common scope variables for attribute value completion
 * These are the built-in RXML scopes available for variable access
 */
export const SCOPE_VARIABLES = [
  'form',
  'variables',
  'page',
  'request',
  'session',
  'cookies',
  'client',
  'config',
  'roxen',
  'site',
  'user',
  'var',
] as const;

/**
 * Legacy compatibility function
 * @deprecated Use getTagInfo() instead
 */
export function hasTag(tagName: string): boolean {
  return getTagInfo(tagName) !== undefined;
}

/**
 * Get all tag names
 * @returns Array of all tag names
 */
export function getAllTagNames(): string[] {
  return RXML_TAG_CATALOG.map(tag => tag.name);
}
