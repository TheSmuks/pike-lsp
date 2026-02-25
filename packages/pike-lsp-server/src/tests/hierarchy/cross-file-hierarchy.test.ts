/**
 * Cross-File Type Hierarchy Tests
 *
 * TDD tests for cross-file type hierarchy functionality.
 * These tests FAIL initially and pass after implementation.
 *
 * Scenario: Class in file A inherits from class in file B
 * Expected: Type hierarchy should resolve parent class across files
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { DocumentCacheEntry } from '../../core/types.js';
import { registerHierarchyHandlers } from '../../features/hierarchy.js';
import {
  createMockConnection,
  createMockServices,
  createMockDocuments,
  makeCacheEntry,
  sym,
} from '../helpers/mock-services.js';

describe('Cross-File Type Hierarchy', () => {
  /**
   * Test: Supertypes across files
   * GIVEN: Derived class in derived.pike inherits from Base in base.pike
   * WHEN: User invokes type hierarchy supertypes on Derived
   * THEN: Should return Base class from base.pike
   */
  describe('Supertypes - cross file', () => {
    it('should find parent class in separate file', async () => {
      // Setup: Two files - base.pike and derived.pike
      const baseUri = 'file:///test/base.pike';
      const derivedUri = 'file:///test/derived.pike';

      // Base class symbols
      const baseSymbols: PikeSymbol[] = [
        sym('Base', 'class', {
          position: { line: 1, column: 0 },
        }),
      ];

      // Derived class symbols with inherit statement
      const derivedSymbols: PikeSymbol[] = [
        sym('Base', 'inherit', {
          position: { line: 2, column: 4 },
          classname: 'Base',
        }),
        sym('Derived', 'class', {
          position: { line: 2, column: 0 },
        }),
      ];

      // Create mock documents
      const baseText = 'class Base { void method() { } }';
      const derivedText = 'inherit "base.pike";\nclass Derived { inherit Base; }';
      const documents = createMockDocuments(
        new Map([
          [
            baseUri,
            {
              uri: baseUri,
              getText: () => baseText,
              offsetAt: () => 0,
              version: 1,
            } as TextDocument,
          ],
          [
            derivedUri,
            {
              uri: derivedUri,
              getText: () => derivedText,
              offsetAt: () => 0,
              version: 1,
            } as TextDocument,
          ],
        ])
      );

      // Create mock services with workspaceIndex that can find Base class
      const mockWorkspaceIndex = {
        getDocumentSymbols: (uri: string) => {
          if (uri === baseUri) return baseSymbols;
          if (uri === derivedUri) return derivedSymbols;
          return [];
        },
      };

      const services = createMockServices({
        cacheEntries: new Map<string, DocumentCacheEntry>([
          [baseUri, makeCacheEntry({ symbols: baseSymbols })],
          [derivedUri, makeCacheEntry({ symbols: derivedSymbols })],
        ]),
        workspaceIndex: mockWorkspaceIndex,
      });

      const connection = createMockConnection();

      // Register handlers
      registerHierarchyHandlers(connection as any, services, documents);

      // Test: Get supertypes of Derived
      const supertypesHandler = connection.typeHierarchySupertypesHandler;
      assert.ok(supertypesHandler, 'Supertypes handler should be registered');

      const result = await supertypesHandler({
        item: {
          name: 'Derived',
          kind: 5, // SymbolKind.Class
          uri: derivedUri,
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 8 },
          },
          selectionRange: {
            start: { line: 2, character: 0 },
            end: { line: 2, character: 8 },
          },
          detail: 'class Derived',
        },
        direction: 1, // 1 = supertypes
      });

      // ASSERT: Should find Base class from base.pike
      assert.ok(Array.isArray(result), 'Result should be an array');
      assert.strictEqual(result.length, 1, 'Should have 1 supertype (Base)');
      assert.strictEqual(result[0].name, 'Base', 'Supertype name should be Base');
      assert.strictEqual(result[0].uri, baseUri, 'Supertype should be from base.pike');
    });
  });

  /**
   * Test: Subtypes across files
   * GIVEN: Base class in base.pike is inherited by Derived in derived.pike
   * WHEN: User invokes type hierarchy subtypes on Base
   * THEN: Should return Derived class from derived.pike
   */
  describe('Subtypes - cross file', () => {
    it('should find child classes in separate files', async () => {
      // Setup: Two files - base.pike and derived.pike
      const baseUri = 'file:///test/base.pike';
      const derivedUri = 'file:///test/derived.pike';

      // Base class symbols
      const baseSymbols: PikeSymbol[] = [
        sym('Base', 'class', {
          position: { line: 1, column: 0 },
        }),
      ];

      // Derived class symbols with inherit statement
      const derivedSymbols: PikeSymbol[] = [
        sym('Base', 'inherit', {
          position: { line: 2, column: 4 },
          classname: 'Base',
        }),
        sym('Derived', 'class', {
          position: { line: 2, column: 0 },
        }),
      ];

      // Create mock documents
      const baseText = 'class Base { void method() { } }';
      const derivedText = 'inherit "base.pike";\nclass Derived { inherit Base; }';
      const documents = createMockDocuments(
        new Map([
          [
            baseUri,
            {
              uri: baseUri,
              getText: () => baseText,
              offsetAt: () => 0,
              version: 1,
            } as TextDocument,
          ],
          [
            derivedUri,
            {
              uri: derivedUri,
              getText: () => derivedText,
              offsetAt: () => 0,
              version: 1,
            } as TextDocument,
          ],
        ])
      );

      // Create mock services with workspaceIndex
      const mockWorkspaceIndex = {
        getDocumentSymbols: (uri: string) => {
          if (uri === baseUri) return baseSymbols;
          if (uri === derivedUri) return derivedSymbols;
          return [];
        },
      };

      const services = createMockServices({
        cacheEntries: new Map<string, DocumentCacheEntry>([
          [baseUri, makeCacheEntry({ symbols: baseSymbols })],
          [derivedUri, makeCacheEntry({ symbols: derivedSymbols })],
        ]),
        workspaceIndex: mockWorkspaceIndex,
      });

      const connection = createMockConnection();

      // Register handlers
      registerHierarchyHandlers(connection as any, services, documents);

      // Test: Get subtypes of Base
      const subtypesHandler = connection.typeHierarchySubtypesHandler;
      assert.ok(subtypesHandler, 'Subtypes handler should be registered');

      const result = await subtypesHandler({
        item: {
          name: 'Base',
          kind: 5, // SymbolKind.Class
          uri: baseUri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 4 },
          },
          selectionRange: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 4 },
          },
          detail: 'class Base',
        },
        direction: 2, // 2 = subtypes
      });

      // ASSERT: Should find Derived class from derived.pike
      // This should PASS because subtypes already searches all cached documents
      assert.ok(Array.isArray(result), 'Result should be an array');
      assert.ok(result.length >= 1, 'Should have at least 1 subtype (Derived)');
      const derived = result.find((r: any) => r.name === 'Derived');
      assert.ok(derived, 'Should find Derived as subtype');
      assert.strictEqual(derived.uri, derivedUri, 'Derived should be from derived.pike');
    });
  });

  /**
   * Test: Multi-level inheritance across files
   * GIVEN: GrandParent in file A, Parent in file B inherits GrandParent, Child in file C inherits Parent
   * WHEN: User invokes type hierarchy supertypes on Child
   * THEN: Should show both Parent and GrandParent with correct URIs
   */
  describe('Multi-level cross-file inheritance', () => {
    it('should traverse inheritance chain across multiple files', async () => {
      // Setup: Three files with inheritance chain
      const grandParentUri = 'file:///test/grandparent.pike';
      const parentUri = 'file:///test/parent.pike';
      const childUri = 'file:///test/child.pike';

      // GrandParent class symbols
      const grandParentSymbols: PikeSymbol[] = [
        sym('GrandParent', 'class', {
          position: { line: 1, column: 0 },
        }),
      ];

      // Parent class symbols inheriting from GrandParent
      const parentSymbols: PikeSymbol[] = [
        sym('GrandParent', 'inherit', {
          position: { line: 2, column: 4 },
          classname: 'GrandParent',
        }),
        sym('Parent', 'class', {
          position: { line: 2, column: 0 },
        }),
      ];

      // Child class symbols inheriting from Parent
      const childSymbols: PikeSymbol[] = [
        sym('Parent', 'inherit', {
          position: { line: 2, column: 4 },
          classname: 'Parent',
        }),
        sym('Child', 'class', {
          position: { line: 2, column: 0 },
        }),
      ];

      // Create mock documents
      const grandParentText = 'class GrandParent { void gpMethod() { } }';
      const parentText = 'inherit "grandparent.pike";\nclass Parent { inherit GrandParent; }';
      const childText = 'inherit "parent.pike";\nclass Child { inherit Parent; }';
      const documents = createMockDocuments(
        new Map([
          [
            grandParentUri,
            {
              uri: grandParentUri,
              getText: () => grandParentText,
              offsetAt: () => 0,
              version: 1,
            } as TextDocument,
          ],
          [
            parentUri,
            {
              uri: parentUri,
              getText: () => parentText,
              offsetAt: () => 0,
              version: 1,
            } as TextDocument,
          ],
          [
            childUri,
            {
              uri: childUri,
              getText: () => childText,
              offsetAt: () => 0,
              version: 1,
            } as TextDocument,
          ],
        ])
      );

      // Create mock services with workspaceIndex
      const mockWorkspaceIndex = {
        getDocumentSymbols: (uri: string) => {
          if (uri === grandParentUri) return grandParentSymbols;
          if (uri === parentUri) return parentSymbols;
          if (uri === childUri) return childSymbols;
          return [];
        },
      };

      const services = createMockServices({
        cacheEntries: new Map<string, DocumentCacheEntry>([
          [grandParentUri, makeCacheEntry({ symbols: grandParentSymbols })],
          [parentUri, makeCacheEntry({ symbols: parentSymbols })],
          [childUri, makeCacheEntry({ symbols: childSymbols })],
        ]),
        workspaceIndex: mockWorkspaceIndex,
      });

      const connection = createMockConnection();

      // Register handlers
      registerHierarchyHandlers(connection as any, services, documents);

      // Test: Get supertypes of Child
      const supertypesHandler = connection.typeHierarchySupertypesHandler;

      const result = await supertypesHandler({
        item: {
          name: 'Child',
          kind: 5,
          uri: childUri,
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 5 },
          },
          selectionRange: {
            start: { line: 2, character: 0 },
            end: { line: 2, character: 5 },
          },
          detail: 'class Child',
        },
        direction: 1,
      });

      // ASSERT: Should find both Parent and GrandParent
      assert.ok(Array.isArray(result), 'Result should be an array');
      assert.ok(result.length >= 2, 'Should have at least 2 supertypes (Parent, GrandParent)');

      const parent = result.find((r: any) => r.name === 'Parent');
      const grandParent = result.find((r: any) => r.name === 'GrandParent');

      assert.ok(parent, 'Should find Parent as supertype');
      assert.strictEqual(parent.uri, parentUri, 'Parent should be from parent.pike');

      assert.ok(grandParent, 'Should find GrandParent as supertype');
      assert.strictEqual(
        grandParent.uri,
        grandParentUri,
        'GrandParent should be from grandparent.pike'
      );
    });
  });

  /**
   * Test: Circular inheritance detection across files
   * GIVEN: Class A in file1.pike inherits B, Class B in file2.pike inherits A
   * WHEN: User invokes type hierarchy on A
   * THEN: Should detect circular inheritance and show error diagnostic
   */
  describe('Cross-file circular inheritance detection', () => {
    it('should detect circular inheritance across files', async () => {
      // Setup: Two files with circular inheritance
      const file1Uri = 'file:///test/file1.pike';
      const file2Uri = 'file:///test/file2.pike';

      // File 1: Class A inherits B
      const file1Symbols: PikeSymbol[] = [
        sym('B', 'inherit', {
          position: { line: 2, column: 4 },
          classname: 'B',
        }),
        sym('A', 'class', {
          position: { line: 1, column: 0 },
        }),
      ];

      // File 2: Class B inherits A
      const file2Symbols: PikeSymbol[] = [
        sym('A', 'inherit', {
          position: { line: 2, column: 4 },
          classname: 'A',
        }),
        sym('B', 'class', {
          position: { line: 1, column: 0 },
        }),
      ];

      // Create mock documents
      const file1Text = 'class A { inherit B; }';
      const file2Text = 'class B { inherit A; }';
      const documents = createMockDocuments(
        new Map([
          [
            file1Uri,
            {
              uri: file1Uri,
              getText: () => file1Text,
              offsetAt: () => 0,
              version: 1,
            } as TextDocument,
          ],
          [
            file2Uri,
            {
              uri: file2Uri,
              getText: () => file2Text,
              offsetAt: () => 0,
              version: 1,
            } as TextDocument,
          ],
        ])
      );

      // Create mock services with workspaceIndex
      const mockWorkspaceIndex = {
        getDocumentSymbols: (uri: string) => {
          if (uri === file1Uri) return file1Symbols;
          if (uri === file2Uri) return file2Symbols;
          return [];
        },
      };

      const services = createMockServices({
        cacheEntries: new Map<string, DocumentCacheEntry>([
          [file1Uri, makeCacheEntry({ symbols: file1Symbols, diagnostics: [] })],
          [file2Uri, makeCacheEntry({ symbols: file2Symbols, diagnostics: [] })],
        ]),
        workspaceIndex: mockWorkspaceIndex,
      });

      const connection = createMockConnection();

      // Register handlers
      registerHierarchyHandlers(connection as any, services, documents);

      // Test: Get supertypes of A
      const supertypesHandler = connection.typeHierarchySupertypesHandler;

      const result = await supertypesHandler({
        item: {
          name: 'A',
          kind: 5,
          uri: file1Uri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          selectionRange: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 1 },
          },
          detail: 'class A',
        },
        direction: 1,
      });

      // ASSERT: Should detect circular inheritance
      // Find the circular inheritance diagnostic
      const sentDiagnostics = connection.getSentDiagnostics();
      const circularDiag = sentDiagnostics
        .flatMap((d: any) => d.diagnostics)
        .find((d: any) => d.message?.includes('Circular') || d.code === 'type-hierarchy');

      assert.ok(circularDiag, 'Should publish circular inheritance diagnostic');
      assert.strictEqual(
        circularDiag.severity,
        DiagnosticSeverity.Error,
        'Circular inheritance should be error'
      );
    });
  });
});
