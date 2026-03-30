/**
 * Color Presentation Handler
 *
 * Provides color detection and presentation for hex color literals in Pike code.
 *
 * Features:
 * - Find hex colors (#RGB, #RRGGBB, #RRGGBBAA) in Pike source
 * - Present color information with editable range
 * - Return presentation formats (hex, rgb) for color picker integration
 */

import {
  Connection,
  Color,
  ColorInformation,
  ColorPresentation,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';

/**
 * Regex matching hex color literals:
 * - #RGB       (3-digit shorthand)
 * - #RRGGBB    (6-digit)
 * - #RRGGBBAA  (8-digit with alpha)
 */
const HEX_COLOR_REGEX = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

/**
 * Parse a hex color string into a Color object.
 *
 * Handles:
 * - #RGB → each digit doubled (e.g. #f00 → #ff0000)
 * - #RRGGBB → direct mapping
 * - #RRGGBBAA → direct mapping with alpha
 *
 * @param hex - Hex color string WITHOUT the leading '#'
 * @returns Color with components in [0-1] range
 */
export function parseHexColor(hex: string): Color {
  let r: number, g: number, b: number, a: number;

  if (hex.length === 3) {
    // #RGB shorthand: each digit is doubled
    r = parseInt(hex[0]! + hex[0], 16) / 255;
    g = parseInt(hex[1]! + hex[1], 16) / 255;
    b = parseInt(hex[2]! + hex[2], 16) / 255;
    a = 1;
  } else if (hex.length === 6) {
    // #RRGGBB
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
    a = 1;
  } else {
    // #RRGGBBAA
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
    a = parseInt(hex.substring(6, 8), 16) / 255;
  }

  return { red: r, green: g, blue: b, alpha: a };
}

/**
 * Find all hex color literals in a text string.
 *
 * @param text - Source text to scan
 * @returns Array of ColorInformation with color values and ranges
 */
export function findColors(text: string): ColorInformation[] {
  const colors: ColorInformation[] = [];
  const lines = text.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum] ?? '';
    let match: RegExpExecArray | null;

    HEX_COLOR_REGEX.lastIndex = 0;
    while ((match = HEX_COLOR_REGEX.exec(line)) !== null) {
      const hexPart = match[1]!;
      const startChar = match.index;
      const endChar = startChar + match[0].length;

      colors.push({
        range: {
          start: { line: lineNum, character: startChar },
          end: { line: lineNum, character: endChar },
        },
        color: parseHexColor(hexPart),
      });
    }
  }

  return colors;
}

/**
 * Generate color presentations for a given color value.
 *
 * Returns presentations in multiple formats for the color picker:
 * - #RRGGBB (6-digit hex)
 * - #RRGGBBAA (8-digit hex with alpha, only if alpha < 1)
 * - rgb(r, g, b)
 * - rgba(r, g, b, a)
 *
 * @param color - LSP Color object with components in [0-1] range
 * @returns Array of ColorPresentation objects
 */
export function getColorPresentations(color: Color): ColorPresentation[] {
  const r = Math.round(color.red * 255);
  const g = Math.round(color.green * 255);
  const b = Math.round(color.blue * 255);
  const a = color.alpha;

  const toHex2 = (n: number) => n.toString(16).padStart(2, '0').toLowerCase();

  const presentations: ColorPresentation[] = [];

  // #RRGGBB format
  presentations.push({
    label: `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`,
  });

  // #RRGGBBAA format (only if alpha is not fully opaque)
  if (a < 1) {
    const aInt = Math.round(a * 255);
    presentations.push({
      label: `#${toHex2(r)}${toHex2(g)}${toHex2(b)}${toHex2(aInt)}`,
    });
  }

  // rgb(r, g, b) format
  presentations.push({
    label: `rgb(${r}, ${g}, ${b})`,
  });

  // rgba(r, g, b, a) format
  presentations.push({
    label: `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`,
  });

  return presentations;
}

/**
 * Register color presentation handlers with the LSP connection.
 *
 * Handles:
 * - textDocument/documentColor - find all colors in a document
 * - textDocument/colorPresentation - get presentations for a color
 */
export function registerColorPresentationHandler(
  connection: Connection,
  _services: Services,
  documents: TextDocuments<TextDocument>
): void {
  const log = new Logger('Advanced');

  /**
   * Handle textDocument/documentColor request.
   * Finds all hex color literals in the document.
   */
  connection.onDocumentColor(async params => {
    log.debug('Document color request', { uri: params.textDocument.uri });
    try {
      const document = documents.get(params.textDocument.uri);
      if (!document) {
        return null;
      }

      const text = document.getText();
      return findColors(text);
    } catch (err) {
      log.error(
        `Document color failed for ${params.textDocument.uri}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  });

  /**
   * Handle textDocument/colorPresentation request.
   * Returns presentation formats for a given color and range.
   */
  connection.onColorPresentation(async params => {
    log.debug('Color presentation request', { uri: params.textDocument.uri });
    try {
      const presentations = getColorPresentations(params.color);

      // Attach text edit for each presentation to replace the original color
      return presentations.map(p => ({
        ...p,
        textEdit: {
          range: params.range,
          newText: p.label,
        },
      }));
    } catch (err) {
      log.error(`Color presentation failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  });
}
