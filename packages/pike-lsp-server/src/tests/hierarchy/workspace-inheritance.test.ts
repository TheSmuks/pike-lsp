/**
 * Workspace Inheritance Tests (Phase 6)
 * Tests for workspace file search for cross-file inheritance.
 * Issue #128: Add workspace file search for cross-file inheritance.
 */

import { describe, it, expect } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { registerHierarchyHandlers } from '../../features/hierarchy.js';
import {
  createMockConnection,
  createMockDocuments,
  createMockServices,
  makeCacheEntry,
  sym,
} from '../helpers/mock-services.js';

describe('Workspace Inheritance (Phase 6)', () => {
  it('should handle workspace scanner for parent class search', async () => {
    const childCode = `class Derived {
    inherit Base;
}`;

    const uri = 'file:///derived.pike';
    const doc = TextDocument.create(uri, 'pike', 1, childCode);

    const docsMap = new Map([[uri, doc]]);
    const cacheEntries = new Map([
      [
        uri,
        makeCacheEntry({
          symbols: [
            sym('Derived', 'class', { position: { file: 'derived.pike', line: 1 } }),
            sym('Base', 'inherit', {
              position: { file: 'derived.pike', line: 2 },
              classname: 'Base',
            }),
          ],
        }),
      ],
    ]);

    const mockWorkspaceScanner = {
      isReady: () => true,
      getUncachedFiles: () => [
        {
          uri: 'file:///base.pike',
          path: 'file:///base.pike',
          lastModified: Date.now(),
        },
      ],
    };

    const services = createMockServices({
      cacheEntries,
      workspaceScanner: mockWorkspaceScanner,
    });
    const documents = createMockDocuments(docsMap);
    const conn = createMockConnection();

    registerHierarchyHandlers(conn as any, services as any, documents as any);

    const prepareResult = await conn.typeHierarchyPrepareHandler({
      textDocument: { uri },
      position: { line: 0, character: 6 },
    });

    expect(prepareResult).not.toBeNull();
    expect(prepareResult![0]!.name).toBe('Derived');

    const supertypesResult = await conn.typeHierarchySupertypesHandler({
      item: prepareResult![0]!,
      direction: 'parents',
    });

    expect(Array.isArray(supertypesResult)).toBe(true);
  });

  it('should handle workspace scanner not ready', async () => {
    const childCode = `class Derived {
    inherit Base;
}`;

    const uri = 'file:///derived.pike';
    const doc = TextDocument.create(uri, 'pike', 1, childCode);

    const docsMap = new Map([[uri, doc]]);
    const cacheEntries = new Map([
      [
        uri,
        makeCacheEntry({
          symbols: [
            sym('Derived', 'class', { position: { file: 'derived.pike', line: 1 } }),
            sym('Base', 'inherit', {
              position: { file: 'derived.pike', line: 2 },
              classname: 'Base',
            }),
          ],
        }),
      ],
    ]);

    const mockWorkspaceScanner = {
      isReady: () => false,
      getUncachedFiles: () => [],
    };

    const services = createMockServices({
      cacheEntries,
      workspaceScanner: mockWorkspaceScanner,
    });
    const documents = createMockDocuments(docsMap);
    const conn = createMockConnection();

    registerHierarchyHandlers(conn as any, services as any, documents as any);

    const prepareResult = await conn.typeHierarchyPrepareHandler({
      textDocument: { uri },
      position: { line: 0, character: 6 },
    });

    const supertypesResult = await conn.typeHierarchySupertypesHandler({
      item: prepareResult![0]!,
      direction: 'parents',
    });

    expect(Array.isArray(supertypesResult)).toBe(true);
  });

  it('uses parser symbols for uncached subtype discovery with multiline inherit statements', async () => {
    const baseUri = 'file:///base.pike';
    const baseDoc = TextDocument.create(baseUri, 'pike', 1, 'class Base {}\n');

    const tempDir = await mkdtemp(join(tmpdir(), 'pike-lsp-subtypes-'));
    const uncachedPath = join(tempDir, 'derived.pike');
    const uncachedUri = `file://${uncachedPath}`;

    await writeFile(uncachedPath, 'class Derived\n{\n    inherit\n        Base;\n}\n', 'utf-8');

    const services = createMockServices({
      cacheEntries: new Map([
        [
          baseUri,
          makeCacheEntry({
            symbols: [sym('Base', 'class', { position: { file: 'base.pike', line: 1 } })],
          }),
        ],
      ]),
      workspaceScanner: {
        isReady: () => true,
        getUncachedFiles: () => [
          { uri: uncachedUri, path: uncachedPath, lastModified: Date.now() },
        ],
      } as any,
      bridge: {
        bridge: {
          analyze: async () => ({
            result: {
              parse: {
                symbols: [
                  sym('Derived', 'class', { position: { file: uncachedPath, line: 1 } }),
                  sym('Base', 'inherit', {
                    position: { file: uncachedPath, line: 3 },
                    classname: 'Base',
                  }),
                ],
              },
            },
          }),
        },
      },
    });

    const documents = createMockDocuments(new Map([[baseUri, baseDoc]]));
    const conn = createMockConnection();
    registerHierarchyHandlers(conn as any, services as any, documents as any);

    const result = await conn.typeHierarchySubtypesHandler({
      item: {
        name: 'Base',
        kind: 5,
        uri: baseUri,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 4 },
        },
        selectionRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 4 },
        },
        detail: 'class Base',
      },
      direction: 'children',
    });

    expect(result?.some(item => item.name === 'Derived' && item.uri === uncachedUri)).toBe(true);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('ignores lexical inherit text in uncached files when parser emits no inherit symbol', async () => {
    const baseUri = 'file:///base.pike';
    const baseDoc = TextDocument.create(baseUri, 'pike', 1, 'class Base {}\n');

    const tempDir = await mkdtemp(join(tmpdir(), 'pike-lsp-subtypes-lexical-'));
    const uncachedPath = join(tempDir, 'string-literal.pike');
    const uncachedUri = `file://${uncachedPath}`;

    await writeFile(
      uncachedPath,
      'class FakeChild { string example = "inherit Base;"; }\n',
      'utf-8'
    );

    const services = createMockServices({
      cacheEntries: new Map([
        [
          baseUri,
          makeCacheEntry({
            symbols: [sym('Base', 'class', { position: { file: 'base.pike', line: 1 } })],
          }),
        ],
      ]),
      workspaceScanner: {
        isReady: () => true,
        getUncachedFiles: () => [
          { uri: uncachedUri, path: uncachedPath, lastModified: Date.now() },
        ],
      } as any,
      bridge: {
        bridge: {
          analyze: async () => ({
            result: {
              parse: {
                symbols: [
                  sym('FakeChild', 'class', {
                    position: { file: uncachedPath, line: 1 },
                  }),
                ],
              },
            },
          }),
        },
      },
    });

    const documents = createMockDocuments(new Map([[baseUri, baseDoc]]));
    const conn = createMockConnection();
    registerHierarchyHandlers(conn as any, services as any, documents as any);

    const result = await conn.typeHierarchySubtypesHandler({
      item: {
        name: 'Base',
        kind: 5,
        uri: baseUri,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 4 },
        },
        selectionRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 4 },
        },
        detail: 'class Base',
      },
      direction: 'children',
    });

    expect(result?.some(item => item.uri === uncachedUri)).toBe(false);
    await rm(tempDir, { recursive: true, force: true });
  });
});
