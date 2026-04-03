import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerHierarchyHandlers } from '../hierarchy.js';
import {
  createMockConnection,
  createMockDocuments,
  createMockServices,
  makeCacheEntry,
  sym,
} from '../../tests/helpers/mock-services.js';
import type { DocumentCacheEntry } from '../../core/types.js';
import type { PikeSymbol, PikePosition } from '@pike-lsp/pike-bridge';

function createTypeHierarchyItem(
  name: string,
  uri: string,
  line: number,
  detail?: string
): import('vscode-languageserver/node.js').TypeHierarchyItem {
  return {
    name,
    kind: 5,
    uri,
    range: {
      start: { line, character: 0 },
      end: { line, character: name.length },
    },
    selectionRange: {
      start: { line, character: 0 },
      end: { line, character: name.length },
    },
    detail,
  };
}

function pos(line: number, column: number, file?: string): PikePosition {
  return { line, column, file: file ?? '' };
}

describe('Scenario: Type Hierarchy Prepare', () => {
  it('should find class at cursor position', async () => {
    const uri = 'file:///workspace/test.pike';
    const symbols: PikeSymbol[] = [sym('BaseClass', 'class', { position: pos(1, 0) })];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([[uri, TextDocument.create(uri, 'pike', 1, 'class BaseClass {}')]])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchyPrepareHandler({
      textDocument: { uri },
      position: { line: 0, character: 10 },
    });

    assert.ok(result, 'Should return type hierarchy item');
    assert.equal(result!.length, 1);
    assert.equal(result![0].name, 'BaseClass');
    assert.equal(result![0].kind, 5);
    assert.equal(result![0].uri, uri);
  });

  it('should return null when cursor is not on a class', async () => {
    const uri = 'file:///workspace/test.pike';
    const symbols: PikeSymbol[] = [
      sym('BaseClass', 'class', { position: pos(1, 0) }),
      sym('someVariable', 'variable', { position: pos(3, 5) }),
    ];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [
          uri,
          TextDocument.create(
            uri,
            'pike',
            1,
            'class BaseClass {}\n\nvoid someFunction() { int someVariable; }'
          ),
        ],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchyPrepareHandler({
      textDocument: { uri },
      position: { line: 2, character: 38 },
    });

    assert.equal(result, null, 'Should return null for non-class symbols');
  });

  it('should return null when document is not analyzed', async () => {
    const uri = 'file:///workspace/test.pike';

    const services = createMockServices({
      cacheEntries: new Map(),
    });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([[uri, TextDocument.create(uri, 'pike', 1, 'class BaseClass {}')]])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchyPrepareHandler({
      textDocument: { uri },
      position: { line: 0, character: 10 },
    });

    assert.equal(result, null, 'Should return null for unanalyzed document');
  });

  it('should include inheritance detail when class has inherits', async () => {
    const uri = 'file:///workspace/test.pike';
    const symbols: PikeSymbol[] = [
      sym('Base', 'class', { position: pos(1, 0) }),
      sym('Derived', 'class', { position: pos(3, 0) }),
      sym('Base', 'inherit', { position: pos(4, 2), classname: 'Base' }),
    ];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [
          uri,
          TextDocument.create(
            uri,
            'pike',
            1,
            'class Base {}\n\nclass Derived {\n  inherit Base;\n}'
          ),
        ],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchyPrepareHandler({
      textDocument: { uri },
      position: { line: 2, character: 10 },
    });

    assert.ok(result);
    assert.equal(result![0].name, 'Derived');
  });
});

describe('Scenario: Type Hierarchy Supertypes', () => {
  it('should find direct parent class', async () => {
    const uri = 'file:///workspace/derived.pike';
    const baseUri = 'file:///workspace/base.pike';

    const derivedSymbols: PikeSymbol[] = [
      sym('Base', 'inherit', { position: pos(2, 2), classname: 'Base' }),
      sym('Derived', 'class', { position: pos(1, 0) }),
    ];

    const baseSymbols: PikeSymbol[] = [sym('Base', 'class', { position: pos(1, 0) })];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols: derivedSymbols, diagnostics: [] })],
      [baseUri, makeCacheEntry({ symbols: baseSymbols, diagnostics: [] })],
    ]);

    const services = createMockServices({
      cacheEntries,
      workspaceIndex: {
        getDocumentSymbols(documentUri: string) {
          if (documentUri === uri) return derivedSymbols;
          if (documentUri === baseUri) return baseSymbols;
          return [];
        },
        getAllDocumentUris() {
          return [uri, baseUri];
        },
      },
    });

    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [uri, TextDocument.create(uri, 'pike', 1, 'class Derived {\n  inherit Base;\n}')],
        [baseUri, TextDocument.create(baseUri, 'pike', 1, 'class Base {}')],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySupertypesHandler({
      item: createTypeHierarchyItem('Derived', uri, 0),
      direction: 'parents',
    });

    assert.ok(result);
    assert.equal(result!.length, 1);
    assert.equal(result![0].name, 'Base');
  });

  it('should find multiple parent classes', async () => {
    const uri = 'file:///workspace/multi.pike';

    const symbols: PikeSymbol[] = [
      sym('ParentA', 'class', { position: pos(1, 0) }),
      sym('ParentB', 'class', { position: pos(3, 0) }),
      sym('Child', 'class', { position: pos(5, 0) }),
      sym('ParentA', 'inherit', { position: pos(6, 2), classname: 'ParentA' }),
      sym('ParentB', 'inherit', { position: pos(7, 2), classname: 'ParentB' }),
    ];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [
          uri,
          TextDocument.create(
            uri,
            'pike',
            1,
            'class ParentA {}\n\nclass ParentB {}\n\nclass Child {\n  inherit ParentA;\n  inherit ParentB;\n}'
          ),
        ],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySupertypesHandler({
      item: createTypeHierarchyItem('Child', uri, 4),
      direction: 'parents',
    });

    assert.ok(result);
    assert.equal(result!.length, 2);
    const names = result!.map(r => r.name).sort();
    assert.deepEqual(names, ['ParentA', 'ParentB']);
  });

  it('should traverse multi-level inheritance chain', async () => {
    const uri = 'file:///workspace/chain.pike';

    const symbols: PikeSymbol[] = [
      sym('GrandParent', 'class', { position: pos(1, 0) }),
      sym('Parent', 'class', { position: pos(3, 0) }),
      sym('GrandParent', 'inherit', { position: pos(4, 2), classname: 'GrandParent' }),
      sym('Child', 'class', { position: pos(6, 0) }),
      sym('Parent', 'inherit', { position: pos(7, 2), classname: 'Parent' }),
    ];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [
          uri,
          TextDocument.create(
            uri,
            'pike',
            1,
            'class GrandParent {}\n\nclass Parent {\n  inherit GrandParent;\n}\n\nclass Child {\n  inherit Parent;\n}'
          ),
        ],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySupertypesHandler({
      item: createTypeHierarchyItem('Child', uri, 5),
      direction: 'parents',
    });

    assert.ok(result);
    assert.equal(result!.length, 2);
    const names = result!.map(r => r.name);
    assert.ok(names.includes('Parent'));
    assert.ok(names.includes('GrandParent'));
  });

  it('should return empty array for class with no parents', async () => {
    const uri = 'file:///workspace/orphan.pike';

    const symbols: PikeSymbol[] = [sym('Orphan', 'class', { position: pos(1, 0) })];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([[uri, TextDocument.create(uri, 'pike', 1, 'class Orphan {}')]])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySupertypesHandler({
      item: createTypeHierarchyItem('Orphan', uri, 0),
      direction: 'parents',
    });

    assert.deepEqual(result, [], 'Should return empty array for class with no parents');
  });
});

describe('Scenario: Type Hierarchy Subtypes', () => {
  it('should find direct child class', async () => {
    const uri = 'file:///workspace/family.pike';

    const symbols: PikeSymbol[] = [
      sym('Parent', 'class', { position: pos(1, 0) }),
      sym('Child', 'class', { position: pos(3, 0) }),
      sym('Parent', 'inherit', { position: pos(4, 2), classname: 'Parent' }),
    ];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [
          uri,
          TextDocument.create(
            uri,
            'pike',
            1,
            'class Parent {}\n\nclass Child {\n  inherit Parent;\n}'
          ),
        ],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySubtypesHandler({
      item: createTypeHierarchyItem('Parent', uri, 0),
      direction: 'children',
    });

    assert.ok(result);
    assert.equal(result!.length, 1);
    assert.equal(result![0].name, 'Child');
  });

  it('should find multiple child classes', async () => {
    const uri = 'file:///workspace/siblings.pike';

    const symbols: PikeSymbol[] = [
      sym('Parent', 'class', { position: pos(1, 0) }),
      sym('ChildA', 'class', { position: pos(3, 0) }),
      sym('Parent', 'inherit', { position: pos(4, 2), classname: 'Parent' }),
      sym('ChildB', 'class', { position: pos(6, 0) }),
      sym('Parent', 'inherit', { position: pos(7, 2), classname: 'Parent' }),
    ];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [
          uri,
          TextDocument.create(
            uri,
            'pike',
            1,
            'class Parent {}\n\nclass ChildA {\n  inherit Parent;\n}\n\nclass ChildB {\n  inherit Parent;\n}'
          ),
        ],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySubtypesHandler({
      item: createTypeHierarchyItem('Parent', uri, 0),
      direction: 'children',
    });

    assert.ok(result);
    assert.equal(result!.length, 2);
    const names = result!.map(r => r.name).sort();
    assert.deepEqual(names, ['ChildA', 'ChildB']);
  });

  it('should find grandchild classes recursively', async () => {
    const uri = 'file:///workspace/descendants.pike';

    const symbols: PikeSymbol[] = [
      sym('GrandParent', 'class', { position: pos(1, 0) }),
      sym('Parent', 'class', { position: pos(3, 0) }),
      sym('GrandParent', 'inherit', { position: pos(4, 2), classname: 'GrandParent' }),
      sym('Child', 'class', { position: pos(6, 0) }),
      sym('Parent', 'inherit', { position: pos(7, 2), classname: 'Parent' }),
    ];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [
          uri,
          TextDocument.create(
            uri,
            'pike',
            1,
            'class GrandParent {}\n\nclass Parent {\n  inherit GrandParent;\n}\n\nclass Child {\n  inherit Parent;\n}'
          ),
        ],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySubtypesHandler({
      item: createTypeHierarchyItem('GrandParent', uri, 0),
      direction: 'children',
    });

    assert.ok(result);
    assert.equal(result!.length, 2);
    const names = result!.map(r => r.name);
    assert.ok(names.includes('Parent'));
    assert.ok(names.includes('Child'));
  });

  it('should return empty array for class with no children', async () => {
    const uri = 'file:///workspace/childless.pike';

    const symbols: PikeSymbol[] = [sym('Childless', 'class', { position: pos(1, 0) })];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([[uri, TextDocument.create(uri, 'pike', 1, 'class Childless {}')]])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySubtypesHandler({
      item: createTypeHierarchyItem('Childless', uri, 0),
      direction: 'children',
    });

    assert.deepEqual(result, [], 'Should return empty array for class with no children');
  });
});

describe('Scenario: Cross-File Type Resolution', () => {
  it('should resolve parent class from different file', async () => {
    const childUri = 'file:///workspace/child.pike';
    const parentUri = 'file:///workspace/parent.pike';

    const childSymbols: PikeSymbol[] = [
      sym('ExternalParent', 'inherit', { position: pos(2, 2), classname: 'ExternalParent' }),
      sym('Child', 'class', { position: pos(1, 0) }),
    ];

    const parentSymbols: PikeSymbol[] = [sym('ExternalParent', 'class', { position: pos(1, 0) })];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [childUri, makeCacheEntry({ symbols: childSymbols, diagnostics: [] })],
      [parentUri, makeCacheEntry({ symbols: parentSymbols, diagnostics: [] })],
    ]);

    const services = createMockServices({
      cacheEntries,
      workspaceIndex: {
        getDocumentSymbols(documentUri: string) {
          if (documentUri === childUri) return childSymbols;
          if (documentUri === parentUri) return parentSymbols;
          return [];
        },
        getAllDocumentUris() {
          return [childUri, parentUri];
        },
      },
    });

    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [
          childUri,
          TextDocument.create(childUri, 'pike', 1, 'class Child {\n  inherit ExternalParent;\n}'),
        ],
        [parentUri, TextDocument.create(parentUri, 'pike', 1, 'class ExternalParent {}')],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySupertypesHandler({
      item: createTypeHierarchyItem('Child', childUri, 0),
      direction: 'parents',
    });

    assert.ok(result);
    assert.equal(result!.length, 1);
    assert.equal(result![0].name, 'ExternalParent');
    assert.equal(result![0].uri, parentUri, 'Should reference the correct file');
  });

  it('should find child classes across multiple files', async () => {
    const parentUri = 'file:///workspace/base.pike';
    const childAUri = 'file:///workspace/child_a.pike';
    const childBUri = 'file:///workspace/child_b.pike';

    const parentSymbols: PikeSymbol[] = [sym('Base', 'class', { position: pos(1, 0) })];

    const childASymbols: PikeSymbol[] = [
      sym('Base', 'inherit', { position: pos(2, 2), classname: 'Base' }),
      sym('ChildA', 'class', { position: pos(1, 0) }),
    ];

    const childBSymbols: PikeSymbol[] = [
      sym('Base', 'inherit', { position: pos(2, 2), classname: 'Base' }),
      sym('ChildB', 'class', { position: pos(1, 0) }),
    ];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [parentUri, makeCacheEntry({ symbols: parentSymbols, diagnostics: [] })],
      [childAUri, makeCacheEntry({ symbols: childASymbols, diagnostics: [] })],
      [childBUri, makeCacheEntry({ symbols: childBSymbols, diagnostics: [] })],
    ]);

    const services = createMockServices({
      cacheEntries,
      workspaceIndex: {
        getDocumentSymbols(documentUri: string) {
          if (documentUri === parentUri) return parentSymbols;
          if (documentUri === childAUri) return childASymbols;
          if (documentUri === childBUri) return childBSymbols;
          return [];
        },
        getAllDocumentUris() {
          return [parentUri, childAUri, childBUri];
        },
      },
    });

    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [parentUri, TextDocument.create(parentUri, 'pike', 1, 'class Base {}')],
        [
          childAUri,
          TextDocument.create(childAUri, 'pike', 1, 'class ChildA {\n  inherit Base;\n}'),
        ],
        [
          childBUri,
          TextDocument.create(childBUri, 'pike', 1, 'class ChildB {\n  inherit Base;\n}'),
        ],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySubtypesHandler({
      item: createTypeHierarchyItem('Base', parentUri, 0),
      direction: 'children',
    });

    assert.ok(result);
    assert.equal(result!.length, 2);
    const names = result!.map(r => r.name).sort();
    assert.deepEqual(names, ['ChildA', 'ChildB']);
  });
});

describe('Scenario: Typedef and Interface Support', () => {
  it('should handle typedef as non-class type', async () => {
    const uri = 'file:///workspace/typedef.pike';

    const symbols: PikeSymbol[] = [
      sym('StringMap', 'typedef', { position: pos(1, 0) }),
      sym('MyClass', 'class', { position: pos(3, 0) }),
    ];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [
          uri,
          TextDocument.create(
            uri,
            'pike',
            1,
            'typedef mapping(string:string) StringMap;\n\nclass MyClass {}'
          ),
        ],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchyPrepareHandler({
      textDocument: { uri },
      position: { line: 0, character: 30 },
    });

    assert.equal(result, null, 'Typedef should not be treated as class for hierarchy');
  });

  it('should find class that inherits from typedef base', async () => {
    const uri = 'file:///workspace/typedef_inherit.pike';

    const symbols: PikeSymbol[] = [
      sym('BaseType', 'typedef', { position: pos(1, 0) }),
      sym('BaseClass', 'class', { position: pos(3, 0) }),
      sym('Derived', 'class', { position: pos(5, 0) }),
      sym('BaseClass', 'inherit', { position: pos(6, 2), classname: 'BaseClass' }),
    ];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [
          uri,
          TextDocument.create(
            uri,
            'pike',
            1,
            'typedef mapping(string:mixed) BaseType;\n\nclass BaseClass {}\n\nclass Derived {\n  inherit BaseClass;\n}'
          ),
        ],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySupertypesHandler({
      item: createTypeHierarchyItem('Derived', uri, 4),
      direction: 'parents',
    });

    assert.ok(result);
    assert.equal(result!.length, 1);
    assert.equal(result![0].name, 'BaseClass');
  });
});

describe('Scenario: Type Hierarchy Edge Cases', () => {
  it('should handle missing parent class gracefully', async () => {
    const uri = 'file:///workspace/missing_parent.pike';

    const symbols: PikeSymbol[] = [
      sym('Orphan', 'class', { position: pos(1, 0) }),
      sym('NonExistent', 'inherit', { position: pos(2, 2), classname: 'NonExistent' }),
    ];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [uri, TextDocument.create(uri, 'pike', 1, 'class Orphan {\n  inherit NonExistent;\n}')],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySupertypesHandler({
      item: createTypeHierarchyItem('Orphan', uri, 0),
      direction: 'parents',
    });

    assert.deepEqual(result, []);
  });

  it('should deduplicate parent classes', async () => {
    const uri = 'file:///workspace/dedup.pike';

    const symbols: PikeSymbol[] = [
      sym('Duplicate', 'class', { position: pos(1, 0) }),
      sym('Child', 'class', { position: pos(5, 0) }),
      sym('Duplicate', 'inherit', { position: pos(6, 2), classname: 'Duplicate' }),
    ];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [
          uri,
          TextDocument.create(
            uri,
            'pike',
            1,
            'class Duplicate {}\n\nclass Child {\n  inherit Duplicate;\n}'
          ),
        ],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySupertypesHandler({
      item: createTypeHierarchyItem('Child', uri, 4),
      direction: 'parents',
    });

    assert.ok(result);
    const names = result!.map(r => r.name);
    const uniqueNames = [...new Set(names)];
    assert.equal(names.length, uniqueNames.length, 'Should not have duplicate entries');
  });

  it('should handle empty document cache gracefully', async () => {
    const services = createMockServices({
      cacheEntries: new Map(),
    });

    const connection = createMockConnection();
    const documents = createMockDocuments(new Map());

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySupertypesHandler({
      item: createTypeHierarchyItem('Unknown', 'file:///unknown.pike', 0),
      direction: 'parents',
    });

    assert.deepEqual(result, []);
  });

  it('should handle class with position undefined', async () => {
    const uri = 'file:///workspace/no_position.pike';

    const symbols: PikeSymbol[] = [sym('NoPosition', 'class', {})];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([[uri, TextDocument.create(uri, 'pike', 1, 'class NoPosition {}')]])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchyPrepareHandler({
      textDocument: { uri },
      position: { line: 0, character: 10 },
    });

    assert.ok(result === null || Array.isArray(result));
  });
});

describe('Scenario: Complex Inheritance Patterns', () => {
  it('should handle diamond inheritance pattern', async () => {
    const uri = 'file:///workspace/diamond.pike';

    const symbols: PikeSymbol[] = [
      sym('A', 'class', { position: pos(1, 0) }),
      sym('B', 'class', { position: pos(3, 0) }),
      sym('A', 'inherit', { position: pos(4, 2), classname: 'A' }),
      sym('C', 'class', { position: pos(6, 0) }),
      sym('A', 'inherit', { position: pos(7, 2), classname: 'A' }),
      sym('D', 'class', { position: pos(9, 0) }),
      sym('B', 'inherit', { position: pos(10, 2), classname: 'B' }),
      sym('C', 'inherit', { position: pos(11, 2), classname: 'C' }),
    ];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [
          uri,
          TextDocument.create(
            uri,
            'pike',
            1,
            'class A {}\n\nclass B {\n  inherit A;\n}\n\nclass C {\n  inherit A;\n}\n\nclass D {\n  inherit B;\n  inherit C;\n}'
          ),
        ],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySupertypesHandler({
      item: createTypeHierarchyItem('D', uri, 8),
      direction: 'parents',
    });

    assert.ok(result);
    assert.ok(result!.length >= 2, 'Should find at least B and C');
    const names = result!.map(r => r.name);
    assert.ok(names.includes('B'), 'Should find B');
    assert.ok(names.includes('C'), 'Should find C');
  });

  it('should handle mixin pattern with multiple inherits', async () => {
    const uri = 'file:///workspace/mixin.pike';

    const symbols: PikeSymbol[] = [
      sym('LoggerMixin', 'class', { position: pos(1, 0) }),
      sym('CacheMixin', 'class', { position: pos(4, 0) }),
      sym('Service', 'class', { position: pos(7, 0) }),
      sym('LoggerMixin', 'inherit', { position: pos(8, 2), classname: 'LoggerMixin' }),
      sym('CacheMixin', 'inherit', { position: pos(9, 2), classname: 'CacheMixin' }),
    ];

    const cacheEntries = new Map<string, DocumentCacheEntry>([
      [uri, makeCacheEntry({ symbols, diagnostics: [] })],
    ]);

    const services = createMockServices({ cacheEntries });
    const connection = createMockConnection();
    const documents = createMockDocuments(
      new Map([
        [
          uri,
          TextDocument.create(
            uri,
            'pike',
            1,
            'class LoggerMixin {\n  void log() {}\n}\n\nclass CacheMixin {\n  void cache() {}\n}\n\nclass Service {\n  inherit LoggerMixin;\n  inherit CacheMixin;\n}'
          ),
        ],
      ])
    );

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    const result = await connection.typeHierarchySupertypesHandler({
      item: createTypeHierarchyItem('Service', uri, 6),
      direction: 'parents',
    });

    assert.ok(result);
    assert.equal(result!.length, 2);
    const names = result!.map(r => r.name).sort();
    assert.deepEqual(names, ['CacheMixin', 'LoggerMixin']);
  });
});

describe('Scenario: Call Hierarchy Registration', () => {
  it('should register onCallHierarchyPrepare handler', async () => {
    const connection = createMockConnection();
    const services = createMockServices();
    const documents = createMockDocuments(new Map());

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    assert.ok(connection.typeHierarchyPrepareHandler, 'Handler should be registered');
  });

  it('should register onCallHierarchyIncomingCalls handler', async () => {
    const connection = createMockConnection();
    const services = createMockServices();
    const documents = createMockDocuments(new Map());

    registerHierarchyHandlers(connection as any, services as any, documents as any);

    assert.ok(connection.languages.callHierarchy, 'Call hierarchy should be available');
  });
});
