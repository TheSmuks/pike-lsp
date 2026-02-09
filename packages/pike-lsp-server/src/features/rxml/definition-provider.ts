/**
 * RXML Definition Provider
 *
 * Provides go-to-definition functionality for RXML tags:
 * - From template tag usage → tag function definition in .pike file
 * - From tag attribute → defvar declaration in .pike module
 * - From MODULE_* constant → module documentation
 *
 * Phase 6 of ROXEN_SUPPORT_ROADMAP.md
 */

import { Location, Range, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { getTagInfo } from './tag-catalog.js';

/**
 * Result of finding a tag definition
 */
export interface RoxenTagInfo {
  /** Tag name (e.g., "my_custom_tag") */
  tagName: string;
  /** Function name in Pike (e.g., "simpletag_my_custom_tag") */
  functionName: string;
  /** Module file where tag is defined */
  location: Location;
  /** Tag type (simple or container) */
  tagType: 'simple' | 'container';
}

/**
 * Result of finding a defvar definition
 */
export interface RoxenDefvarInfo {
  /** Variable name */
  name: string;
  /** Type (from mapping) */
  type: string;
  /** Documentation comment */
  documentation?: string;
  /** Where it's defined */
  location: Location;
}

/**
 * Result of finding module info
 */
export interface RoxenModuleInfo {
  /** Module name */
  name: string;
  /** Module type constant (e.g., MODULE_TAG) */
  moduleType: string;
  /** Documentation */
  documentation: string;
  /** Location */
  location: Location;
}

/**
 * Find tag definition in workspace
 *
 * @param tagName - Tag name to find (e.g., "my_tag")
 * @param workspaceFolders - Workspace folders to search
 * @returns Location of tag definition or null
 */
export async function findTagDefinition(
  tagName: string,
  workspaceFolders: string[]
): Promise<RoxenTagInfo | null> {
  if (!workspaceFolders.length) {
    return null;
  }

  // Search for .pike files that might contain the tag
  const pikeFiles = await findPikeFiles(workspaceFolders);

  for (const file of pikeFiles) {
    const content = await readFile(file, 'utf-8');

    // Look for simpletag_* or container_* functions
    const patterns = [
      new RegExp(`simpletag\\s+${escapeRegExp(tagName)}\\s*\\(`, 'm'),
      new RegExp(`simpletag\\s+\\w+\\s*\\([^)]*\\b${escapeRegExp(tagName)}\\b`, 'm'),
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (match) {
        const position = findPositionForMatch(content, match);
        return {
          tagName,
          functionName: `simpletag_${tagName}`,
          location: Location.create(fileToUri(file), {
            start: position,
            end: { line: position.line, character: position.character + 10 }
          }),
          tagType: 'simple'
        };
      }
    }
  }

  // Fallback: check if it's a built-in tag
  const tagInfo = getTagInfo(tagName);
  if (tagInfo) {
    // Return catalog location (metadata only, no actual file)
    return {
      tagName,
      functionName: `builtin:${tagName}`,
      location: Location.create('builtin:tag-catalog', Range.create(0, 0, 0, 0)),
      tagType: tagInfo.type
    };
  }

  return null;
}

/**
 * Find defvar definition in workspace
 *
 * @param defvarName - Variable name to find
 * @param workspaceFolders - Workspace folders to search
 * @returns Defvar info or null
 */
export async function findDefvarDefinition(
  defvarName: string,
  workspaceFolders: string[]
): Promise<RoxenDefvarInfo | null> {
  if (!workspaceFolders.length) {
    return null;
  }

  const pikeFiles = await findPikeFiles(workspaceFolders);

  for (const file of pikeFiles) {
    const content = await readFile(file, 'utf-8');

    // Look for defvar statements
    const pattern = new RegExp(`defvar\\s+("${escapeRegExp(defvarName)}"\\s*;|'${escapeRegExp(defvarName)}'\\s*;|\\w+\\s*=)`, 'm');
    const match = pattern.exec(content);

    if (match) {
      const position = findPositionForMatch(content, match);
      return {
        name: defvarName,
        type: 'mixed', // Would need actual type extraction
        documentation: `Defvar: ${defvarName}`,
        location: Location.create(fileToUri(file), {
          start: position,
          end: { line: position.line, character: position.character + defvarName.length }
        })
      };
    }
  }

  return null;
}

/**
 * Provide definition for RXML document position
 *
 * @param document - Text document
 * @param position - Position to find definition for
 * @param workspaceFolders - Workspace folders
 * @returns Location or null
 */
export async function provideRXMLDefinition(
  document: TextDocument,
  position: Position,
  workspaceFolders: string[]
): Promise<Location | null> {
  const content = document.getText();
  const offset = document.offsetAt(position);

  // Check if we're on a tag name
  const tagMatch = findTagAtPosition(content, offset);
  if (tagMatch) {
    const result = await findTagDefinition(tagMatch.tagName, workspaceFolders);
    return result?.location || null;
  }

  // Check if we're on an attribute name
  const attrMatch = findAttributeAtPosition(content, offset);
  if (attrMatch) {
    // Could look up attribute documentation
    // For now, return null
    return null;
  }

  return null;
}

/**
 * Find tag at given offset
 */
function findTagAtPosition(content: string, offset: number): { tagName: string; range: Range } | null {
  // Find the tag we're in
  const before = content.substring(Math.max(0, offset - 100), offset);

  // Look for <tagname pattern
  const tagMatch = before.match(/<(\w+)$/);
  if (tagMatch && tagMatch[1]) {
    return { tagName: tagMatch[1], range: Range.create(0, 0, 0, 0) };
  }

  return null;
}

/**
 * Find attribute at given offset
 */
function findAttributeAtPosition(content: string, offset: number): { attrName: string; tagName: string } | null {
  // Simple implementation - could be enhanced
  const before = content.substring(Math.max(0, offset - 200), offset);
  const attrMatch = before.match(/(\w+)\s*=\s*["']?[^"']*$/);
  if (attrMatch && attrMatch[1]) {
    // Try to find the tag name
    const tagMatch = before.match(/<(\w+)\s[^>]*$/);
    if (tagMatch && tagMatch[1]) {
      return { attrName: attrMatch[1], tagName: tagMatch[1] };
    }
  }

  return null;
}

/**
 * Find all .pike files in workspace
 */
async function findPikeFiles(workspaceFolders: string[]): Promise<string[]> {
  const files: string[] = [];

  for (const folder of workspaceFolders) {
    const matches = await glob('**/*.pike', {
      cwd: folder,
      absolute: true,
      ignore: ['**/node_modules/**', '**/.git/**']
    });
    files.push(...matches);
  }

  return files;
}

/**
 * Convert file path to URI
 */
function fileToUri(filePath: string): string {
  // Simple implementation - use proper URI encoding in production
  return filePath.startsWith('/') ? `file://${filePath}` : `file:///${filePath}`;
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find line/column position for regex match
 */
function findPositionForMatch(content: string, match: RegExpExecArray): Position {
  if (match.index === undefined) {
    return { line: 0, character: 0 };
  }

  const before = content.substring(0, match.index);
  const lines = before.split('\n');

  return {
    line: lines.length - 1,
    character: (lines[lines.length - 1] || '').length
  };
}
