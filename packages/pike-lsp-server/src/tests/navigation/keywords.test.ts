/**
 * Keywords Module Tests
 *
 * Tests for Pike keyword handling and predefined macros.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import {
  PIKE_KEYWORDS,
  PIKE_PREDEFINED_MACROS,
  KEYWORD_MAP,
  MACRO_MAP,
  isPikeKeyword,
  isPikeMacro,
  getKeywordInfo,
  getMacroInfo,
} from '../../features/navigation/keywords.js';

describe('Keywords Module', () => {
  describe('PIKE_KEYWORDS', () => {
    it('should contain keywords', () => {
      assert.ok(PIKE_KEYWORDS.length > 0, 'Should have keywords defined');
    });

    it('should have valid categories for all keywords', () => {
      const validCategories = ['type', 'modifier', 'control', 'operator', 'other'];
      for (const kw of PIKE_KEYWORDS) {
        assert.ok(
          validCategories.includes(kw.category),
          `Keyword ${kw.name} should have valid category`
        );
      }
    });

    it('should have descriptions for all keywords', () => {
      for (const kw of PIKE_KEYWORDS) {
        assert.ok(kw.name, `Keyword ${kw.name} should have a name`);
        assert.ok(kw.description, `Keyword ${kw.name} should have a description`);
      }
    });

    it('should not have duplicate keyword names', () => {
      const names = PIKE_KEYWORDS.map(kw => kw.name);
      const uniqueNames = new Set(names);
      assert.strictEqual(names.length, uniqueNames.size, 'Should not have duplicate keywords');
    });
  });

  describe('Type Keywords', () => {
    const typeKeywords = PIKE_KEYWORDS.filter(kw => kw.category === 'type');

    it('should have type keywords', () => {
      assert.ok(typeKeywords.length > 0, 'Should have type keywords');
    });

    it('should include common types', () => {
      const typeNames = typeKeywords.map(kw => kw.name);
      assert.ok(typeNames.includes('int'), 'Should include int');
      assert.ok(typeNames.includes('string'), 'Should include string');
      assert.ok(typeNames.includes('float'), 'Should include float');
      assert.ok(typeNames.includes('array'), 'Should include array');
      assert.ok(typeNames.includes('mapping'), 'Should include mapping');
      assert.ok(typeNames.includes('object'), 'Should include object');
    });
  });

  describe('Modifier Keywords', () => {
    const modifierKeywords = PIKE_KEYWORDS.filter(kw => kw.category === 'modifier');

    it('should have modifier keywords', () => {
      assert.ok(modifierKeywords.length > 0, 'Should have modifier keywords');
    });

    it('should include common modifiers', () => {
      const modifierNames = modifierKeywords.map(kw => kw.name);
      assert.ok(modifierNames.includes('public'), 'Should include public');
      assert.ok(modifierNames.includes('private'), 'Should include private');
      assert.ok(modifierNames.includes('static'), 'Should include static');
      assert.ok(modifierNames.includes('protected'), 'Should include protected');
      assert.ok(modifierNames.includes('final'), 'Should include final');
      assert.ok(modifierNames.includes('const'), 'Should include const');
    });
  });

  describe('Control Flow Keywords', () => {
    const controlKeywords = PIKE_KEYWORDS.filter(kw => kw.category === 'control');

    it('should have control flow keywords', () => {
      assert.ok(controlKeywords.length > 0, 'Should have control flow keywords');
    });

    it('should include common control flow keywords', () => {
      const controlNames = controlKeywords.map(kw => kw.name);
      assert.ok(controlNames.includes('if'), 'Should include if');
      assert.ok(controlNames.includes('else'), 'Should include else');
      assert.ok(controlNames.includes('while'), 'Should include while');
      assert.ok(controlNames.includes('for'), 'Should include for');
      assert.ok(controlNames.includes('foreach'), 'Should include foreach');
      assert.ok(controlNames.includes('switch'), 'Should include switch');
      assert.ok(controlNames.includes('do'), 'Should include do');
      assert.ok(controlNames.includes('catch'), 'Should include catch');
    });
  });

  describe('Other Keywords', () => {
    const otherKeywords = PIKE_KEYWORDS.filter(kw => kw.category === 'other');

    it('should have other keywords', () => {
      assert.ok(otherKeywords.length > 0, 'Should have other keywords');
    });

    it('should include class-related keywords', () => {
      const otherNames = otherKeywords.map(kw => kw.name);
      assert.ok(otherNames.includes('class'), 'Should include class');
      assert.ok(otherNames.includes('inherit'), 'Should include inherit');
      assert.ok(otherNames.includes('new'), 'Should include new');
      assert.ok(otherNames.includes('this'), 'Should include this');
    });
  });

  describe('isPikeKeyword', () => {
    it('should return true for type keywords', () => {
      assert.strictEqual(isPikeKeyword('int'), true, 'int should be a keyword');
      assert.strictEqual(isPikeKeyword('string'), true, 'string should be a keyword');
      assert.strictEqual(isPikeKeyword('float'), true, 'float should be a keyword');
      assert.strictEqual(isPikeKeyword('array'), true, 'array should be a keyword');
      assert.strictEqual(isPikeKeyword('mapping'), true, 'mapping should be a keyword');
    });

    it('should return true for modifier keywords', () => {
      assert.strictEqual(isPikeKeyword('public'), true, 'public should be a keyword');
      assert.strictEqual(isPikeKeyword('private'), true, 'private should be a keyword');
      assert.strictEqual(isPikeKeyword('static'), true, 'static should be a keyword');
      assert.strictEqual(isPikeKeyword('protected'), true, 'protected should be a keyword');
      assert.strictEqual(isPikeKeyword('final'), true, 'final should be a keyword');
    });

    it('should return true for control flow keywords', () => {
      assert.strictEqual(isPikeKeyword('if'), true, 'if should be a keyword');
      assert.strictEqual(isPikeKeyword('else'), true, 'else should be a keyword');
      assert.strictEqual(isPikeKeyword('while'), true, 'while should be a keyword');
      assert.strictEqual(isPikeKeyword('for'), true, 'for should be a keyword');
      assert.strictEqual(isPikeKeyword('foreach'), true, 'foreach should be a keyword');
      assert.strictEqual(isPikeKeyword('switch'), true, 'switch should be a keyword');
      assert.strictEqual(isPikeKeyword('return'), true, 'return should be a keyword');
    });

    it('should return true for other keywords', () => {
      assert.strictEqual(isPikeKeyword('class'), true, 'class should be a keyword');
      assert.strictEqual(isPikeKeyword('inherit'), true, 'inherit should be a keyword');
      assert.strictEqual(isPikeKeyword('new'), true, 'new should be a keyword');
      assert.strictEqual(isPikeKeyword('this'), true, 'this should be a keyword');
      assert.strictEqual(isPikeKeyword('typeof'), true, 'typeof should be a keyword');
    });

    it('should return false for non-keywords', () => {
      assert.strictEqual(isPikeKeyword('myVariable'), false, 'Variable name should not be keyword');
      assert.strictEqual(isPikeKeyword('foo'), false, 'foo should not be a keyword');
      assert.strictEqual(isPikeKeyword('Array'), false, 'Capitalized should not be a keyword');
      assert.strictEqual(isPikeKeyword('String'), false, 'Capitalized type should not be keyword');
    });

    it('should return false for empty and invalid inputs', () => {
      assert.strictEqual(isPikeKeyword(''), false, 'Empty string should not be a keyword');
      assert.strictEqual(isPikeKeyword(' '), false, 'Whitespace should not be a keyword');
    });

    it('should be case-sensitive', () => {
      assert.strictEqual(isPikeKeyword('INT'), false, 'Uppercase should not be a keyword');
      assert.strictEqual(isPikeKeyword('IF'), false, 'Uppercase IF should not be a keyword');
      assert.strictEqual(isPikeKeyword('Class'), false, 'Mixed case should not be a keyword');
    });
  });

  describe('getKeywordInfo', () => {
    it('should return keyword info for type keywords', () => {
      const intInfo = getKeywordInfo('int');
      assert.ok(intInfo, 'Should return info for int');
      assert.strictEqual(intInfo?.name, 'int');
      assert.strictEqual(intInfo?.category, 'type');
      assert.ok(intInfo?.description, 'Should have description');

      const stringInfo = getKeywordInfo('string');
      assert.ok(stringInfo, 'Should return info for string');
      assert.strictEqual(stringInfo?.category, 'type');
    });

    it('should return keyword info for modifier keywords', () => {
      const privateInfo = getKeywordInfo('private');
      assert.ok(privateInfo, 'Should return info for private');
      assert.strictEqual(privateInfo?.name, 'private');
      assert.strictEqual(privateInfo?.category, 'modifier');
      assert.ok(privateInfo?.description, 'Should have description');
    });

    it('should return keyword info for control flow keywords', () => {
      const ifInfo = getKeywordInfo('if');
      assert.ok(ifInfo, 'Should return info for if');
      assert.strictEqual(ifInfo?.category, 'control');
      assert.ok(ifInfo?.description, 'Should have description');

      const foreachInfo = getKeywordInfo('foreach');
      assert.ok(foreachInfo, 'Should return info for foreach');
      assert.strictEqual(foreachInfo?.category, 'control');
    });

    it('should return keyword info for other keywords', () => {
      const classInfo = getKeywordInfo('class');
      assert.ok(classInfo, 'Should return info for class');
      assert.strictEqual(classInfo?.category, 'other');

      const thisInfo = getKeywordInfo('this');
      assert.ok(thisInfo, 'Should return info for this');
      assert.strictEqual(thisInfo?.category, 'other');

      const newInfo = getKeywordInfo('new');
      assert.ok(newInfo, 'Should return info for new');
      assert.strictEqual(newInfo?.category, 'other');
    });

    it('should return undefined for non-keywords', () => {
      assert.strictEqual(getKeywordInfo('myVariable'), undefined);
      assert.strictEqual(getKeywordInfo('foo'), undefined);
      assert.strictEqual(getKeywordInfo('Array'), undefined);
    });

    it('should return undefined for empty input', () => {
      assert.strictEqual(getKeywordInfo(''), undefined);
    });
  });

  describe('KEYWORD_MAP', () => {
    it('should have same count as PIKE_KEYWORDS', () => {
      assert.strictEqual(KEYWORD_MAP.size, PIKE_KEYWORDS.length);
    });

    it('should be able to lookup all keywords', () => {
      for (const kw of PIKE_KEYWORDS) {
        const info = KEYWORD_MAP.get(kw.name);
        assert.ok(info, `Should find ${kw.name} in map`);
        assert.strictEqual(info?.name, kw.name);
      }
    });
  });

  describe('PIKE_PREDEFINED_MACROS', () => {
    it('should contain macros', () => {
      assert.ok(PIKE_PREDEFINED_MACROS.length > 0, 'Should have macros defined');
    });

    it('should have all required fields', () => {
      for (const macro of PIKE_PREDEFINED_MACROS) {
        assert.ok(macro.name, `Macro should have name`);
        assert.ok(macro.description, `Macro ${macro.name} should have description`);
        assert.ok(macro.expandedValue, `Macro ${macro.name} should have expandedValue`);
      }
    });

    it('should include common macros', () => {
      const macroNames = PIKE_PREDEFINED_MACROS.map(m => m.name);
      assert.ok(macroNames.includes('__LINE__'), 'Should include __LINE__');
      assert.ok(macroNames.includes('__FILE__'), 'Should include __FILE__');
      assert.ok(macroNames.includes('__DIR__'), 'Should include __DIR__');
      assert.ok(macroNames.includes('__VERSION__'), 'Should include __VERSION__');
      assert.ok(macroNames.includes('__PIKE__'), 'Should include __PIKE__');
    });

    it('should not have duplicate macro names', () => {
      const names = PIKE_PREDEFINED_MACROS.map(m => m.name);
      const uniqueNames = new Set(names);
      assert.strictEqual(names.length, uniqueNames.size, 'Should not have duplicate macros');
    });
  });

  describe('isPikeMacro', () => {
    it('should return true for predefined macros', () => {
      assert.strictEqual(isPikeMacro('__LINE__'), true, '__LINE__ should be a macro');
      assert.strictEqual(isPikeMacro('__FILE__'), true, '__FILE__ should be a macro');
      assert.strictEqual(isPikeMacro('__DIR__'), true, '__DIR__ should be a macro');
      assert.strictEqual(isPikeMacro('__VERSION__'), true, '__VERSION__ should be a macro');
      assert.strictEqual(isPikeMacro('__PIKE__'), true, '__PIKE__ should be a macro');
    });

    it('should return false for keywords', () => {
      assert.strictEqual(isPikeMacro('int'), false, 'int is a keyword, not a macro');
      assert.strictEqual(isPikeMacro('string'), false, 'string is a keyword, not a macro');
      assert.strictEqual(isPikeMacro('if'), false, 'if is a keyword, not a macro');
    });

    it('should return false for non-macros', () => {
      assert.strictEqual(isPikeMacro('myMacro'), false, 'User-defined should not be a macro');
      assert.strictEqual(isPikeMacro('FOO'), false, 'Uppercase should not be a macro');
      assert.strictEqual(isPikeMacro(''), false, 'Empty string should not be a macro');
    });
  });

  describe('getMacroInfo', () => {
    it('should return macro info for predefined macros', () => {
      const lineInfo = getMacroInfo('__LINE__');
      assert.ok(lineInfo, 'Should return info for __LINE__');
      assert.strictEqual(lineInfo?.name, '__LINE__');
      assert.ok(lineInfo?.description, 'Should have description');
      assert.ok(lineInfo?.expandedValue, 'Should have expandedValue');

      const fileInfo = getMacroInfo('__FILE__');
      assert.ok(fileInfo, 'Should return info for __FILE__');
    });

    it('should return undefined for keywords', () => {
      assert.strictEqual(getMacroInfo('int'), undefined, 'int is a keyword');
      assert.strictEqual(getMacroInfo('string'), undefined, 'string is a keyword');
    });

    it('should return undefined for non-macros', () => {
      assert.strictEqual(getMacroInfo('myMacro'), undefined);
      assert.strictEqual(getMacroInfo(''), undefined);
    });
  });

  describe('MACRO_MAP', () => {
    it('should have same count as PIKE_PREDEFINED_MACROS', () => {
      assert.strictEqual(MACRO_MAP.size, PIKE_PREDEFINED_MACROS.length);
    });

    it('should be able to lookup all macros', () => {
      for (const macro of PIKE_PREDEFINED_MACROS) {
        const info = MACRO_MAP.get(macro.name);
        assert.ok(info, `Should find ${macro.name} in map`);
        assert.strictEqual(info?.name, macro.name);
      }
    });
  });

  describe('Keyword Completion Support', () => {
    it('should provide all keywords for completion', () => {
      const completionItems = PIKE_KEYWORDS.map(kw => ({
        label: kw.name,
        kind: 'keyword' as const,
        detail: kw.category,
      }));

      assert.ok(completionItems.length > 0, 'Should have completion items');

      const typeCompletions = completionItems.filter(c => c.detail === 'type');
      assert.ok(typeCompletions.length > 0, 'Should have type keyword completions');

      const modifierCompletions = completionItems.filter(c => c.detail === 'modifier');
      assert.ok(modifierCompletions.length > 0, 'Should have modifier keyword completions');

      const controlCompletions = completionItems.filter(c => c.detail === 'control');
      assert.ok(controlCompletions.length > 0, 'Should have control keyword completions');
    });

    it('should provide macro completions', () => {
      const macroCompletionItems = PIKE_PREDEFINED_MACROS.map(m => ({
        label: m.name,
        kind: 'macro' as const,
        detail: m.expandedValue,
      }));

      assert.ok(macroCompletionItems.length > 0, 'Should have macro completion items');
    });
  });

  describe('Edge Cases', () => {
    it('should handle special keyword names', () => {
      const typeofInfo = getKeywordInfo('typeof');
      assert.ok(typeofInfo, 'typeof should be recognized');

      const lambdaInfo = getKeywordInfo('lambda');
      assert.ok(lambdaInfo, 'lambda should be recognized');

      const sscanfInfo = getKeywordInfo('sscanf');
      assert.ok(sscanfInfo, 'sscanf should be recognized');
    });

    it('should have consistent data across exports', () => {
      const randomKeyword = PIKE_KEYWORDS[Math.floor(Math.random() * PIKE_KEYWORDS.length)];
      const fromMap = KEYWORD_MAP.get(randomKeyword.name);
      assert.strictEqual(fromMap?.name, randomKeyword.name);
      assert.strictEqual(fromMap?.category, randomKeyword.category);
      assert.strictEqual(fromMap?.description, randomKeyword.description);
    });
  });
});
