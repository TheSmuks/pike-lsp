/**
 * RXML Rename Provider
 *
 * Provides rename symbol functionality for RXML tags:
 * - Rename tag functions (simpletag_foo → simpletag_bar)
 * - Safe refactoring: rename function AND all template usages
 * - Rename defvar with cascade to all references
 * - Preview changes before applying
 *
 * Phase 6 of ROXEN_SUPPORT_ROADMAP.md
 */

import { WorkspaceEdit, Position, TextDocumentEdit } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { OptionalVersionedTextDocumentIdentifier } from 'vscode-languageserver';
import { findTagReferences, escapeRegExp } from './references-provider.js';
import { glob } from 'glob';
import { readFile } from 'fs/promises';

/**
 * Prepare rename for RXML tag
 *
 * @param document - Text document
 * @param position - Position of tag to rename
 * @param newName - New name for the tag
 * @param workspaceFolders - Workspace folders
 * @returns WorkspaceEdit or null if rename not possible
 */
export async function prepareRXMLRename(
  document: TextDocument,
  position: Position,
  newName: string,
  workspaceFolders: string[]
): Promise<WorkspaceEdit | null> {
  const content = document.getText();
  const offset = document.offsetAt(position);

  // Find what we're renaming
  const tagMatch = findTagAtPosition(content, offset);
  if (tagMatch) {
    return prepareTagRename(tagMatch.tagName, newName, workspaceFolders);
  }

  return null;
}

/**
 * Provide rename for RXML tag
 *
 * @param document - Text document
 * @param position - Position of tag to rename
 * @param newName - New name for the tag
 * @param workspaceFolders - Workspace folders
 * @returns WorkspaceEdit or null
 */
export async function provideRXMLRename(
  document: TextDocument,
  position: Position,
  newName: string,
  workspaceFolders: string[]
): Promise<WorkspaceEdit | null> {
  return prepareRXMLRename(document, position, newName, workspaceFolders);
}

/**
 * Prepare workspace edit for renaming a tag
 */
async function prepareTagRename(
  oldTagName: string,
  newTagName: string,
  workspaceFolders: string[]
): Promise<WorkspaceEdit | null> {
  // Validate new name
  if (!isValidTagName(newTagName)) {
    return null;
  }

  const edit: WorkspaceEdit = {
    documentChanges: []
  };

  // Find all references to the tag
  const locations = await findTagReferences(oldTagName, workspaceFolders, true);

  // Group changes by file
  const changesByFile = new Map<string, Array<{ range: any; newText: string }>>();

  for (const loc of locations) {
    if (!changesByFile.has(loc.uri)) {
      changesByFile.set(loc.uri, []);
    }

    changesByFile.get(loc.uri)!.push({
      range: loc.range,
      newText: newTagName
    });
  }

  // Also need to rename the function in .pike files
  const pikeFiles = await findPikeFiles(workspaceFolders);

  for (const file of pikeFiles) {
    const content = await readFile(file, 'utf-8');

    // Look for simpletag_* or container_* function definitions
    const patterns = [
      {
        regex: new RegExp(`(simpletag\\s+)${escapeRegExp(oldTagName)}\\b`, 'g'),
        replacement: `$1${newTagName}`
      },
      {
        regex: new RegExp(`(container\\s+)${escapeRegExp(oldTagName)}\\b`, 'g'),
        replacement: `$1${newTagName}`
      },
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const uri = fileToUri(file);

        if (!changesByFile.has(uri)) {
          changesByFile.set(uri, []);
        }

        const position = findPositionForMatch(content, match);
        const start = match.index!;
        const end = start + oldTagName.length;

        changesByFile.get(uri)!.push({
          range: {
            start: position,
            end: {
              line: position.line,
              character: position.character + (end - start)
            }
          },
          newText: newTagName
        });
      }
    }
  }

  // Convert to WorkspaceEdit format
  for (const [uri, changes] of changesByFile.entries()) {
    const textDocumentEdit: TextDocumentEdit = {
      textDocument: OptionalVersionedTextDocumentIdentifier.create(uri, null),
      edits: changes
    };

    edit.documentChanges!.push(textDocumentEdit);
  }

  return edit;
}

/**
 * Validate tag name
 */
function isValidTagName(name: string): boolean {
  // RXML tag names: lowercase letters, numbers, underscores
  return /^[a-z][a-z0-9_]*$/.test(name);
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
  if (!filePath) {
    return 'file:///unknown';
  }
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
    character: (lines[lines.length - 1] || '').length
  };
}
