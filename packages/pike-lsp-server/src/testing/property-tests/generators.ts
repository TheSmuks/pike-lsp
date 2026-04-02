import fc from 'fast-check';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type {
  Position,
  TextDocumentContentChangeEvent,
  Diagnostic,
} from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { DocumentCacheEntry } from '../../core/types.js';

const IDENTIFIER_CHARS = 'abcdefghijklmnopqrstuvwxyz';
const SEGMENT_ARBITRARY = fc
  .string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...IDENTIFIER_CHARS) })
  .map(segment => segment.toLowerCase());

const PIKE_STATEMENT_ARBITRARY = fc
  .oneof(
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 8, unit: fc.constantFrom(...IDENTIFIER_CHARS) }),
      value: fc.integer({ min: -1000, max: 1000 }),
    }),
    fc.record({
      left: fc.string({ minLength: 1, maxLength: 8, unit: fc.constantFrom(...IDENTIFIER_CHARS) }),
      right: fc.string({ minLength: 1, maxLength: 8, unit: fc.constantFrom(...IDENTIFIER_CHARS) }),
    })
  )
  .map(stmt => {
    if ('name' in stmt) {
      return `int ${stmt.name} = ${stmt.value};`;
    }
    return `${stmt.left} = ${stmt.right};`;
  });

const PIKE_TEXT_ARBITRARY = fc
  .array(PIKE_STATEMENT_ARBITRARY, { minLength: 1, maxLength: 30 })
  .map(lines => `${lines.join('\n')}\n`);

export function documentUriArbitrary(): fc.Arbitrary<string> {
  return fc
    .tuple(fc.array(SEGMENT_ARBITRARY, { minLength: 1, maxLength: 4 }), SEGMENT_ARBITRARY)
    .map(([segments, filename]) => `file:///${segments.join('/')}/${filename}.pike`);
}

export function textDocumentArbitrary(): fc.Arbitrary<TextDocument> {
  return fc
    .tuple(documentUriArbitrary(), fc.integer({ min: 0, max: 10_000 }), PIKE_TEXT_ARBITRARY)
    .map(([uri, version, text]) => TextDocument.create(uri, 'pike', version, text));
}

export function validPositionArbitrary(document: TextDocument): fc.Arbitrary<Position> {
  const lines = document.getText().split('\n');
  const lastLineIndex = Math.max(0, lines.length - 1);

  return fc.integer({ min: 0, max: lastLineIndex }).chain(line => {
    const lineText = lines[line] ?? '';
    return fc.integer({ min: 0, max: lineText.length }).map(character => ({ line, character }));
  });
}

export function textDocumentChangeEventArbitrary(
  document: TextDocument
): fc.Arbitrary<TextDocumentContentChangeEvent> {
  return fc.oneof(
    fc.record({
      text: PIKE_TEXT_ARBITRARY,
    }),
    fc
      .tuple(
        validPositionArbitrary(document),
        validPositionArbitrary(document),
        PIKE_STATEMENT_ARBITRARY
      )
      .map(([start, end, text]) => {
        const rangeStart =
          start.line < end.line || (start.line === end.line && start.character <= end.character)
            ? start
            : end;
        const rangeEnd = rangeStart === start ? end : start;
        return {
          range: {
            start: rangeStart,
            end: rangeEnd,
          },
          text,
        };
      })
  );
}

function pikeSymbolArbitrary(): fc.Arbitrary<PikeSymbol> {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 12, unit: fc.constantFrom(...IDENTIFIER_CHARS) }),
    kind: fc.integer({ min: 1, max: 20 }).map(kind => kind as unknown as PikeSymbol['kind']),
    modifiers: fc.constant([]),
  });
}

export function cacheEntryArbitrary(document: TextDocument): fc.Arbitrary<DocumentCacheEntry> {
  return fc
    .tuple(
      fc.array(pikeSymbolArbitrary(), { minLength: 0, maxLength: 12 }),
      fc.array(validPositionArbitrary(document), { minLength: 0, maxLength: 12 }),
      fc.array(
        fc.record({
          message: fc.string({ minLength: 1, maxLength: 80 }),
          line: fc.integer({ min: 0, max: Math.max(0, document.getText().split('\n').length - 1) }),
          character: fc.integer({ min: 0, max: 120 }),
        }),
        { minLength: 0, maxLength: 8 }
      )
    )
    .map(([symbols, positions, rawDiagnostics]) => {
      const symbolPositions = new Map<string, Position[]>();
      for (const symbol of symbols) {
        symbolPositions.set(symbol.name, positions);
      }

      const symbolNames = new Map<string, PikeSymbol>(symbols.map(symbol => [symbol.name, symbol]));
      const diagnostics: Diagnostic[] = rawDiagnostics.map(diag => ({
        message: diag.message,
        severity: 1,
        source: 'pike',
        range: {
          start: {
            line: diag.line,
            character: diag.character,
          },
          end: {
            line: diag.line,
            character: diag.character + 1,
          },
        },
      }));

      return {
        version: document.version,
        symbols,
        diagnostics,
        symbolPositions,
        symbolNames,
        contentHash: `hash-${document.version}`,
        lineHashes: document
          .getText()
          .split('\n')
          .map((line, index) => line.length + index),
        analysisState: {
          isStale: false,
          parseFailed: false,
        },
      };
    });
}
