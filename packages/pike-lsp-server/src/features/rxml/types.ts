/**
 * RXML feature types
 */

import type { Range } from 'vscode-languageserver/node.js';

/**
 * RXML tag type - simple tags don't have closing tags, container tags do
 */
export type RXMLTagType = 'simple' | 'container';

/**
 * RXML attribute definition from catalog
 */
export interface RXMLAttribute {
  name: string;
  type: string;
  required: boolean;
  description: string;
  values?: string[]; // For enum-like attributes
}

/**
 * RXML tag information extracted from templates
 */
export interface RXMLTagInfo {
    /** Tag name (e.g., "set", "emit", "if") */
    name: string;
    /** Tag type - container or simple (self-closing) */
    type: 'simple' | 'container';
    /** Position in source code */
    position: {
        line: number;
        column: number;
    };
    /** Tag attributes (key-value pairs) */
    attributes: Record<string, string>;
    /** Whether tag is self-closing (e.g., <tag />) */
    isSelfClosing?: boolean;
    /** Whether container tag is missing closing tag */
    isUnclosed?: boolean;
}

/**
 * RXML tag catalog entry (known valid tags)
 */
export interface RXMLTagCatalogEntry {
    /** Tag name */
    name: string;
    /** Tag type */
    type: 'simple' | 'container';
    /** Required attributes */
    requiredAttributes: string[];
    /** Optional attributes */
    optionalAttributes: string[];
    /** Attributes with enumerated values */
    enumeratedAttributes?: Record<string, string[]>;
    /** Tag description */
    description?: string;
}

/**
 * RXML diagnostic (error/warning in RXML content)
 */
export interface RXMLDiagnostic {
    severity: 'error' | 'warning' | 'info';
    message: string;
    range: Range;
    code?: string;
}
