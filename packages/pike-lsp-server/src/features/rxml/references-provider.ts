/**
 * RXML References Provider
 *
 * Provides find-references functionality for RXML tags:
 * - Find all usages of a tag across .rxml/.roxen templates
 * - Find all references to a defvar
 * - Find all modules using a specific tag
 *
 * Phase 6 of ROXEN_SUPPORT_ROADMAP.md
 *
 * Uses RequestScheduler for resilient request handling — concurrent reference
 * requests for the same workspace are superseded so stale work is cancelled.
 */

import type { PikeToken } from '@pike-lsp/pike-bridge';
import { Location, ReferenceContext, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { glob } from 'glob';
import { Logger } from '@pike-lsp/core';
import { parseRXMLTemplate, type RXMLTag } from './parser.js';
import { GlobCache } from './glob-cache.js';
import {
  readFileCached,
  invalidateFileContentCache,
  clearFileContentCache,
} from './file-content-cache.js';
import { RequestScheduler, RequestSupersededError } from '../../services/request-scheduler.js';
import { isPikeKeyword } from '../navigation/keywords.js';
import { findTagFunctionsInCode } from './module-scanner.js';

import { LRUCache } from '../../utils/lru-cache.js';
const log = new Logger('RXMLReferences');

// Shared glob cache - 30 second TTL
const templateGlobCache = new GlobCache<string[]>(30);
const pikeGlobCache = new GlobCache<string[]>(30);

// Request scheduler for resilient reference lookups
const referencesScheduler = new RequestScheduler({ logger: log });
const TAG_REFERENCE_INDEX_TTL_MS = 30_000;
const MAX_WORKSPACE_INDEXES = 20;
const tagReferenceIndexCache = new LRUCache<
  string,
  { builtAt: number; byTag: Map<string, Location[]> }
>(MAX_WORKSPACE_INDEXES);
const tagDeclarationIndexCache = new LRUCache<
  string,
  { builtAt: number; byTag: Map<string, Location[]> }
>(MAX_WORKSPACE_INDEXES);

function makeWorkspaceKey(workspaceFolders: string[]): string {
  return [...workspaceFolders].sort().join('|');
}

async function getTagReferenceIndex(workspaceFolders: string[]): Promise<Map<string, Location[]>> {
  const key = makeWorkspaceKey(workspaceFolders);
  const now = Date.now();
  const cached = tagReferenceIndexCache.get(key);
  if (cached && now - cached.builtAt < TAG_REFERENCE_INDEX_TTL_MS) {
    return cached.byTag;
  }

  const byTag = new Map<string, Location[]>();
  const templateFiles = await findTemplateFiles(workspaceFolders);

  for (const file of templateFiles) {
    const content = await readFileCached(file);
    const tags = parseRXMLTemplate(content, file);
    const flattened = flattenTags(tags);

    for (const tag of flattened) {
      const keyName = tag.name.toLowerCase();
      const locations = byTag.get(keyName) ?? [];
      locations.push({
        uri: fileToUri(file),
        range: tag.range,
      });
      byTag.set(keyName, locations);
    }
  }

  tagReferenceIndexCache.set(key, { builtAt: now, byTag });
  return byTag;
}

async function getTagDeclarationIndex(
  workspaceFolders: string[]
): Promise<Map<string, Location[]>> {
  const key = makeWorkspaceKey(workspaceFolders);
  const now = Date.now();
  const cached = tagDeclarationIndexCache.get(key);
  if (cached && now - cached.builtAt < TAG_REFERENCE_INDEX_TTL_MS) {
    return cached.byTag;
  }

  const byTag = new Map<string, Location[]>();
  const pikeFiles = await findPikeFiles(workspaceFolders);

  for (const file of pikeFiles) {
    const content = await readFileCached(file);
    const matches = findTagFunctionsInCode(content);

    for (const m of matches) {
      const keyName = m.name.toLowerCase();
      const locations = byTag.get(keyName) ?? [];
      const position = findPositionForIndex(content, m.index);

      locations.push({
        uri: fileToUri(file),
        range: {
          start: position,
          end: { line: position.line, character: position.character + m.name.length },
        },
      });
      byTag.set(keyName, locations);
    }
  }

  tagDeclarationIndexCache.set(key, { builtAt: now, byTag });
  return byTag;
}

/**
 * Find all references to a tag in workspace
 *
 * Uses RequestScheduler so that rapid successive lookups for the same
 * workspace supersede earlier in-flight requests.
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

  const wsKey = makeWorkspaceKey(workspaceFolders);
  try {
    return await referencesScheduler.schedule<Location[]>({
      requestClass: 'interactive',
      key: `findTagRefs:${wsKey}`,
      run: async checkpoint => {
        checkpoint();
        const referenceIndex = await getTagReferenceIndex(workspaceFolders);
        const indexedLocations = referenceIndex.get(tagName.toLowerCase()) ?? [];
        locations.push(...indexedLocations);

        // Also search in .pike files for tag function references
        if (includeDeclaration) {
          const declarationIndex = await getTagDeclarationIndex(workspaceFolders);
          const declarationLocations = declarationIndex.get(tagName.toLowerCase()) ?? [];
          locations.push(...declarationLocations);
        }

        return locations;
      },
    });
  } catch (err) {
    if (err instanceof RequestSupersededError) {
      log.debug('findTagReferences superseded', { tagName, wsKey });
      return [];
    }
    throw err;
  }
}

export function invalidateRXMLReferenceCaches(uri?: string): void {
  tagReferenceIndexCache.clear();
  tagDeclarationIndexCache.clear();
  templateGlobCache.clear();
  pikeGlobCache.clear();

  if (!uri) {
    clearFileContentCache();
    return;
  }

  invalidateFileContentCache(uri);
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
  workspaceFolders: string[],
  tokenizeFn: ((text: string) => Promise<PikeToken[]>) | null = null
): Promise<Location[]> {
  const locations: Location[] = [];

  if (!workspaceFolders.length) {
    return locations;
  }

  const wsKey = makeWorkspaceKey(workspaceFolders);
  try {
    return await referencesScheduler.schedule<Location[]>({
      requestClass: 'interactive',
      key: `findDefvarRefs:${wsKey}`,
      run: async checkpoint => {
        checkpoint();
        // Search in .pike files
        const pikeFiles = await findPikeFiles(workspaceFolders);

        for (const file of pikeFiles) {
          const content = await readFileCached(file);

          // RXML entity reference (template syntax, not Pike code)
          const entityPattern = new RegExp(`&${escapeRegExp(defvarName)}\\.`, 'g');
          let entityMatch = entityPattern.exec(content);
          while (entityMatch !== null) {
            const position = findPositionForIndex(content, entityMatch.index);
            locations.push({
              uri: fileToUri(file),
              range: {
                start: position,
                end: { line: position.line, character: position.character + defvarName.length },
              },
            });
            entityMatch = entityPattern.exec(content);
          }

          // Pike variable references via tokenizer (skips comments/strings)
          if (tokenizeFn) {
            const tokens = await tokenizeFn(content);
            for (const token of tokens) {
              if (token.text !== defvarName || isPikeKeyword(token.text)) continue;
              const pos: Position = {
                line: token.line - 1,
                character: token.character,
              };
              locations.push({
                uri: fileToUri(file),
                range: {
                  start: pos,
                  end: { line: pos.line, character: pos.character + defvarName.length },
                },
              });
            }
          }
        }

        return locations;
      },
    });
  } catch (err) {
    if (err instanceof RequestSupersededError) {
      log.debug('findDefvarReferences superseded', { defvarName, wsKey });
      return [];
    }
    throw err;
  }
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

  const wsKey = makeWorkspaceKey(workspaceFolders);
  try {
    return await referencesScheduler.schedule<string[]>({
      requestClass: 'background',
      key: `findModules:${wsKey}`,
      run: async checkpoint => {
        checkpoint();
        const templateFiles = await findTemplateFiles(workspaceFolders);

        for (const file of templateFiles) {
          const content = await readFileCached(file);
          const tags = parseRXMLTemplate(content, file);

          if (findTagsByName(tags, tagName).length > 0) {
            modules.add(file);
          }
        }

        return Array.from(modules);
      },
    });
  } catch (err) {
    if (err instanceof RequestSupersededError) {
      log.debug('findModulesUsingTag superseded', { tagName, wsKey });
      return [];
    }
    throw err;
  }
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

function flattenTags(tags: RXMLTag[]): RXMLTag[] {
  const out: RXMLTag[] = [];
  for (const tag of tags) {
    out.push(tag);
    if (tag.children && tag.children.length > 0) {
      out.push(...flattenTags(tag.children));
    }
  }
  return out;
}

async function findTemplateFiles(workspaceFolders: string[]): Promise<string[]> {
  const files: string[] = [];

  for (const folder of workspaceFolders) {
    // Check cache first
    const cached = templateGlobCache.get('**/*.{rxml,roxen}', folder);
    if (cached) {
      files.push(...cached);
      continue;
    }

    const matches = await glob('**/*.{rxml,roxen}', {
      cwd: folder,
      absolute: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    });
    files.push(...matches);

    // Cache the result
    templateGlobCache.set('**/*.{rxml,roxen}', folder, matches);
  }

  return files;
}

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

function fileToUri(filePath: string): string {
  return filePath.startsWith('/') ? `file://${filePath}` : `file:///${filePath}`;
}

export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findPositionForIndex(content: string, index: number): Position {
  const before = content.substring(0, index);
  const lines = before.split('\n');

  return {
    line: lines.length - 1,
    character: (lines[lines.length - 1] || '').length,
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

function findAttributeAtPosition(
  content: string,
  offset: number
): { attrName: string; tagName: string } | null {
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
