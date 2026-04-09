import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerNavigationHandlers } from '../features/navigation/index.js';
import { registerCompletionHandlers } from '../features/editing/completion.js';
import { registerCodeLensHandlers } from '../features/advanced/code-lens.js';
import { registerMonikerHandler } from '../features/advanced/moniker.js';
import {
  createMockConnection,
  createMockDocuments,
  createMockServices,
  makeCacheEntry,
  sym,
} from './helpers/mock-services.js';

const { describe, it, expect } = require('bun:test');

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
      onDocumentSymbol: () => {},
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

  it('registers $/logMessage protocol-compliance request handler', async () => {
    const connection = createMockConnection();
    registerMonikerHandler(connection as any, services as any, documents as any);

    const logMessageHandler = connection.getRequestHandler('$/logMessage');
    expect(typeof logMessageHandler).toBe('function');

    const result = await logMessageHandler?.({ message: 'hello' });
    expect(result).toBeNull();
  });

  it('registers $/cancelRequest and forwards cancel to bridge', async () => {
    const seen: string[] = [];
    const servicesWithBridge = createMockServices({
      bridge: {
        engineCancelRequest: async ({ requestId }: { requestId: string }) => {
          seen.push(requestId);
        },
      },
    });

    const connection = createMockConnection();
    registerMonikerHandler(connection as any, servicesWithBridge as any, documents as any);

    const cancelRequestHandler = connection.getRequestHandler('$/cancelRequest');
    expect(typeof cancelRequestHandler).toBe('function');

    const result = await cancelRequestHandler?.({ id: 42 });
    expect(result).toBeNull();
    expect(seen).toEqual(['42']);
  });

  it('decodes encoded file URIs when generating monikers', async () => {
    const uri = 'file:///tmp/encoded%20dir/alpha%23beta.pike';
    const document = TextDocument.create(uri, 'pike', 1, 'void encodedSymbol() {}\n');
    const documentsWithFile = createMockDocuments(new Map([[uri, document]]));
    const servicesWithCache = createMockServices({
      cacheEntries: new Map([
        [
          uri,
          makeCacheEntry({
            symbols: [
              sym('encodedSymbol', 'function', {
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 22 },
                },
              }),
            ],
          }),
        ],
      ]),
    });

    const connection = createMockConnection();
    registerMonikerHandler(connection as any, servicesWithCache as any, documentsWithFile as any);

    const monikerHandler = connection.monikerHandler;
    const result = await monikerHandler({
      textDocument: { uri },
      position: { line: 0, character: 5 },
    });

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result?.[0]).toMatchObject({
      scheme: 'pike',
      identifier: '/tmp/encoded dir/alpha#beta/encodedSymbol',
    });
  });
});
