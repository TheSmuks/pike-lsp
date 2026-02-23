import { describe, it, expect } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerNavigationHandlers } from '../features/navigation/index.js';
import { registerCompletionHandlers } from '../features/editing/completion.js';
import { registerCodeLensHandlers } from '../features/advanced/code-lens.js';
import { registerOnTypeFormattingHandler } from '../features/advanced/on-type-formatting.js';
import { createMockDocuments, createMockServices } from './helpers/mock-services.js';

const documents = createMockDocuments(new Map<string, TextDocument>());
const services = createMockServices();

describe('Runtime Protocol Compliance', () => {
    it('registers textDocument/implementation exactly once', () => {
        let implementationRegistrations = 0;

        const connection = {
            onHover: () => {},
            onDefinition: () => {},
            onDeclaration: () => {},
            onTypeDefinition: () => {},
            onReferences: () => {},
            onDocumentHighlight: () => {},
            onImplementation: () => {
                implementationRegistrations++;
            },
        };

        registerNavigationHandlers(connection as any, services as any, documents as any);

        expect(implementationRegistrations).toBe(1);
    });

    it('registers completion/resolve handler at runtime', () => {
        let completionResolveRegistrations = 0;

        const connection = {
            onCompletion: () => {},
            onCompletionResolve: () => {
                completionResolveRegistrations++;
            },
        };

        registerCompletionHandlers(connection as any, services as any, documents as any);

        expect(completionResolveRegistrations).toBe(1);
    });

    it('registers codeLens/resolve handler at runtime', () => {
        let codeLensResolveRegistrations = 0;

        const connection = {
            onCodeLens: () => {},
            onCodeLensResolve: () => {
                codeLensResolveRegistrations++;
            },
        };

        registerCodeLensHandlers(connection as any, services as any, documents as any);

        expect(codeLensResolveRegistrations).toBe(1);
    });

    it('registers onTypeFormatting triggers at runtime', () => {
        let triggerCharacters: string[] | null = null;

        const connection = {
            languages: {
                onTypeFormatting: (_handler: unknown, triggers: string[]) => {
                    triggerCharacters = triggers;
                },
            },
        };

        registerOnTypeFormattingHandler(connection as any, services as any, documents as any);

        expect(triggerCharacters).toEqual(['\n', ';', '}']);
    });
});
