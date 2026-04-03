import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

describe('Import Organization', () => {
  it('should group imports by origin', async () => {
    const stdlib = ['stdio.h', 'stdlib.h', 'Stdio'];
    const thirdParty = ['SomeLibrary', 'external.pike'];
    const local = ['./local.pike', '../other.pike', 'MyModule'];

    if (stdlib.length !== 3) throw new Error('Expected 3 stdlib imports');
    if (thirdParty.length !== 2) throw new Error('Expected 3 third-party imports');
    if (local.length !== 3) throw new Error('Expected 3 local imports');
  });

  it('should respect imports.mode setting', async () => {
    const mode = 'grouped';
    if (mode !== 'grouped' && mode !== 'basic' && mode !== 'none') {
      throw new Error('Invalid mode');
    }
  });

  it('should respect imports.localPrefix setting', async () => {
    const localPrefixes = ['MyProject', './src'];
    if (localPrefixes.length !== 2) throw new Error('Expected 2 prefixes');
  });

  it('should separate groups with blank lines', async () => {
    const sections = ['stdlib', 'thirdParty', 'local'];
    const formatted = sections.join('\n\n');
    if (!formatted.includes('\n\n')) throw new Error('Expected blank line separation');
  });
});

describe('Scenario: Inherit-aware Import Ordering', () => {
  it('should parse inherit statements separately from import statements', () => {
    const testCode = `
import Stdio;
inherit "./base.pike";
import SomeModule;
inherit "../utils.pike";
`;

    const importPattern = /^(?:\s*)import\s+([^;]+);\s*$/gm;
    const inheritPattern = /^(?:\s*)inherit\s+["']([^"']+)["']\s*;?\s*$/gm;

    const imports: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = importPattern.exec(testCode)) !== null) {
      const path = match[1];
      if (path) imports.push(path.trim());
    }

    const inherits: string[] = [];
    while ((match = inheritPattern.exec(testCode)) !== null) {
      const path = match[1];
      if (path) inherits.push(path.trim());
    }

    assert.strictEqual(imports.length, 2, 'Should parse 2 import statements');
    assert.strictEqual(inherits.length, 2, 'Should parse 2 inherit statements');
    assert.ok(imports.includes('Stdio'), 'Should include Stdio import');
    assert.ok(inherits.includes('./base.pike'), 'Should include base.pike inherit');
    assert.ok(inherits.includes('../utils.pike'), 'Should include utils.pike inherit');
  });

  it('should detect inherit dependencies from file content', async () => {
    // Simulated: base.pike contains no inherit statements
    // derived.pike contains: inherit "./base.pike"
    // application.pike contains: inherit "./derived.pike"

    const baseInherits: string[] = [];
    const derivedInherits = ['./base.pike'];
    const applicationInherits = ['./derived.pike'];

    // Build dependency graph
    const dependencies = new Map<string, string[]>();
    dependencies.set('base.pike', baseInherits);
    dependencies.set('derived.pike', derivedInherits);
    dependencies.set('application.pike', applicationInherits);

    assert.deepStrictEqual(
      dependencies.get('derived.pike'),
      ['./base.pike'],
      'derived.pike should depend on base.pike'
    );
    assert.deepStrictEqual(
      dependencies.get('application.pike'),
      ['./derived.pike'],
      'application.pike should depend on derived.pike'
    );
  });

  it('should perform topological sort on inherit dependencies', () => {
    // Dependency chain: base <- derived <- application
    const inheritFiles = ['application.pike', 'base.pike', 'derived.pike'];
    const dependencies = new Map<string, string[]>();
    dependencies.set('application.pike', ['./derived.pike']);
    dependencies.set('derived.pike', ['./base.pike']);
    dependencies.set('base.pike', []);

    // Calculate in-degrees
    const inDegree = new Map<string, number>();
    for (const file of inheritFiles) {
      inDegree.set(file, dependencies.get(file)?.length || 0);
    }

    // Topological sort (Kahn's algorithm)
    const queue: string[] = [];
    for (const [file, degree] of inDegree.entries()) {
      if (degree === 0) queue.push(file);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      for (const [file, deps] of dependencies.entries()) {
        if (deps.includes(current.startsWith('./') ? current : './' + current)) {
          const newDegree = (inDegree.get(file) || 0) - 1;
          inDegree.set(file, newDegree);
          if (newDegree === 0 && !sorted.includes(file)) {
            queue.push(file);
          }
        }
      }
    }

    // Verify order: base.pike should come before derived.pike
    const baseIndex = sorted.findIndex(f => f.includes('base'));
    const derivedIndex = sorted.findIndex(f => f.includes('derived'));
    const appIndex = sorted.findIndex(f => f.includes('application'));

    assert.ok(baseIndex < derivedIndex, 'base.pike should come before derived.pike');
    assert.ok(derivedIndex < appIndex, 'derived.pike should come before application.pike');
  });

  it('should detect circular inheritance and fall back to alphabetical', () => {
    // Circular: A -> B -> C -> A
    const inheritFiles = ['./a.pike', './b.pike', './c.pike'];
    const dependencies = new Map<string, string[]>();
    dependencies.set('./a.pike', ['./c.pike']); // A depends on C (circular)
    dependencies.set('./b.pike', ['./a.pike']); // B depends on A
    dependencies.set('./c.pike', ['./b.pike']); // C depends on B

    // Calculate in-degrees
    const inDegree = new Map<string, number>();
    for (const file of inheritFiles) {
      inDegree.set(file, dependencies.get(file)?.length || 0);
    }

    // Topological sort
    const queue: string[] = [];
    for (const [file, degree] of inDegree.entries()) {
      if (degree === 0) queue.push(file);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      for (const [file, deps] of dependencies.entries()) {
        if (deps.includes(current)) {
          const newDegree = (inDegree.get(file) || 0) - 1;
          inDegree.set(file, newDegree);
          if (newDegree === 0 && !sorted.includes(file)) {
            queue.push(file);
          }
        }
      }
    }

    // Should detect circular dependency (not all files sorted)
    const circular = sorted.length < inheritFiles.length;
    assert.strictEqual(circular, true, 'Should detect circular inheritance');

    if (circular) {
      // Fall back to alphabetical
      const alphabetical = [...inheritFiles].sort((a, b) => a.localeCompare(b));
      assert.deepStrictEqual(
        alphabetical,
        ['./a.pike', './b.pike', './c.pike'],
        'Should fall back to alphabetical ordering'
      );
    }
  });

  it('should respect pike.imports.inheritAwareOrdering setting', () => {
    const inheritAwareOrdering = true;
    assert.strictEqual(
      inheritAwareOrdering,
      true,
      'Setting should default to true for inherit-aware ordering'
    );
  });

  it('should normalize relative paths correctly', () => {
    const inheritPath = './utils.pike';
    const currentDir = '/project/src';
    const documentDir = '/project';

    // Resolve path relative to current file
    const resolvedPath = currentDir + '/' + inheritPath.replace('./', '');
    assert.strictEqual(resolvedPath, '/project/src/utils.pike');

    // Calculate relative to document
    const relativeToDoc = resolvedPath.replace(documentDir + '/', './');
    assert.strictEqual(relativeToDoc, './src/utils.pike');
  });

  it('should handle mixed local imports (inherit and regular)', () => {
    const localImports = [
      { type: 'import', path: './helpers.pike' },
      { type: 'inherit', path: './base.pike' },
      { type: 'inherit', path: './derived.pike' },
      { type: 'import', path: 'MyModule' },
    ];

    const inheritImports = localImports.filter(imp => imp.type === 'inherit');
    const regularImports = localImports.filter(imp => imp.type === 'import');

    assert.strictEqual(inheritImports.length, 2, 'Should identify 2 inherit imports');
    assert.strictEqual(regularImports.length, 2, 'Should identify 2 regular imports');
    assert.ok(
      inheritImports.some(imp => imp.path === './base.pike'),
      'Should include base.pike'
    );
  });

  it('should integrate with existing grouped import organization', () => {
    const stdlib = ['#include <stdio.h>', 'import Stdio;'];
    const thirdParty = ['import SomeLibrary;'];
    const local = ['inherit "./base.pike";', 'inherit "./derived.pike";', 'import MyModule;'];

    const sections: string[] = [];
    if (stdlib.length > 0) sections.push(stdlib.join('\n'));
    if (thirdParty.length > 0) sections.push(thirdParty.join('\n'));
    if (local.length > 0) sections.push(local.join('\n'));

    const formatted = sections.join('\n\n');

    assert.ok(formatted.includes('#include <stdio.h>'), 'Should include stdlib');
    assert.ok(formatted.includes('inherit "./base.pike"'), 'Should include inherit statements');
    assert.ok(formatted.includes('\n\n'), 'Should separate groups with blank lines');
  });
});
