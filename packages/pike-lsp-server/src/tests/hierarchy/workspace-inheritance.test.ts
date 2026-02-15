/**
 * Workspace Inheritance Tests (Phase 6)
 * Tests for workspace file search for cross-file inheritance.
 * Issue #128: Add workspace file search for cross-file inheritance.
 */

import { describe, it, expect } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
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
            [uri, makeCacheEntry({
                symbols: [
                    sym('Derived', 'class', { position: { file: 'derived.pike', line: 1 } }),
                    sym('Base', 'inherit', {
                        position: { file: 'derived.pike', line: 2 },
                        classname: 'Base'
                    }),
                ],
            })],
        ]);

        const mockWorkspaceScanner = {
            isReady: () => true,
            getUncachedFiles: () => [{
                uri: 'file:///base.pike',
                path: 'file:///base.pike',
                lastModified: Date.now(),
            }],
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
            [uri, makeCacheEntry({
                symbols: [
                    sym('Derived', 'class', { position: { file: 'derived.pike', line: 1 } }),
                    sym('Base', 'inherit', {
                        position: { file: 'derived.pike', line: 2 },
                        classname: 'Base'
                    }),
                ],
            })],
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
});
