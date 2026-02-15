/**
 * Roxen Configuration File Support Tests
 *
 * Tests for parsing, validation, and completion of Roxen module configuration.
 * Roxen modules use defvar() calls to define configuration variables.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseRoxenConfig,
    validateRoxenConfig,
    getRoxenConfigCompletions,
    getDefvarCompletions,
    isInDefvarContext,
    type DefvarDeclaration,
    type RoxenConfig,
} from '../../../features/roxen/config.js';

describe('Roxen Configuration Parser', () => {
    it('should detect inherit "module" pattern', () => {
        const code = 'inherit "module";';
        const result = parseRoxenConfig(code);
        assert.strictEqual(result.isInheritModule, true, 'Should detect module inherit');
    });

    it('should detect inherit "roxen" pattern', () => {
        const code = 'inherit "roxen";';
        const result = parseRoxenConfig(code);
        assert.strictEqual(result.isInheritModule, true, 'Should detect roxen inherit');
    });

    it('should detect inherit with single quotes', () => {
        const code = "inherit 'module';";
        const result = parseRoxenConfig(code);
        assert.strictEqual(result.isInheritModule, true, 'Should detect single quote inherit');
    });

    it('should parse constant module_type = MODULE_TAG', () => {
        const code = 'constant module_type = MODULE_TAG;';
        const result = parseRoxenConfig(code);
        assert.strictEqual(result.moduleType, 'MODULE_TAG', 'Should extract module type');
    });

    it('should parse constant int module_type = MODULE_LOCATION', () => {
        const code = 'constant int module_type = MODULE_LOCATION;';
        const result = parseRoxenConfig(code);
        assert.strictEqual(result.moduleType, 'MODULE_LOCATION', 'Should extract module type with int');
    });

    it('should parse defvar with all components', () => {
        const code = 'defvar("myvar", "My Variable", TYPE_STRING, "Documentation", 0);';
        const result = parseRoxenConfig(code);
        assert.strictEqual(result.defvars.length, 1, 'Should parse one defvar');

        const defvar = result.defvars[0]!;
        assert.strictEqual(defvar.name, 'myvar');
        assert.strictEqual(defvar.displayName, 'My Variable');
        assert.strictEqual(defvar.type, 'TYPE_STRING');
        assert.strictEqual(defvar.documentation, 'Documentation');
        assert.strictEqual(defvar.flags, 0);
    });

    it('should parse multiple defvar declarations', () => {
        const code = `
defvar("var1", "Variable 1", TYPE_STRING, "Doc 1", 0);
defvar("var2", "Variable 2", TYPE_INT, "Doc 2", VAR_EXPERT);
defvar("var3", "Variable 3", TYPE_FLAG, "Doc 3", VAR_MORE);
`;
        const result = parseRoxenConfig(code);
        assert.strictEqual(result.defvars.length, 3, 'Should parse three defvars');
        assert.strictEqual(result.defvars[0]!.name, 'var1');
        assert.strictEqual(result.defvars[1]!.name, 'var2');
        assert.strictEqual(result.defvars[2]!.name, 'var3');
    });

    it('should parse defvar with VAR_* flags', () => {
        const code = 'defvar("secret", "Secret", TYPE_PASSWORD, "Hidden", VAR_EXPERT | VAR_MORE);';
        const result = parseRoxenConfig(code);
        assert.strictEqual(result.defvars.length, 1, 'Should parse defvar with flags');
        // Note: the regex doesn't capture complex flag expressions, just simple numbers
        // This is expected - the bridge handles full validation
    });

    it('should parse complete Roxen module structure', () => {
        const code = `
inherit "module";

constant module_type = MODULE_TAG;
constant module_name = "My Tag";

defvar("enabled", "Enabled", TYPE_FLAG, "Enable this tag", 0);
defvar("timeout", "Timeout", TYPE_INT, "Timeout in seconds", VAR_EXPERT);
`;
        const result = parseRoxenConfig(code);

        assert.strictEqual(result.isInheritModule, true, 'Should detect inherit');
        assert.strictEqual(result.moduleType, 'MODULE_TAG', 'Should extract module type');
        assert.strictEqual(result.defvars.length, 2, 'Should parse two defvars');
    });
});

describe('Roxen Configuration Validation', () => {
    it('should return empty diagnostics for valid config', () => {
        const code = 'defvar("x", "X", TYPE_STRING, "Doc", 0);';
        const result = validateRoxenConfig(code);
        assert.strictEqual(result.length, 0, 'Should have no errors');
    });

    it('should error on unknown TYPE constant', () => {
        const code = 'defvar("x", "X", TYPE_INVALID, "Doc", 0);';
        const result = validateRoxenConfig(code);
        assert.ok(result.length > 0, 'Should have errors');
        assert.ok(result[0]!.message.includes('TYPE_INVALID'), 'Should mention invalid type');
    });

    it('should warn when module has inherit but no module_type', () => {
        const code = 'inherit "module";\ndefvar("x", "X", TYPE_STRING, "Doc", 0);';
        const result = validateRoxenConfig(code);
        assert.ok(result.some(d => d.message.includes('module_type')),
            'Should warn about missing module_type');
    });

    it('should not warn when module has both inherit and module_type', () => {
        const code = `
inherit "module";
constant module_type = MODULE_TAG;
defvar("x", "X", TYPE_STRING, "Doc", 0);
`;
        const result = validateRoxenConfig(code);
        assert.ok(!result.some(d => d.message.includes('module_type')),
            'Should not warn about module_type when present');
    });
});

describe('Roxen Configuration Completions', () => {
    it('should return defvar snippet when typing defvar(', () => {
        const line = 'defvar(';
        const result = getRoxenConfigCompletions(line, { line: 0, character: 7 });
        assert.ok(result !== null, 'Should return completions');
        assert.ok(result!.some(item => item.label === 'defvar'), 'Should include defvar snippet');
    });

    it('should return TYPE_* completions after TYPE_ prefix', () => {
        const line = 'defvar("x", "X", TYPE_';
        const result = getRoxenConfigCompletions(line, { line: 0, character: 20 });
        assert.ok(result !== null, 'Should return completions');
        assert.ok(result!.some(item => item.label === 'TYPE_STRING'), 'Should include TYPE_STRING');
        assert.ok(result!.some(item => item.label === 'TYPE_INT'), 'Should include TYPE_INT');
        assert.ok(result!.some(item => item.label === 'TYPE_FLAG'), 'Should include TYPE_FLAG');
    });

    it('should return MODULE_* completions after MODULE_ prefix', () => {
        const line = 'constant module_type = MODULE_';
        const result = getRoxenConfigCompletions(line, { line: 0, character: 28 });
        assert.ok(result !== null, 'Should return completions');
        assert.ok(result!.some(item => item.label === 'MODULE_TAG'), 'Should include MODULE_TAG');
        assert.ok(result!.some(item => item.label === 'MODULE_LOCATION'), 'Should include MODULE_LOCATION');
        assert.ok(result!.some(item => item.label === 'MODULE_FILTER'), 'Should include MODULE_FILTER');
    });

    it('should return VAR_* completions after VAR_ prefix', () => {
        const line = 'defvar("x", "X", TYPE_STRING, "Doc", VAR_';
        const result = getRoxenConfigCompletions(line, { line: 0, character: 40 });
        assert.ok(result !== null, 'Should return completions');
        assert.ok(result!.some(item => item.label === 'VAR_EXPERT'), 'Should include VAR_EXPERT');
        assert.ok(result!.some(item => item.label === 'VAR_MORE'), 'Should include VAR_MORE');
        assert.ok(result!.some(item => item.label === 'VAR_DEVELOPER'), 'Should include VAR_DEVELOPER');
    });

    it('should return null for non-Roxen context', () => {
        const line = 'int x = 42;';
        const result = getRoxenConfigCompletions(line, { line: 0, character: 10 });
        assert.strictEqual(result, null, 'Should return null for non-Roxen code');
    });

    it('defvar snippet should include TYPE choices', () => {
        const completions = getDefvarCompletions();
        const defvarSnippet = completions.find(c => c.label === 'defvar');
        assert.ok(defvarSnippet, 'Should have defvar snippet');
        assert.ok(defvarSnippet!.insertText!.includes('${3|'), 'Should include snippet choices for TYPE');
    });
});

describe('Context Detection', () => {
    it('should detect defvar context when cursor after defvar', () => {
        const line = 'defvar("x", "X", TYPE_';
        assert.strictEqual(isInDefvarContext(line, 20), true, 'Should be in defvar context');
    });

    it('should not detect defvar context when defvar not present', () => {
        const line = 'int x = 42;';
        assert.strictEqual(isInDefvarContext(line, 5), false, 'Should not be in defvar context');
    });

    it('should not detect defvar context when cursor before defvar', () => {
        const line = '  defvar("x"';
        assert.strictEqual(isInDefvarContext(line, 2), false, 'Should not be in defvar context before keyword');
    });
});

describe('Integration: Complete Module Parsing', () => {
    it('should parse a realistic Roxen tag module', () => {
        const code = `
inherit "module";
#include <module.h>

constant module_type = MODULE_TAG;
constant module_name = "Custom Tag";
constant module_doc = "A custom RXML tag";

void create() {
    defvar("attr1", "Attribute 1", TYPE_STRING,
           "Description of attribute 1", 0);
    defvar("attr2", "Attribute 2", TYPE_INT,
           "Description of attribute 2", VAR_EXPERT);
    defvar("enabled", "Enable", TYPE_FLAG,
           "Enable this tag", 0);
}

string simpletag_custom(mapping args) {
    return "Hello";
}
`;
        const result = parseRoxenConfig(code);

        assert.strictEqual(result.isInheritModule, true);
        assert.strictEqual(result.moduleType, 'MODULE_TAG');
        assert.strictEqual(result.defvars.length, 3);

        // Verify defvar details
        const attr1 = result.defvars.find(d => d.name === 'attr1');
        assert.ok(attr1, 'Should find attr1');
        assert.strictEqual(attr1!.type, 'TYPE_STRING');
        assert.strictEqual(attr1!.flags, 0);

        const attr2 = result.defvars.find(d => d.name === 'attr2');
        assert.ok(attr2, 'Should find attr2');
        assert.strictEqual(attr2!.type, 'TYPE_INT');
    });

    it('should parse a Roxen filesystem module', () => {
        const code = `
inherit "module";
inherit "filesystem";

constant module_type = MODULE_LOCATION;
constant module_name = "Custom FS";

void create() {
    defvar("mountpoint", "Mount Point", TYPE_STRING,
           "Where to mount this filesystem", 0);
    defvar("root", "Root Directory", TYPE_DIR,
           "Root directory for files", VAR_EXPERT);
}
`;
        const result = parseRoxenConfig(code);

        assert.strictEqual(result.isInheritModule, true);
        assert.strictEqual(result.moduleType, 'MODULE_LOCATION');
        assert.strictEqual(result.defvars.length, 2);

        const mountpoint = result.defvars.find(d => d.name === 'mountpoint');
        assert.ok(mountpoint, 'Should find mountpoint');
        assert.strictEqual(mountpoint!.type, 'TYPE_STRING');

        const root = result.defvars.find(d => d.name === 'root');
        assert.ok(root, 'Should find root');
        assert.strictEqual(root!.type, 'TYPE_DIR');
    });

    it('should parse a Roxen filter module', () => {
        const code = `
inherit "module";

constant module_type = MODULE_FILTER;
constant module_name = "Content Filter";

void create() {
    defvar("pattern", "Pattern", TYPE_STRING,
           "Regex pattern to match", 0);
    defvar("replacement", "Replacement", TYPE_STRING,
           "Replacement text", 0);
    defvar("case_sensitive", "Case Sensitive", TYPE_FLAG,
           "Match case", 0);
}
`;
        const result = parseRoxenConfig(code);

        assert.strictEqual(result.moduleType, 'MODULE_FILTER');
        assert.strictEqual(result.defvars.length, 3);
    });
});

describe('Error Cases', () => {
    it('should handle empty code gracefully', () => {
        const code = '';
        const result = parseRoxenConfig(code);
        assert.strictEqual(result.isInheritModule, false);
        assert.strictEqual(result.moduleType, null);
        assert.strictEqual(result.defvars.length, 0);
        assert.strictEqual(result.errors.length, 0);
    });

    it('should handle code with only comments', () => {
        const code = `
// This is a comment
/* Multi-line
   comment */
`;
        const result = parseRoxenConfig(code);
        assert.strictEqual(result.defvars.length, 0);
    });

    it('should handle malformed defvar gracefully', () => {
        const code = 'defvar(unclosed';
        const result = parseRoxenConfig(code);
        assert.strictEqual(result.defvars.length, 0, 'Should not crash on malformed input');
    });

    it('should handle defvar with missing components', () => {
        const code = 'defvar("name")';  // Missing type and doc
        const result = parseRoxenConfig(code);
        // The regex requires full pattern, so this won't match
        assert.strictEqual(result.defvars.length, 0);
    });
});

describe('Validation Error Reporting', () => {
    it('should provide correct line and column for errors', () => {
        const code = 'defvar("x", "X", TYPE_BAD, "Doc", 0);';
        const result = validateRoxenConfig(code);
        assert.ok(result.length > 0, 'Should have errors');
        assert.strictEqual(result[0]!.range.start.line, 0, 'Error should be on line 0');
    });

    it('should have correct source in diagnostics', () => {
        const code = 'inherit "module";\ndefvar("x", "X", TYPE_BAD, "Doc", 0);';
        const result = validateRoxenConfig(code);
        const configDiags = result.filter(d => d.source === 'roxen-config');
        assert.ok(configDiags.length > 0, 'Should have roxen-config source diagnostics');
    });

    it('should distinguish between error and warning severity', () => {
        const code = 'defvar("x", "X", TYPE_BAD, "Doc", 0);';
        const result = validateRoxenConfig(code);
        const errorDiag = result.find(d => d.message.includes('TYPE_BAD'));
        assert.ok(errorDiag, 'Should have TYPE_BAD error');
        assert.strictEqual(errorDiag!.severity, 1, 'Should be error severity (1)');
    });
});
