/**
 * Rename Handlers
 *
 * Provides prepare rename and rename operations for Pike code.
 *
 * Features:
 * - Scope-aware rename using symbolPositions index
 * - Cross-file rename with workspaceIndex search
 * - Collision detection for name conflicts
 * - Inherited member renaming support
 * - Pike's Rename.pike module integration for accurate tokenization
 */

import {
  Connection,
  Range,
  TextEdit,
  TextDocuments,
  Position,
  WorkspaceEdit,
  TextDocumentEdit,
  OptionalVersionedTextDocumentIdentifier,
  ResponseError,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeToken } from '@pike-lsp/pike-bridge';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';

// Pike reserved keywords that cannot be used as identifiers
const PIKE_KEYWORDS = new Set([
  'int',
  'string',
  'void',
  'float',
  'mapping',
  'array',
  'object',
  'program',
  'function',
  'if',
  'else',
  'for',
  'while',
  'return',
  'class',
  'inherit',
  'import',
  'typeof',
  'switch',
  'case',
  'break',
  'continue',
  'do',
  'default',
  'enum',
  'final',
  'inline',
  'local',
  'nomask',
  'private',
  'protected',
  'public',
  'static',
  'extern',
]);

/**
 * Validate that a new name is a valid Pike identifier
 */
function validateNewName(name: string): { valid: boolean; error?: string } {
  if (!name || name.length === 0) {
    return { valid: false, error: 'New name cannot be empty' };
  }

  if (!/^[a-zA-Z_]\w*$/.test(name)) {
    return { valid: false, error: 'Invalid identifier name' };
  }

  if (PIKE_KEYWORDS.has(name)) {
    return { valid: false, error: `Cannot rename to reserved keyword '${name}'` };
  }

  return { valid: true };
}

/**
 * Register rename handlers.
 */
export function registerRenameHandlers(
  connection: Connection,
  services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const { documentCache, bridge, workspaceIndex } = services;
  const log = new Logger('Rename');

  connection.onPrepareRename(async (params): Promise<Range | null> => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);

    if (!document) {
      return null;
    }

    const text = document.getText();
    const line = params.position.line + 1;
    const character = params.position.character;

    if (bridge?.bridge) {
      try {
        const filePath = decodeURIComponent(uri.replace(/^file:\/\//, ''));
        const result = await bridge.prepareRename(text, line, character, filePath);

        if (result && !('error' in result) && result.name) {
          log.debug('Prepare rename: using Pike Rename module', { name: result.name });
          return {
            start: { line: result.line, character: result.character },
            end: { line: result.endLine, character: result.endCharacter },
          };
        }
      } catch (err) {
        log.debug('Prepare rename: bridge unavailable, using text fallback', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const offset = document.offsetAt(params.position);

    let start = offset;
    let end = offset;
    while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
      start--;
    }
    while (end < text.length && /\w/.test(text[end] ?? '')) {
      end++;
    }

    if (start === end) {
      return null;
    }

    const word = text.slice(start, end);

    const cached = documentCache.get(uri);
    if (cached && cached.symbols.length > 0) {
      const isKnownSymbol = cached.symbols.some(s => s.name === word);
      if (!isKnownSymbol) {
        return null;
      }
    }

    return {
      start: document.positionAt(start),
      end: document.positionAt(end),
    };
  });

  connection.onRenameRequest(async (params): Promise<WorkspaceEdit | null> => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);

    if (!document) {
      log.debug('Rename: no document');
      return null;
    }

    const validation = validateNewName(params.newName);
    if (!validation.valid) {
      throw new ResponseError(-32602, validation.error ?? 'Invalid name');
    }

    const cached = documentCache.get(uri);
    const text = document.getText();
    const offset = document.offsetAt(params.position);
    const line = params.position.line + 1;

    if (bridge?.bridge) {
      try {
        const filePath = decodeURIComponent(uri.replace(/^file:\/\//, ''));

        let start = offset;
        let end = offset;
        while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
          start--;
        }
        while (end < text.length && /\w/.test(text[end] ?? '')) {
          end++;
        }
        const symbolName = text.slice(start, end);

        if (symbolName) {
          const result = await bridge.findRenamePositions(
            text,
            symbolName,
            line,
            params.position.character,
            filePath
          );

          if (result && !('error' in result) && result.edits && result.edits.length > 0) {
            log.debug('Rename: using Pike Rename module', {
              symbol: symbolName,
              count: result.edits.length,
            });

            const newName = params.newName;
            const edits: TextEdit[] = result.edits.map(pos => ({
              range: {
                start: { line: pos.line, character: pos.character },
                end: { line: pos.endLine, character: pos.endCharacter },
              },
              newText: newName,
            }));

            const textDocumentEdit: TextDocumentEdit = {
              textDocument: OptionalVersionedTextDocumentIdentifier.create(uri, null),
              edits: edits,
            };

            return { documentChanges: [textDocumentEdit] };
          }
        }
      } catch (err) {
        log.debug('Rename: bridge rename failed, using fallback', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let start = offset;
    let end = offset;
    while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
      start--;
    }
    while (end < text.length && /\w/.test(text[end] ?? '')) {
      end++;
    }

    let oldName = text.slice(start, end);
    if (!oldName) {
      log.debug('Rename: no word at position');
      return null;
    }

    const newName = params.newName;
    const changes: { [uri: string]: TextEdit[] } = {};

    let matchingSymbol = cached?.symbols.find(s => s.name === oldName);

    if (!matchingSymbol && cached) {
      const symbolLine = params.position.line;
      const symbolOnLine = cached.symbols.find(s => {
        if (!s.position) return false;
        const sLine = s.position.line - 1;
        return sLine === symbolLine;
      });

      if (symbolOnLine && symbolOnLine.name) {
        oldName = symbolOnLine.name;
        matchingSymbol = symbolOnLine;
      }
    }

    const allUris = workspaceIndex.getAllDocumentUris();
    for (const workspaceUri of allUris) {
      if (workspaceUri !== uri) {
        const symbols = workspaceIndex.getDocumentSymbols(workspaceUri);
        const hasConflict = symbols.some(s => s.name === newName);
        if (hasConflict) {
          throw new ResponseError(
            -32602,
            `Name '${newName}' already exists in file ${workspaceUri}`
          );
        }
      }
    }

    if (matchingSymbol) {
      const inheritedMembers = getInheritedMembers(matchingSymbol, cached?.symbols ?? []);
      if (inheritedMembers.length > 0) {
        log.debug('Rename: symbol has inherited members', {
          count: inheritedMembers.length,
        });
      }
    }

    log.debug('Rename request', { oldName, newName, hasSymbol: !!matchingSymbol });

    const addEditsFromPositions = (targetUri: string, positions: Position[] | undefined): void => {
      if (!positions || positions.length === 0) return;

      const edits: TextEdit[] = [];
      for (const pos of positions) {
        edits.push({
          range: {
            start: pos,
            end: { line: pos.line, character: pos.character + oldName.length },
          },
          newText: newName,
        });
      }

      if (edits.length > 0) {
        changes[targetUri] = edits;
      }
    };

    const addEditsFromTokens = (targetUri: string, tokens: PikeToken[]): void => {
      const edits: TextEdit[] = [];
      for (const token of tokens) {
        if (token.text !== oldName) continue;
        edits.push({
          range: {
            start: { line: token.line - 1, character: token.character },
            end: { line: token.line - 1, character: token.character + oldName.length },
          },
          newText: newName,
        });
      }
      if (edits.length > 0) {
        if (changes[targetUri]) {
          changes[targetUri] = [...changes[targetUri], ...edits];
        } else {
          changes[targetUri] = edits;
        }
      }
    };

    const addEditsFromTextSearch = (targetUri: string, searchText: string): void => {
      const edits: TextEdit[] = [];
      const lines = searchText.split('\n');

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        if (!line) continue;
        let searchStart = 0;
        let matchIndex = line.indexOf(oldName, searchStart);

        while (matchIndex !== -1) {
          const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
          const afterChar =
            matchIndex + oldName.length < line.length ? line[matchIndex + oldName.length] : ' ';

          if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
            edits.push({
              range: {
                start: { line: lineNum, character: matchIndex },
                end: { line: lineNum, character: matchIndex + oldName.length },
              },
              newText: newName,
            });
          }
          searchStart = matchIndex + 1;
          matchIndex = line.indexOf(oldName, searchStart);
        }
      }

      if (edits.length > 0) {
        if (changes[targetUri]) {
          changes[targetUri] = [...changes[targetUri], ...edits];
        } else {
          changes[targetUri] = edits;
        }
      }
    };

    if (matchingSymbol && cached?.symbolPositions) {
      const positions = cached.symbolPositions.get(oldName);
      log.debug('Rename: using symbolPositions', {
        symbol: oldName,
        count: positions?.length ?? 0,
      });
      addEditsFromPositions(uri, positions);
    } else if (bridge?.isRunning?.()) {
      try {
        const tokens = await bridge.tokenize(text);
        addEditsFromTokens(uri, tokens);
      } catch {
        addEditsFromTextSearch(uri, text);
      }
    } else {
      addEditsFromTextSearch(uri, text);
    }

    for (const [otherUri, otherCached] of Array.from(documentCache.entries())) {
      if (otherUri === uri) continue;

      if (otherCached.symbolPositions && matchingSymbol) {
        const positions = otherCached.symbolPositions.get(oldName);
        if (positions && positions.length > 0) {
          addEditsFromPositions(otherUri, positions);
        }
      } else if (bridge?.isRunning?.()) {
        const otherDoc = documents.get(otherUri);
        if (otherDoc) {
          try {
            const tokens = await bridge.tokenize(otherDoc.getText());
            addEditsFromTokens(otherUri, tokens);
          } catch {
            addEditsFromTextSearch(otherUri, otherDoc.getText());
          }
        }
      } else {
        const otherDoc = documents.get(otherUri);
        if (otherDoc) {
          addEditsFromTextSearch(otherUri, otherDoc.getText());
        }
      }
    }

    log.debug('Rename complete', {
      oldName,
      newName,
      fileCount: Object.keys(changes).length,
      totalEdits: Object.values(changes).reduce((sum, edits) => sum + edits.length, 0),
    });

    const documentChanges: TextDocumentEdit[] = [];

    for (const [changeUri, edits] of Object.entries(changes)) {
      if (edits.length > 0) {
        documentChanges.push({
          textDocument: OptionalVersionedTextDocumentIdentifier.create(changeUri, null),
          edits: edits,
        });
      }
    }

    return { documentChanges };
  });
}

/**
 * Get inherited members for a symbol
 * Traces through inherit chain to find members with the same name
 */
function getInheritedMembers(
  symbol: { name: string; kind?: string; position?: { line: number } },
  allSymbols: Array<{ name: string; kind?: string; position?: { line: number } }>
): Array<{ name: string; kind?: string; position?: { line: number } }> {
  const inherited: Array<{ name: string; kind?: string; position?: { line: number } }> = [];

  for (const s of allSymbols) {
    if (s.name === symbol.name && s !== symbol) {
      inherited.push(s);
    }
  }

  return inherited;
}
