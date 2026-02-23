import { describe, it, expect } from 'bun:test';
import type { DocumentLink } from 'vscode-languageserver/node.js';
import { registerDocumentLinksHandler } from '../../features/advanced/document-links.js';

describe('Document Links Handler Registration', () => {
    it('should register documentLink/resolve and resolve links as identity', async () => {
        let linksHandler: ((params: any) => DocumentLink[]) | null = null;
        let resolveHandler: ((link: DocumentLink) => DocumentLink | Promise<DocumentLink>) | null = null;

        const connection = {
            onDocumentLinks(handler: (params: any) => DocumentLink[]) {
                linksHandler = handler;
            },
            onDocumentLinkResolve(handler: (link: DocumentLink) => DocumentLink | Promise<DocumentLink>) {
                resolveHandler = handler;
            },
            console: {
                log: () => {},
            },
        };

        registerDocumentLinksHandler(
            connection as any,
            { documentCache: new Map() } as any,
            { get: () => undefined } as any,
            {} as any,
            []
        );

        expect(typeof linksHandler).toBe('function');
        expect(typeof resolveHandler).toBe('function');

        const link: DocumentLink = {
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 4 },
            },
            target: 'file:///tmp/example.pike',
        };

        const resolved = await resolveHandler!(link);
        expect(resolved).toEqual(link);
    });
});
