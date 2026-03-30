/**
 * Color Presentation Scenario Tests
 *
 * Scenario tests that prove the color-presentation feature works through
 * the real LSP handler registration path.
 *
 * Tests the actual code in color-presentation.ts:
 * - findColors() via the registered textDocument/documentColor handler
 * - getColorPresentations() via the registered textDocument/colorPresentation handler
 *
 * These tests MUST fail if color-presentation.ts is deleted or if
 * findColors() / getColorPresentations() return wrong results.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type {
  Color,
  ColorInformation,
  ColorPresentation,
  DocumentColorParams,
  ColorPresentationParams,
} from 'vscode-languageserver/node.js';
import { registerColorPresentationHandler } from '../color-presentation.js';

function setupHandler() {
  let documentColorHandler: (params: DocumentColorParams) => Promise<ColorInformation[] | null>;
  let colorPresentationHandler: (
    params: ColorPresentationParams
  ) => Promise<ColorPresentation[] | null>;

  const docMap = new Map<string, TextDocument>();

  const connection = {
    onDocumentColor(handler: (params: DocumentColorParams) => Promise<ColorInformation[] | null>) {
      documentColorHandler = handler;
    },
    onColorPresentation(
      handler: (params: ColorPresentationParams) => Promise<ColorPresentation[] | null>
    ) {
      colorPresentationHandler = handler;
    },
  };

  const documents = {
    get(uri: string) {
      return docMap.get(uri);
    },
  };

  registerColorPresentationHandler(connection as any, {} as any, documents as any);

  return {
    documentColorHandler: documentColorHandler!,
    colorPresentationHandler: colorPresentationHandler!,
    openDocument(uri: string, content: string, version = 1) {
      const doc = TextDocument.create(uri, 'pike', version, content);
      docMap.set(uri, doc);
      return doc;
    },
  };
}

describe('Scenario: textDocument/documentColor', () => {
  it('should find #RGB shorthand hex color', async () => {
    const { documentColorHandler, openDocument } = setupHandler();
    const uri = 'file:///test-rgb.pike';
    openDocument(uri, 'string bg = "#f00";\n');

    const result = await documentColorHandler({
      textDocument: { uri },
    });

    assert.ok(result, 'Should return color information');
    assert.strictEqual(result.length, 1, 'Should find exactly one color');

    const info = result[0]!;
    assert.deepStrictEqual(info.range, {
      start: { line: 0, character: 13 },
      end: { line: 0, character: 17 },
    });

    const expectedRed = parseInt('ff', 16) / 255;
    assert.strictEqual(info.color.red, expectedRed);
    assert.strictEqual(info.color.green, 0);
    assert.strictEqual(info.color.blue, 0);
    assert.strictEqual(info.color.alpha, 1);
  });

  it('should find #RRGGBB hex color', async () => {
    const { documentColorHandler, openDocument } = setupHandler();
    const uri = 'file:///test-rrggbb.pike';
    openDocument(uri, 'string color = "#1a2b3c";\n');

    const result = await documentColorHandler({
      textDocument: { uri },
    });

    assert.ok(result, 'Should return color information');
    assert.strictEqual(result.length, 1, 'Should find exactly one color');

    const info = result[0]!;
    assert.deepStrictEqual(info.range, {
      start: { line: 0, character: 16 },
      end: { line: 0, character: 23 },
    });

    assert.strictEqual(info.color.red, parseInt('1a', 16) / 255);
    assert.strictEqual(info.color.green, parseInt('2b', 16) / 255);
    assert.strictEqual(info.color.blue, parseInt('3c', 16) / 255);
    assert.strictEqual(info.color.alpha, 1);
  });

  it('should find #RRGGBBAA hex color with alpha', async () => {
    const { documentColorHandler, openDocument } = setupHandler();
    const uri = 'file:///test-rrggbbaa.pike';
    openDocument(uri, 'string overlay = "#ff000080";\n');

    const result = await documentColorHandler({
      textDocument: { uri },
    });

    assert.ok(result, 'Should return color information');
    assert.strictEqual(result.length, 1, 'Should find exactly one color');

    const info = result[0]!;
    assert.deepStrictEqual(info.range, {
      start: { line: 0, character: 18 },
      end: { line: 0, character: 27 },
    });

    assert.strictEqual(info.color.red, 1);
    assert.strictEqual(info.color.green, 0);
    assert.strictEqual(info.color.blue, 0);
    assert.strictEqual(info.color.alpha, parseInt('80', 16) / 255);
  });

  it('should find multiple hex colors in one document', async () => {
    const { documentColorHandler, openDocument } = setupHandler();
    const uri = 'file:///test-multi.pike';
    openDocument(
      uri,
      ['string red = "#f00";', 'string green = "#00ff00";', 'string blue = "#0000ffcc";'].join('\n')
    );

    const result = await documentColorHandler({
      textDocument: { uri },
    });

    assert.ok(result, 'Should return color information');
    assert.strictEqual(result.length, 3, 'Should find three colors');

    assert.strictEqual(result[0]!.range.start.line, 0);
    assert.strictEqual(result[1]!.range.start.line, 1);
    assert.strictEqual(result[2]!.range.start.line, 2);
  });

  it('should return null for unknown document URI', async () => {
    const { documentColorHandler } = setupHandler();

    const result = await documentColorHandler({
      textDocument: { uri: 'file:///nonexistent.pike' },
    });

    assert.strictEqual(result, null, 'Should return null for missing document');
  });

  it('should return empty array for document with no hex colors', async () => {
    const { documentColorHandler, openDocument } = setupHandler();
    const uri = 'file:///test-no-colors.pike';
    openDocument(uri, 'int x = 42;\nstring s = "hello";\n');

    const result = await documentColorHandler({
      textDocument: { uri },
    });

    assert.ok(result, 'Should return array');
    assert.strictEqual(result.length, 0, 'Should find no colors');
  });

  it('should handle #RGB shorthand with mixed case', async () => {
    const { documentColorHandler, openDocument } = setupHandler();
    const uri = 'file:///test-mixed-case.pike';
    openDocument(uri, 'string c = "#AbC";\n');

    const result = await documentColorHandler({
      textDocument: { uri },
    });

    assert.ok(result);
    assert.strictEqual(result.length, 1);

    const color = result[0]!.color;
    assert.strictEqual(color.red, parseInt('aa', 16) / 255);
    assert.strictEqual(color.green, parseInt('bb', 16) / 255);
    assert.strictEqual(color.blue, parseInt('cc', 16) / 255);
  });
});

describe('Scenario: textDocument/colorPresentation', () => {
  it('should return hex presentation for opaque color', async () => {
    const { colorPresentationHandler } = setupHandler();

    const result = await colorPresentationHandler({
      textDocument: { uri: 'file:///test.pike' },
      color: { red: 1, green: 0, blue: 0, alpha: 1 } as Color,
      range: {
        start: { line: 0, character: 10 },
        end: { line: 0, character: 14 },
      },
    });

    assert.ok(result, 'Should return presentations');
    assert.ok(result.length >= 2, 'Should have at least hex and rgb formats');

    const hexPresentation = result.find(p => p.label.startsWith('#') && p.label.length === 7);
    assert.ok(hexPresentation, 'Should include #RRGGBB format');
    assert.strictEqual(hexPresentation!.label, '#ff0000');
  });

  it('should return rgba presentation with alpha', async () => {
    const { colorPresentationHandler } = setupHandler();

    const result = await colorPresentationHandler({
      textDocument: { uri: 'file:///test.pike' },
      color: { red: 0, green: 0.5, blue: 1, alpha: 0.75 } as Color,
      range: {
        start: { line: 0, character: 5 },
        end: { line: 0, character: 15 },
      },
    });

    assert.ok(result, 'Should return presentations');

    const rgbaPresentation = result.find(p => p.label.startsWith('rgba('));
    assert.ok(rgbaPresentation, 'Should include rgba format');
    assert.ok(rgbaPresentation!.label.includes('0.75'), 'Should include alpha value');
  });

  it('should include #RRGGBBAA when alpha < 1', async () => {
    const { colorPresentationHandler } = setupHandler();

    const result = await colorPresentationHandler({
      textDocument: { uri: 'file:///test.pike' },
      color: { red: 1, green: 0, blue: 0, alpha: 0.5 } as Color,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 10 },
      },
    });

    assert.ok(result);

    const rrggbbaa = result.find(p => p.label.startsWith('#') && p.label.length === 9);
    assert.ok(rrggbbaa, 'Should include #RRGGBBAA when alpha < 1');
    assert.strictEqual(rrggbbaa!.label, '#ff000080');
  });

  it('should NOT include #RRGGBBAA when alpha is 1', async () => {
    const { colorPresentationHandler } = setupHandler();

    const result = await colorPresentationHandler({
      textDocument: { uri: 'file:///test.pike' },
      color: { red: 1, green: 1, blue: 1, alpha: 1 } as Color,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 7 },
      },
    });

    assert.ok(result);

    const rrggbbaa = result.find(p => p.label.startsWith('#') && p.label.length === 9);
    assert.strictEqual(rrggbbaa, undefined, 'Should NOT include #RRGGBBAA when fully opaque');
  });

  it('should include text edits replacing the original range', async () => {
    const { colorPresentationHandler } = setupHandler();
    const range = {
      start: { line: 2, character: 10 },
      end: { line: 2, character: 17 },
    };

    const result = await colorPresentationHandler({
      textDocument: { uri: 'file:///test.pike' },
      color: { red: 0, green: 0, blue: 0, alpha: 1 } as Color,
      range,
    });

    assert.ok(result);
    assert.ok(result.length > 0);

    for (const presentation of result) {
      assert.ok(presentation.textEdit, `Presentation "${presentation.label}" should have textEdit`);
      assert.deepStrictEqual(
        presentation.textEdit!.range,
        range,
        `Presentation "${presentation.label}" should use the provided range`
      );
      assert.strictEqual(
        presentation.textEdit!.newText,
        presentation.label,
        `Presentation "${presentation.label}" textEdit.newText should match label`
      );
    }
  });

  it('should return rgb() format presentation', async () => {
    const { colorPresentationHandler } = setupHandler();

    const result = await colorPresentationHandler({
      textDocument: { uri: 'file:///test.pike' },
      color: { red: 1, green: 0.5, blue: 0, alpha: 1 } as Color,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 7 },
      },
    });

    assert.ok(result);

    const rgbPresentation = result.find(
      p => p.label.startsWith('rgb(') && !p.label.startsWith('rgba(')
    );
    assert.ok(rgbPresentation, 'Should include rgb() format');
    assert.strictEqual(rgbPresentation!.label, 'rgb(255, 128, 0)');
  });
});

describe('Scenario: documentColor + colorPresentation end-to-end', () => {
  it('should detect a color and then present it in all formats', async () => {
    const { documentColorHandler, colorPresentationHandler, openDocument } = setupHandler();
    const uri = 'file:///test-e2e.pike';
    openDocument(uri, 'string bg = "#ff8800";\n');

    const colors = await documentColorHandler({
      textDocument: { uri },
    });

    assert.ok(colors);
    assert.strictEqual(colors.length, 1);

    const detected = colors[0]!;

    const presentations = await colorPresentationHandler({
      textDocument: { uri },
      color: detected.color,
      range: detected.range,
    });

    assert.ok(presentations);
    assert.ok(presentations.length >= 3, 'Should have hex, rgb, and rgba formats');

    const hex = presentations.find(p => p.label === '#ff8800');
    assert.ok(hex, 'Should have exact hex representation');
    assert.ok(hex!.textEdit, 'Hex presentation should have text edit');
    assert.strictEqual(hex!.textEdit!.newText, '#ff8800');
  });

  it('should detect #RGB and allow replacing with full #RRGGBB', async () => {
    const { documentColorHandler, colorPresentationHandler, openDocument } = setupHandler();
    const uri = 'file:///test-rgb-e2e.pike';
    openDocument(uri, 'string bg = "#f80";\n');

    const colors = await documentColorHandler({
      textDocument: { uri },
    });

    assert.ok(colors);
    assert.strictEqual(colors.length, 1);

    const detected = colors[0]!;
    assert.deepStrictEqual(detected.range, {
      start: { line: 0, character: 13 },
      end: { line: 0, character: 17 },
    });

    const presentations = await colorPresentationHandler({
      textDocument: { uri },
      color: detected.color,
      range: detected.range,
    });

    assert.ok(presentations);
    const hexPresentation = presentations.find(
      p => p.label.startsWith('#') && p.label.length === 7
    );
    assert.ok(hexPresentation, 'Should offer #RRGGBB expansion of #RGB');
    assert.ok(
      hexPresentation!.textEdit!.range.start.character === 13,
      'Text edit should target the original #RGB position'
    );
  });
});
