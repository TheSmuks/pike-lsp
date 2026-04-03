import fc from 'fast-check';
import type { Position } from 'vscode-languageserver/node.js';
import type { DocumentCacheEntry } from '../../core/types.js';

export const PROPERTY_RUNS = 10_000;

export function assertInvariant(name: string, property: fc.IProperty<unknown>): void {
  const seed = (Date.now() + name.length) % 2_147_483_647;
  try {
    fc.assert(property, {
      numRuns: PROPERTY_RUNS,
      seed,
      verbose: 2,
    });
  } catch (error) {
    if (error instanceof Error) {
      error.message = `[${name}] seed=${seed}\n${error.message}`;
    }
    throw error;
  }
}

export function shouldWriteVersionedResult(
  validatedVersion: number,
  liveVersion: number | undefined
): boolean {
  return liveVersion !== undefined && liveVersion === validatedVersion;
}

export function canPublishDiagnosticsVersion(
  validatedVersion: number,
  liveVersion: number | undefined
): boolean {
  return liveVersion !== undefined && liveVersion === validatedVersion;
}

export function canPublishDiagnosticsRevision(
  candidateRevision: number,
  latestRevision: number | undefined
): boolean {
  return latestRevision !== undefined && candidateRevision === latestRevision;
}

export function isPositionWithinDocument(text: string, position: Position): boolean {
  const lines = text.split('\n');
  if (position.line < 0 || position.line >= lines.length) {
    return false;
  }

  const lineText = lines[position.line] ?? '';
  return position.character >= 0 && position.character <= lineText.length;
}

export function hasOnlyValidSymbolPositions(text: string, entry: DocumentCacheEntry): boolean {
  for (const positions of entry.symbolPositions.values()) {
    for (const position of positions) {
      if (!isPositionWithinDocument(text, position)) {
        return false;
      }
    }
  }

  return true;
}
