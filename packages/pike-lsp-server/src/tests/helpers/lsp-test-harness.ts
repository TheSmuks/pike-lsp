/**
 * LSP Test Harness
 *
 * Standardized test environment for pike-lsp, inspired by vscode-go's Env class.
 * Loads real .pike files from testdata/ instead of inline strings.
 *
 * Usage:
 *   import { describe, it } from 'bun:test';
 *   import assert from 'node:assert/strict';
 *   import { LSPTestHarness } from '../helpers/lsp-test-harness.js';
 *
 *   describe('Diagnostics', () => {
 *     it('should detect syntax errors', async () => {
 *       const harness = new LSPTestHarness();
 *       const { content, uri } = await harness.loadFixture('diagnostics/missing-semicolon.pike');
 *       // test against real file content
 *     });
 *   });
 */

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createMockDocuments, createMockBridge, type MockBridgeConfig } from './test-helpers.js';

// Find testdata dir — works from both repo root and package dir
function findTestdataDir(): string {
  for (const candidate of [
    resolve(process.cwd(), 'tests', 'testdata'),
    resolve(process.cwd(), 'packages', 'pike-lsp-server', 'tests', 'testdata'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Cannot find tests/testdata directory');
}
const TESTDATA_DIR = findTestdataDir();

export interface Fixture {
  /** File content */
  content: string;
  /** File URI */
  uri: string;
  /** Absolute file path */
  filePath: string;
  /** Relative path from testdata/ */
  relativePath: string;
}

export interface HarnessOptions {
  /** Bridge configuration */
  bridge?: MockBridgeConfig;
  /** Base URI prefix for test documents */
  uriPrefix?: string;
}

/**
 * LSP Test Harness
 *
 * Provides a standard way to load test fixtures and run LSP operations against them.
 */
export class LSPTestHarness {
  private options: HarnessOptions;
  private documents: ReturnType<typeof createMockDocuments>;
  private bridge: ReturnType<typeof createMockBridge>;

  constructor(options: HarnessOptions = {}) {
    this.options = options;
    this.documents = createMockDocuments();
    this.bridge = createMockBridge(options.bridge);
  }

  /**
   * Load a .pike fixture from testdata/
   * @param relativePath - e.g., 'diagnostics/valid.pike'
   */
  async loadFixture(relativePath: string): Promise<Fixture> {
    const filePath = join(TESTDATA_DIR, relativePath);
    const content = await readFile(filePath, 'utf-8');
    const uri = `${this.options.uriPrefix ?? 'file://'}${filePath}`;

    return { content, uri, filePath, relativePath };
  }

  /**
   * Load fixture and create a TextDocument
   */
  async loadDocument(
    relativePath: string,
    version = 1
  ): Promise<{ doc: TextDocument; fixture: Fixture }> {
    const fixture = await this.loadFixture(relativePath);
    const doc = TextDocument.create(fixture.uri, 'pike', version, fixture.content);
    return { doc, fixture };
  }

  /**
   * Get the mock documents manager
   */
  getDocuments() {
    return this.documents;
  }

  /**
   * Get the mock bridge
   */
  getBridge() {
    return this.bridge;
  }

  /**
   * Load all fixtures from a directory
   */
  async loadFixturesInDir(dirPath: string): Promise<Fixture[]> {
    const fullDir = join(TESTDATA_DIR, dirPath);
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(fullDir);
    const pikeFiles = files.filter(f => f.endsWith('.pike'));

    const fixtures: Fixture[] = [];
    for (const file of pikeFiles) {
      fixtures.push(await this.loadFixture(`${dirPath}/${file}`));
    }
    return fixtures;
  }
}

/**
 * Table-driven test helper
 *
 * Runs the same test function against an array of test cases.
 *
 * Usage:
 *   runTestCases('Diagnostics', [
 *     { name: 'valid code', fixture: 'diagnostics/valid.pike', expect: { errors: 0 } },
 *     { name: 'missing semicolon', fixture: 'diagnostics/missing-semicolon.pike', expect: { errors: 1 } },
 *   ], async (testCase) => {
 *     const harness = new LSPTestHarness();
 *     const { content } = await harness.loadFixture(testCase.fixture);
 *     // assert based on testCase.expect
 *   });
 */
export function runTestCases<T extends { name: string }>(
  suiteName: string,
  cases: T[],
  fn: (testCase: T) => Promise<void> | void
): void {
  const { describe, it } = require('bun:test');

  describe(suiteName, () => {
    for (const testCase of cases) {
      it(testCase.name, () => fn(testCase));
    }
  });
}
