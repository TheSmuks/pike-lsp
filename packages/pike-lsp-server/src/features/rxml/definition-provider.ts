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
import { getTagInfo } from './tag-catalog.js';
import { GlobCache } from './glob-cache.js';
import {
  readFileCached,
  invalidateFileContentCache,
  clearFileContentCache,
} from './file-content-cache.js';

// Shared glob cache - 30 second TTL
const pikeGlobCache = new GlobCache<string[]>(30);
const TAG_DEFINITION_INDEX_TTL_MS = 30_000;
const tagDefinitionIndexCache = new Map<
  string,
  {
    builtAt: number;
    byTag: Map<string, RoxenTagInfo>;
  }
>();
const DEFVAR_DEFINITION_INDEX_TTL_MS = 30_000;
const defvarDefinitionIndexCache = new Map<
  string,
  {
    builtAt: number;
    byName: Map<string, RoxenDefvarInfo>;
  }
>();

function makeWorkspaceKey(workspaceFolders: string[]): string {
  return [...workspaceFolders].sort().join('|');
}

async function getTagDefinitionIndex(
  workspaceFolders: string[]
): Promise<Map<string, RoxenTagInfo>> {
  const key = makeWorkspaceKey(workspaceFolders);
  const now = Date.now();
  const cached = tagDefinitionIndexCache.get(key);
  if (cached && now - cached.builtAt < TAG_DEFINITION_INDEX_TTL_MS) {
    return cached.byTag;
  }

  const byTag = new Map<string, RoxenTagInfo>();
  const pikeFiles = await findPikeFiles(workspaceFolders);

  for (const file of pikeFiles) {
    const content = await readFileCached(file);

    const simpleTagPattern = /^\s*simpletag\s+([A-Za-z_]\w*)\s*\(/gm;
    let match = simpleTagPattern.exec(content);
    while (match !== null) {
      const tagName = match[1];
      if (!tagName || byTag.has(tagName)) {
        match = simpleTagPattern.exec(content);
        continue;
      }

      const position = findPositionForMatch(content, match);
      byTag.set(tagName, {
        tagName,
        functionName: `simpletag_${tagName}`,
        location: Location.create(fileToUri(file), {
          start: position,
          end: { line: position.line, character: position.character + tagName.length },
        }),
        tagType: 'simple',
      });

      match = simpleTagPattern.exec(content);
    }
  }

  tagDefinitionIndexCache.set(key, { builtAt: now, byTag });
  return byTag;
}

async function getDefvarDefinitionIndex(
  workspaceFolders: string[]
): Promise<Map<string, RoxenDefvarInfo>> {
  const key = makeWorkspaceKey(workspaceFolders);
  const now = Date.now();
  const cached = defvarDefinitionIndexCache.get(key);
  if (cached && now - cached.builtAt < DEFVAR_DEFINITION_INDEX_TTL_MS) {
    return cached.byName;
  }

  const byName = new Map<string, RoxenDefvarInfo>();
  const pikeFiles = await findPikeFiles(workspaceFolders);

  for (const file of pikeFiles) {
    const content = await readFileCached(file);
    const defvarPattern = /defvar\s*\(\s*["']([^"']+)["']/g;

    let match = defvarPattern.exec(content);
    while (match !== null) {
      const name = match[1];
      if (name) {
        const keyName = name.toLowerCase();
        if (!byName.has(keyName)) {
          const position = findPositionForMatch(content, match);
          byName.set(keyName, {
            name,
            type: 'mixed',
            documentation: `Defvar: ${name}`,
            location: Location.create(fileToUri(file), {
              start: position,
              end: { line: position.line, character: position.character + name.length },
            }),
          });
        }
      }

      match = defvarPattern.exec(content);
    }
  }

  defvarDefinitionIndexCache.set(key, { builtAt: now, byName });
  return byName;
}

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

  const index = await getTagDefinitionIndex(workspaceFolders);
  const indexed = index.get(tagName);
  if (indexed) {
    return indexed;
  }

  // Fallback: check if it's a built-in tag
  const tagInfo = getTagInfo(tagName);
  if (tagInfo) {
    // Return catalog location (metadata only, no actual file)
    return {
      tagName,
      functionName: `builtin:${tagName}`,
      location: Location.create('builtin:tag-catalog', Range.create(0, 0, 0, 0)),
      tagType: tagInfo.type,
    };
  }

  return null;
}

export function invalidateRXMLDefinitionCaches(uri?: string): void {
  tagDefinitionIndexCache.clear();
  defvarDefinitionIndexCache.clear();
  pikeGlobCache.clear();

  if (!uri) {
    clearFileContentCache();
    return;
  }

  invalidateFileContentCache(uri);
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

  const index = await getDefvarDefinitionIndex(workspaceFolders);
  return index.get(defvarName.toLowerCase()) ?? null;
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
function findTagAtPosition(
  content: string,
  offset: number
): { tagName: string; range: Range } | null {
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
function findAttributeAtPosition(
  content: string,
  offset: number
): { attrName: string; tagName: string } | null {
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
    // Check cache first
    const cached = pikeGlobCache.get('**/*.pike', folder);
    if (cached) {
      files.push(...cached);
      continue;
    }

    const matches = await glob('**/*.pike', {
      cwd: folder,
      absolute: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    });
    files.push(...matches);

    // Cache the result
    pikeGlobCache.set('**/*.pike', folder, matches);
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
    character: (lines[lines.length - 1] || '').length,
  };
}
