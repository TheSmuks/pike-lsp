/**
 * RXML Completion Provider
 *
 * Provides completions for RXML template files:
 * - Tag names
 * - Tag attributes
 * - Attribute values
 */

import { CompletionParams, CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getTagInfo, RXML_TAG_CATALOG, SCOPE_VARIABLES } from './tag-catalog';

/**
 * Completion context types
 */
type CompletionContext =
  | { type: 'tag'; prefix: string }
  | { type: 'attribute'; tagName: string; prefix: string }
  | { type: 'value'; tagName: string; attrName: string; prefix: string }
  | { type: 'none' };

/**
 * Main entry point for RXML completions
 */
export function provideRXMLCompletions(
  params: CompletionParams,
  document: TextDocument
): CompletionItem[] | null {
  // Only provide completions for RXML files
  if (document.languageId !== 'rxml') {
    return null;
  }

  const content = document.getText();
  const offset = document.offsetAt(params.position);
  const context = detectCompletionContext(content, offset);

  if (context.type === 'none') {
    return null;
  }

  switch (context.type) {
    case 'tag':
      return getTagCompletions(context.prefix);
    case 'attribute':
      return getAttributeCompletions(context.tagName, context.prefix);
    case 'value':
      return getAttributeValueCompletions(context.tagName, context.attrName, context.prefix);
    default:
      return null;
  }
}

/**
 * Detect completion context from cursor position
 */
function detectCompletionContext(content: string, offset: number): CompletionContext {
  // Get text before cursor
  const before = content.substring(0, offset);

  // Find opening tag '<' before cursor
  const tagStart = before.lastIndexOf('<');
  if (tagStart === -1) {
    return { type: 'none' };
  }

  // Check if we're in content area (after a closing '>')
  const lastClose = before.lastIndexOf('>');
  if (lastClose > tagStart) {
    // We're after a closing tag, in content area
    return { type: 'none' };
  }

  const tagContent = before.substring(tagStart + 1);

  // Check if we're in a closing tag
  if (tagContent.startsWith('/')) {
    return { type: 'none' };
  }

  // Check if we're in a comment or special tag
  if (tagContent.startsWith('!') || tagContent.startsWith('?')) {
    return { type: 'none' };
  }

  // Check if cursor is in tag name position
  const firstSpace = tagContent.indexOf(' ');
  const firstEq = tagContent.indexOf('=');

  if (firstSpace === -1 && firstEq === -1) {
    // Inside tag name
    return { type: 'tag', prefix: tagContent };
  }

  // We're past the tag name, check for attribute context
  // Find the last '=' before cursor
  const lastEq = tagContent.lastIndexOf('=');

  if (lastEq !== -1) {
    // Check if we're after an '=' (attribute value context)
    const afterEq = tagContent.substring(lastEq + 1);
    // Check if there's a quote
    const quoteMatch = afterEq.match(/^['"]/);
    const hasClosingQuote = quoteMatch && afterEq.length > 1 && afterEq.endsWith(quoteMatch[0]);

    if (!hasClosingQuote || afterEq.endsWith(quoteMatch[0])) {
      // We're inside a value
      // Extract tag name and attribute name
      const tagAndAttrs = tagContent.substring(0, lastEq);
      const tagParts = tagAndAttrs.split(/\s+/);
      const tagName = tagParts[0] ?? '';

      // Find the attribute name before '='
      const attrMatch = tagAndAttrs.match(/(\w+)\s*=\s*[^=]*$/);
      if (attrMatch && attrMatch[1] !== undefined) {
        const attrName = attrMatch[1];
        const prefix = afterEq.replace(/^['"]|['"]$/g, '');
        return { type: 'value', tagName, attrName, prefix };
      }
    }
  }

  // We're in attribute name context
  // Extract tag name
  const parts = tagContent.split(/\s+/);
  const tagName = parts[0] ?? '';

  // Get the current prefix (partial attribute name)
  const lastPart = parts[parts.length - 1] || '';
  const prefix = lastPart.includes('=') ? '' : lastPart;

  return { type: 'attribute', tagName, prefix };
}

/**
 * Get tag name completions
 */
export function getTagCompletions(prefix: string): CompletionItem[] {
  const lowerPrefix = prefix.toLowerCase();

  return RXML_TAG_CATALOG
    .filter(tag => tag.name.toLowerCase().startsWith(lowerPrefix))
    .map(tag => ({
      label: tag.name,
      kind: CompletionItemKind.Function,
      detail: `${tag.type} tag`,
      documentation: {
        kind: 'markdown' as const,
        value: formatTagDocumentation(tag),
      },
      insertText: tag.name,
      sortText: getSortText(tag.name, prefix),
      deprecated: tag.deprecated,
    }))
    .sort((a, b) => a.sortText.localeCompare(b.sortText)) as CompletionItem[];
}

/**
 * Get attribute completions for a tag
 */
export function getAttributeCompletions(tagName: string, prefix: string): CompletionItem[] {
  const tag = getTagInfo(tagName);
  if (!tag) {
    return [];
  }

  const lowerPrefix = prefix.toLowerCase();

  return tag.attributes
    .filter(attr => attr.name.toLowerCase().startsWith(lowerPrefix))
    .map(attr => ({
      label: attr.name,
      kind: CompletionItemKind.Property,
      detail: `${attr.type}${attr.required ? ' (required)' : ''}`,
      documentation: {
        kind: 'markdown' as const,
        value: attr.description,
      },
      insertText: attr.name,
      insertTextFormat: 2 as const, // Snippet
      sortText: attr.required ? '0' : '1',
    }))
    .sort((a, b) => a.sortText.localeCompare(b.sortText));
}

/**
 * Get attribute value completions
 */
export function getAttributeValueCompletions(
  tagName: string,
  attrName: string,
  prefix: string
): CompletionItem[] {
  const tag = getTagInfo(tagName);
  if (!tag) {
    return [];
  }

  const attr = tag.attributes.find(a => a.name === attrName);
  if (!attr) {
    return [];
  }

  // If attribute has enum values, provide those
  if (attr.type === 'enum' && attr.values) {
    const lowerPrefix = prefix.toLowerCase();
    return attr.values
      .filter(value => value.toLowerCase().startsWith(lowerPrefix))
      .map(value => ({
        label: value,
        kind: CompletionItemKind.EnumMember,
        detail: attr.description,
        insertText: value,
      }));
  }

  // For 'variable' attribute, suggest scope variables
  if (attrName === 'variable' || attrName === 'from') {
    const lowerPrefix = prefix.toLowerCase();
    return SCOPE_VARIABLES
      .filter(v => v.toLowerCase().startsWith(lowerPrefix))
      .map(variable => ({
        label: variable,
        kind: CompletionItemKind.Variable,
        detail: 'Scope variable',
        insertText: variable,
      }));
  }

  // For boolean type, suggest true/false
  if (attr.type === 'boolean') {
    return [
      {
        label: 'true',
        kind: CompletionItemKind.Value,
        insertText: 'true',
      },
      {
        label: 'false',
        kind: CompletionItemKind.Value,
        insertText: 'false',
      },
    ];
  }

  // No specific suggestions
  return [];
}

/**
 * Format tag documentation as markdown
 */
function formatTagDocumentation(tag: ReturnType<typeof getTagInfo>): string {
  if (!tag) return '';

  let md = `**${tag.name}** (${tag.type})\n\n`;
  md += `${tag.description}\n\n`;

  if (tag.attributes.length > 0) {
    md += '**Attributes:**\n\n';
    for (const attr of tag.attributes) {
      const required = attr.required ? ' *(required)*' : '';
      md += `- \`${attr.name}\` (${attr.type})${required}: ${attr.description}\n`;
      if (attr.values) {
        md += `  - Values: ${attr.values.map(v => `\`${v}\``).join(', ')}\n`;
      }
    }
  }

  return md;
}

/**
 * Calculate sort text for better completion ordering
 */
function getSortText(label: string, prefix: string): string {
  if (label === prefix) {
    return '0'; // Exact match first
  } else if (label.startsWith(prefix)) {
    return '1'; // Prefix match second
  } else {
    return '2'; // Fuzzy match last
  }
}
