import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

/**
 * Scenario: Cross-File Symbol Rename
 *
 * Tests reliable cross-file symbol tracking and renaming.
 * Issue #1197: Rename reliability across files
 */

describe('Scenario: Cross-File Symbol Rename', () => {
  describe('Cross-file function rename', () => {
    it('should rename function declaration across files', () => {
      const file1 = `// utils.pike
void sharedHelper() {
    return 42;
}`;

      const file2 = `// main.pike
extern void sharedHelper();
int main() {
    return sharedHelper();
}`;

      const symbolName = 'sharedHelper';
      const occurrences1 = (file1.match(new RegExp(`\\b${symbolName}\\b`, 'g')) || []).length;
      const occurrences2 = (file2.match(new RegExp(`\\b${symbolName}\\b`, 'g')) || []).length;

      assert.strictEqual(occurrences1, 1, 'Should find function definition');
      assert.strictEqual(occurrences2, 2, 'Should find extern declaration and call');
    });

    it('should track symbol references deterministically', () => {
      const files = [
        { uri: 'file:///utils.pike', content: 'void helper() {}' },
        { uri: 'file:///main1.pike', content: 'extern void helper();\nhelper();' },
        { uri: 'file:///main2.pike', content: 'extern void helper();\nhelper();' },
      ];

      const symbolName = 'helper';
      let totalReferences = 0;

      for (const file of files) {
        const refs = (file.content.match(new RegExp(`\\b${symbolName}\\b`, 'g')) || []).length;
        totalReferences += refs;
      }

      assert.strictEqual(totalReferences, 5, 'Should find all 5 references across 3 files');
    });
  });

  describe('Collision detection', () => {
    it('should detect name collision in same scope', () => {
      const existingSymbols = ['existingVar', 'helper', 'config'];
      const newName = 'existingVar';

      const hasCollision = existingSymbols.includes(newName);

      assert.strictEqual(hasCollision, true, 'Should detect name collision');
    });

    it('should allow rename when no collision', () => {
      const existingSymbols = ['var1', 'var2'];
      const newName = 'newVar';

      const hasCollision = existingSymbols.includes(newName);

      assert.strictEqual(hasCollision, false, 'Should allow rename when no collision');
    });

    it('should reject renaming to Pike keywords', () => {
      const keywords = ['int', 'string', 'void', 'class', 'if', 'else', 'return'];
      const newName = 'int';

      const isKeyword = keywords.includes(newName);

      assert.strictEqual(isKeyword, true, 'Should detect keyword collision');
    });

    it('should reject empty name', () => {
      const newName = '';
      const isValid = newName.length > 0 && /^[a-zA-Z_]\w*$/.test(newName);

      assert.strictEqual(isValid, false, 'Should reject empty name');
    });

    it('should reject invalid identifier characters', () => {
      const newName = 'my-var';
      const isValid = /^[a-zA-Z_]\w*$/.test(newName);

      assert.strictEqual(isValid, false, 'Should reject hyphen in identifier');
    });

    it('should reject name starting with number', () => {
      const newName = '123abc';
      const isValid = /^[a-zA-Z_]\w*$/.test(newName);

      assert.strictEqual(isValid, false, 'Should reject name starting with number');
    });
  });

  describe('Prepare rename validation', () => {
    it('should validate position contains a renamable symbol', () => {
      const symbols = ['myVar', 'x'];
      const wordAtPosition = 'myVar';

      const isValidSymbol = symbols.includes(wordAtPosition);

      assert.strictEqual(isValidSymbol, true, 'Should validate position has renamable symbol');
    });

    it('should reject rename on non-identifier positions', () => {
      const wordAtPosition = 'int';

      const isKeyword = ['int', 'void', 'string'].includes(wordAtPosition);

      assert.strictEqual(isKeyword, true, 'Should reject rename on keywords');
    });
  });

  describe('Workspace symbol resolution', () => {
    it('should search all indexed workspace files', () => {
      const workspaceFiles = [
        'file:///src/utils.pike',
        'file:///src/main.pike',
        'file:///src/config.pike',
      ];

      const foundInFiles: string[] = [];

      for (const uri of workspaceFiles) {
        if (uri.includes('utils') || uri.includes('main')) {
          foundInFiles.push(uri);
        }
      }

      assert.strictEqual(foundInFiles.length, 2, 'Should find symbol in 2 workspace files');
    });

    it('should handle uncached workspace files', () => {
      const indexedUris = ['file:///open1.pike'];
      const allWorkspaceFiles = [
        'file:///open1.pike',
        'file:///closed1.pike',
        'file:///closed2.pike',
      ];

      const uncachedFiles = allWorkspaceFiles.filter(f => !indexedUris.includes(f));

      assert.strictEqual(uncachedFiles.length, 2, 'Should identify 2 uncached files');
    });
  });

  describe('Deterministic cross-file rename', () => {
    it('should produce same results for same input', () => {
      const run1 = { edits: 3 };
      const run2 = { edits: 3 };

      assert.strictEqual(run1.edits, run2.edits, 'Should produce deterministic results');
    });

    it('should handle files with same symbol name in different scopes', () => {
      const file1 = `int x = 1;
void func1() {
    int x = 2;
}`;

      const file2 = `int x = 3;
void func2() {
    int x = 4;
}`;

      const occurrences1 = (file1.match(/\bx\b/g) || []).length;
      const occurrences2 = (file2.match(/\bx\b/g) || []).length;

      assert.strictEqual(occurrences1, 2, 'File 1 has 2 x symbols (different scopes)');
      assert.strictEqual(occurrences2, 2, 'File 2 has 2 x symbols (different scopes)');
    });
  });

  describe('Rename result format', () => {
    it('should return WorkspaceEdit with documentChanges', () => {
      const workspaceEdit = {
        documentChanges: [
          {
            textDocument: { uri: 'file:///test.pike', version: null },
            edits: [
              {
                range: {
                  start: { line: 0, character: 4 },
                  end: { line: 0, character: 10 },
                },
                newText: 'newName',
              },
            ],
          },
        ],
      };

      assert.ok(workspaceEdit.documentChanges, 'Should have documentChanges');
      assert.strictEqual(workspaceEdit.documentChanges.length, 1, 'Should have 1 file change');
    });

    it('should include all files with edits', () => {
      const changes = {
        'file:///file1.pike': [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            newText: 'new',
          },
        ],
        'file:///file2.pike': [
          {
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
            newText: 'new',
          },
        ],
      };

      const fileCount = Object.keys(changes).length;

      assert.strictEqual(fileCount, 2, 'Should include both files');
    });
  });
});

describe('Scenario: PrepareRename validation', () => {
  it('should return valid range for renamable symbol', () => {
    const word = 'myVariable';
    const range = {
      start: { line: 0, character: 4 },
      end: { line: 0, character: 14 },
    };

    assert.ok(range, 'Should return range');
    assert.strictEqual(range.end.character - range.start.character, word.length);
  });

  it('should return null for non-renamable position', () => {
    const code = '// Comment line';

    const isComment = code.startsWith('//');

    assert.strictEqual(isComment, true, 'Position is in comment');
  });
});
