/**
 * RXML Hover Provider
 *
 * Provides hover documentation for RXML tags and attributes:
 * - Hover over tag → show tag documentation from catalog
 * - Hover over attribute → show attribute type and description
 * - Hover over defvar → show variable info
 * - Hover over MODULE_* constant → show module type description
 *
 * Phase 6 of ROXEN_SUPPORT_ROADMAP.md
 */

import { Hover, MarkupKind, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getTagInfo } from './tag-catalog.js';

/**
 * Provide hover information for RXML document position
 *
 * @param document - Text document
 * @param position - Position to get hover for
 * @returns Hover result or null
 */
export async function provideRXMLHover(
  document: TextDocument,
  position: Position
): Promise<Hover | null> {
  const content = document.getText();
  const offset = document.offsetAt(position);

  // Check if we're hovering over a tag name
  const tagMatch = findTagAtPosition(content, offset);
  if (tagMatch) {
    return getTagHover(tagMatch.tagName);
  }

  // Check if we're hovering over an attribute name
  const attrMatch = findAttributeAtPosition(content, offset);
  if (attrMatch) {
    return getAttributeHover(attrMatch.tagName, attrMatch.attrName);
  }

  // Check if we're hovering over an RXML entity
  const entityMatch = findEntityAtPosition(content, offset);
  if (entityMatch) {
    return getEntityHover(entityMatch.entityName);
  }

  return null;
}

/**
 * Get hover documentation for a tag
 */
function getTagHover(tagName: string): Hover | null {
  const tagInfo = getTagInfo(tagName);

  if (!tagInfo) {
    // Unknown tag - provide minimal info
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${tagName}**\n\nUnknown RXML tag. This may be a custom tag defined in a Roxen module.`
      }
    };
  }

  // Build comprehensive tag documentation
  let markdown = `**${tagName}** (${tagInfo.type})\n\n`;
  markdown += `${tagInfo.description}\n\n`;

  if (tagInfo.attributes && tagInfo.attributes.length > 0) {
    markdown += `**Attributes:**\n\n`;
    for (const attr of tagInfo.attributes) {
      const required = attr.required ? ' **(required)**' : '';
      const type = attr.type ? ` \`${attr.type}\`` : '';
      markdown += `- \`${attr.name}\`${type}${required}: ${attr.description}\n`;

      if (attr.values && attr.values.length > 0) {
        markdown += `  - Values: ${attr.values.map(v => `\`${v}\``).join(', ')}\n`;
      }
    }
  }

  if (tagInfo.deprecated) {
    markdown += `\n⚠️ **Deprecated**: ${tagInfo.deprecated}\n`;
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: markdown
    }
  };
}

/**
 * Get hover documentation for an attribute
 */
function getAttributeHover(tagName: string, attrName: string): Hover | null {
  const tagInfo = getTagInfo(tagName);

  if (!tagInfo) {
    return null;
  }

  const attr = tagInfo.attributes?.find(a => a.name === attrName);

  if (!attr) {
    // Unknown attribute for this tag
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${attrName}**\n\nAttribute for \`${tagName}\` tag. Not in catalog - may be a custom attribute.`
      }
    };
  }

  let markdown = `**${attrName}**`;
  if (attr.type) {
    markdown += ` \`${attr.type}\`\n\n`;
  } else {
    markdown += '\n\n';
  }

  markdown += `${attr.description}\n\n`;

  if (attr.required) {
    markdown += `**Required**\n\n`;
  }

  if (attr.values && attr.values.length > 0) {
    markdown += `**Allowed values:**\n`;
    for (const value of attr.values) {
      markdown += `- \`${value}\`\n`;
    }
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: markdown
    }
  };
}

/**
 * Get hover documentation for an RXML entity
 */
function getEntityHover(entityName: string): Hover | null {
  const entityDocs: Record<string, string> = {
    'roxen': 'Roxen server entity. Provides access to server information and configuration.',
    'form': 'Form input entity. Access submitted form data.',
    'cache': 'Cache entity. Store and retrieve cached data.',
    'config': 'Configuration entity. Access server configuration values.',
    'usr': 'User entity. Access authenticated user information.',
    'page': 'Page entity. Access current page metadata.',
    'client': 'Client entity. Access client request information (browser, IP, etc.).',
    'date': 'Date/time entity. Format and display dates.',
    'header': 'HTTP header entity. Set response headers.',
    'insert': 'Insert entity. Include files or data.',
    'output': 'Output entity. Display variable values.',
  };

  const doc = entityDocs[entityName];

  if (!doc) {
    return null;
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: `**&${entityName}.***\n\n${doc}`
    }
  };
}

/**
 * Find tag at given offset
 */
function findTagAtPosition(content: string, offset: number): { tagName: string } | null {
  const before = content.substring(Math.max(0, offset - 100), offset);
  const tagMatch = before.match(/<(\w+)$/);
  if (tagMatch && tagMatch[1]) {
    return { tagName: tagMatch[1] };
  }

  // Check if we're inside a tag name
  const after = content.substring(offset, Math.min(content.length, offset + 50));
  const inTagMatch = before.match(/<(\w+)$/);
  if (inTagMatch && inTagMatch[1] && !after.match(/^\s*[^>\s]/)) {
    return { tagName: inTagMatch[1] };
  }

  return null;
}

/**
 * Find attribute at given offset
 */
function findAttributeAtPosition(content: string, offset: number): { tagName: string; attrName: string } | null {
  const before = content.substring(Math.max(0, offset - 200), offset);
  const attrMatch = before.match(/(\w+)\s*=\s*["']?[^"']*$/);
  if (attrMatch && attrMatch[1]) {
    // Try to find the tag name
    const tagMatch = before.match(/<(\w+)\s[^>]*$/);
    if (tagMatch && tagMatch[1]) {
      return { tagName: tagMatch[1], attrName: attrMatch[1] };
    }
  }

  return null;
}

/**
 * Find RXML entity at position (&roxen.*, &form.*, etc.)
 */
function findEntityAtPosition(content: string, offset: number): { entityName: string } | null {
  const before = content.substring(Math.max(0, offset - 50), offset);
  const entityMatch = before.match(/&(\w+)\.$/);

  if (entityMatch && entityMatch[1]) {
    return { entityName: entityMatch[1] };
  }

  return null;
}

/**
 * Get hover for MODULE_* constants (Pike-side)
 *
 * @param constantName - e.g., "MODULE_TAG", "MODULE_LOCATION"
 * @returns Hover documentation
 */
export function getModuleConstantHover(constantName: string): Hover | null {
  const moduleDocs: Record<string, string> = {
    'MODULE_TAG': 'Module provides custom RXML tags.',
    'MODULE_LOCATION': 'Module provides file location services.',
    'MODULE_PARSER': 'Module extends the RXML parser.',
    'MODULE_AUTH': 'Module provides authentication services.',
    'MODULE_DIRECTORY': 'Module provides directory listings.',
    'MODULE_FILE_EXTENSION': 'Module handles specific file extensions.',
    'MODULE_URL': 'Module provides URL mapping.',
    'MODULE_LOGGER': 'Module provides logging services.',
    'MODULE_PROXY': 'Module acts as a proxy.',
    'MODULE_FILTER': 'Module filters content.',
    'MODULE_LAST': 'Marker for last module type.',
  };

  const doc = moduleDocs[constantName];

  if (!doc) {
    return null;
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: `**${constantName}**\n\n${doc}`
    }
  };
}

/**
 * Get hover for defvar (Pike-side)
 *
 * @param defvarName - Variable name
 * @param defvarType - Variable type
 * @param documentation - Optional documentation
 * @returns Hover documentation
 */
export function getDefvarHover(
  defvarName: string,
  defvarType: string,
  documentation?: string
): Hover | null {
  let markdown = `**${defvarName}**`;
  if (defvarType) {
    markdown += ` \`${defvarType}\`\n\n`;
  } else {
    markdown += '\n\n';
  }

  if (documentation) {
    markdown += `${documentation}\n\n`;
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: markdown
    }
  };
}
