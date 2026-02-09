/**
 * RXML References Provider
 *
 * Provides find-references functionality for RXML tags:
 * - Find all usages of a tag across .rxml/.roxen templates
 * - Find all references to a defvar
 * - Find all modules using a specific tag
 *
 * Phase 6 of ROXEN_SUPPORT_ROADMAP.md
 */

import { Location, ReferenceContext } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { parseRXMLTemplate, type RXMLTag } from './parser.js';

/**
 * Find all references to a tag in workspace
 *
 * @param tagName - Tag name to find (e.g., "my_tag")
 * @param workspaceFolders - Workspace folders to search
 * @param includeDeclaration - Include the definition itself
 * @returns Array of locations where tag is used
 */
export async function findTagReferences(
  tagName: string,
  workspaceFolders: string[],
  includeDeclaration: boolean = false
): Promise<Location[]> {
  const locations: Location[] = [];

  if (!workspaceFolders.length) {
    return locations;
  }

  // Search for .rxml and .roxen template files
  const templateFiles = await findTemplateFiles(workspaceFolders);

  for (const file of templateFiles) {
    const content = await readFile(file, 'utf-8');
    const tags = parseRXMLTemplate(content, file);

    // Find all occurrences of the tag (using flattenTags or recursive search)
    const foundTags = findTagsByName(tags, tagName);

    for (const tag of foundTags) {
      locations.push({
        uri: fileToUri(file),
        range: tag.range
      });
    }
  }

  // Also search in .pike files for tag function references
  if (includeDeclaration) {
    const pikeFiles = await findPikeFiles(workspaceFolders);

    for (const file of pikeFiles) {
      const content = await readFile(file, 'utf-8');

      // Look for simpletag_* or container_* function definitions
      const patterns = [
        new RegExp(`\\bsimpletag\\s+${escapeRegExp(tagName)}\\b`, 'g'),
        new RegExp(`\\bcontainer\\s+${escapeRegExp(tagName)}\\b`, 'g'),
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const position = findPositionForMatch(content, match);
          locations.push({
            uri: fileToUri(file),
            range: {
              start: position,
              end: { line: position.line, character: position.character + tagName.length }
            }
          });
        }
      }
    }
  }

  return locations;
}

/**
 * Find all references to a defvar
 *
 * @param defvarName - Variable name to find
 * @param workspaceFolders - Workspace folders to search
 * @returns Array of locations where defvar is referenced
 */
export async function findDefvarReferences(
  defvarName: string,
  workspaceFolders: string[]
): Promise<Location[]> {
  const locations: Location[] = [];

  if (!workspaceFolders.length) {
    return locations;
  }

  // Search in .pike files
  const pikeFiles = await findPikeFiles(workspaceFolders);

  for (const file of pikeFiles) {
    const content = await readFile(file, 'utf-8');

    // Look for &var.name; style references in templates
    // Or direct variable usage in Pike code
    const patterns = [
      new RegExp(`&${escapeRegExp(defvarName)}\\.`, 'g'), // RXML entity reference
      new RegExp(`\\b${escapeRegExp(defvarName)}\\s*->`, 'g'), // Pike variable access
      new RegExp(`\\b${escapeRegExp(defvarName)}\\[`, 'g'), // Array access
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const position = findPositionForMatch(content, match);
        locations.push({
          uri: fileToUri(file),
          range: {
            start: position,
            end: { line: position.line, character: position.character + defvarName.length }
          }
        });
      }
    }
  }

  return locations;
}

/**
 * Find all modules that use a specific tag
 *
 * @param tagName - Tag name to search for
 * @param workspaceFolders - Workspace folders
 * @returns Array of module file paths
 */
export async function findModulesUsingTag(
  tagName: string,
  workspaceFolders: string[]
): Promise<string[]> {
  const modules: Set<string> = new Set();

  if (!workspaceFolders.length) {
    return [];
  }

  const templateFiles = await findTemplateFiles(workspaceFolders);

  for (const file of templateFiles) {
    const content = await readFile(file, 'utf-8');
    const tags = parseRXMLTemplate(content, file);

    if (findTagsByName(tags, tagName).length > 0) {
      // Find the module that owns this template
      // For now, just return the template file
      modules.add(file);
    }
  }

  return Array.from(modules);
}

/**
 * Provide references for RXML document position
 *
 * @param document - Text document
 * @param position - Position to find references for
 * @param context - Reference context
 * @param workspaceFolders - Workspace folders
 * @returns Array of locations
 */
export async function provideRXMLReferences(
  document: TextDocument,
  position: Position,
  context: ReferenceContext,
  workspaceFolders: string[]
): Promise<Location[]> {
  const content = document.getText();
  const offset = document.offsetAt(position);

  // Check if we're on a tag name
  const tagMatch = findTagAtPosition(content, offset);
  if (tagMatch) {
    return findTagReferences(tagMatch.tagName, workspaceFolders, context.includeDeclaration);
  }

  // Check if we're on an attribute/variable
  const attrMatch = findAttributeAtPosition(content, offset);
  if (attrMatch) {
    // Could look up attribute/defvar references
    return [];
  }

  return [];
}

// Helper functions (shared with definition-provider)

function findTagsByName(tags: RXMLTag[], tagName: string): RXMLTag[] {
  const results: RXMLTag[] = [];

  for (const tag of tags) {
    if (tag.name.toLowerCase() === tagName.toLowerCase()) {
      results.push(tag);
    }

    if (tag.children) {
      results.push(...findTagsByName(tag.children, tagName));
    }
  }

  return results;
}

async function findTemplateFiles(workspaceFolders: string[]): Promise<string[]> {
  const files: string[] = [];

  for (const folder of workspaceFolders) {
    const matches = await glob('**/*.{rxml,roxen}', {
      cwd: folder,
      absolute: true,
      ignore: ['**/node_modules/**', '**/.git/**']
    });
    files.push(...matches);
  }

  return files;
}

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

function fileToUri(filePath: string): string {
  return filePath.startsWith('/') ? `file://${filePath}` : `file:///${filePath}`;
}

export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

function findTagAtPosition(content: string, offset: number): { tagName: string } | null {
  const before = content.substring(Math.max(0, offset - 100), offset);
  const tagMatch = before.match(/<(\w+)$/);
  if (tagMatch && tagMatch[1]) {
    return { tagName: tagMatch[1] };
  }
  return null;
}

function findAttributeAtPosition(content: string, offset: number): { attrName: string; tagName: string } | null {
  const before = content.substring(Math.max(0, offset - 200), offset);
  const attrMatch = before.match(/(\w+)\s*=\s*["']?[^"']*$/);
  if (attrMatch && attrMatch[1]) {
    const tagMatch = before.match(/<(\w+)\s[^>]*$/);
    if (tagMatch && tagMatch[1]) {
      return { attrName: attrMatch[1], tagName: tagMatch[1] };
    }
  }
  return null;
}

import { Position } from 'vscode-languageserver';
