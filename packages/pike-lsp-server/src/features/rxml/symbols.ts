/**
 * RXML Document Symbol Provider
 *
 * Provides document symbols for RXML template files (outline view).
 * Converts parsed RXML tags into LSP DocumentSymbol format with proper hierarchy.
 *
 * Phase 2 of ROXEN_SUPPORT_ROADMAP.md
 */

import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { parseRXMLTemplate, type RXMLTag } from './parser.js';

/**
 * Convert RXML tag to DocumentSymbol
 *
 * @param tag - RXML tag with hierarchy info
 * @returns DocumentSymbol for the tag
 */
function tagToSymbol(tag: RXMLTag): DocumentSymbol {
  // Determine symbol kind based on tag type
  const kind = tag.type === 'container' ? SymbolKind.Class : SymbolKind.Function;

  // Build detail string from attributes (first 2-3 attributes)
  const detail = buildTagDetail(tag);

  // Convert children recursively if they exist
  const children = tag.children && tag.children.length > 0
    ? tag.children.map(tagToSymbol)
    : undefined;

  const result: DocumentSymbol = {
    name: tag.name,
    kind,
    range: tag.range,
    selectionRange: {
      start: tag.range.start,
      end: {
        line: tag.range.start.line,
        character: tag.range.start.character + tag.name.length
      }
    },
    detail,
  };

  // Only add children if they exist (for exactOptionalPropertyTypes compatibility)
  if (children) {
    result.children = children;
  }

  return result;
}

/**
 * Build detail string from tag attributes
 *
 * @param tag - RXML tag
 * @returns Detail string (e.g., 'variable="foo" source="sql"')
 */
function buildTagDetail(tag: RXMLTag): string {
  if (!tag.attributes || tag.attributes.length === 0) {
    return '';
  }

  // Show first 2-3 attributes as detail
  const attrs = tag.attributes.slice(0, 3).map(attr => {
    return `${attr.name}="${attr.value}"`;
  }).join(' ');

  // Add ellipsis if there are more attributes
  const suffix = tag.attributes.length > 3 ? ' ...' : '';
  return attrs + suffix;
}

/**
 * Provide document symbols for RXML template
 *
 * Parses RXML tags from the document and converts them to document symbols
 * with proper hierarchy for the outline view.
 *
 * The parser already provides hierarchical structure through the children
 * property, so we just convert to DocumentSymbol format.
 *
 * @param document - Text document to analyze
 * @returns Array of document symbols (top-level tags)
 */
export function provideRXMLSymbols(document: TextDocument): DocumentSymbol[] {
  const content = document.getText();
  const tags = parseRXMLTemplate(content, document.uri);

  // No tags found
  if (tags.length === 0) {
    return [];
  }

  // Convert to document symbols (parser already provides hierarchy via children)
  return tags.map(tagToSymbol);
}
