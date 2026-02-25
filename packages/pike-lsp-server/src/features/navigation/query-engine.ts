import type { Location } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseLocation(value: unknown): Location | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const uri = record['uri'];
  const range = asRecord(record['range']);
  const start = asRecord(range?.['start']);
  const end = asRecord(range?.['end']);

  if (
    typeof uri !== 'string' ||
    !start ||
    !end ||
    typeof start['line'] !== 'number' ||
    typeof start['character'] !== 'number' ||
    typeof end['line'] !== 'number' ||
    typeof end['character'] !== 'number'
  ) {
    return null;
  }

  return {
    uri,
    range: {
      start: { line: start['line'], character: start['character'] },
      end: { line: end['line'], character: end['character'] },
    },
  };
}

function parseLocationArray(value: unknown): Location[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const locations: Location[] = [];
  for (const item of value) {
    const parsed = parseLocation(item);
    if (parsed) {
      locations.push(parsed);
    }
  }
  return locations;
}

export async function queryNavigationLocations(
  services: Services,
  feature: 'definition' | 'references',
  uri: string,
  document: TextDocument,
  position: { line: number; character: number },
  extraParams: Record<string, unknown> = {}
): Promise<Location[] | undefined> {
  const bridge = services.bridge;
  if (!bridge || !bridge.isRunning()) {
    return undefined;
  }

  const requestId = `${feature}:${uri}:${document.version}:${Date.now()}`;
  const filename = decodeURIComponent(uri.replace(/^file:\/\//, ''));

  try {
    const response = await bridge.engineQuery({
      feature,
      requestId,
      snapshot: { mode: 'latest' },
      queryParams: {
        uri,
        filename,
        version: document.version,
        text: document.getText(),
        position,
        ...extraParams,
      },
    });

    const directLocations = parseLocationArray(response.result['locations']);
    if (directLocations && directLocations.length > 0) {
      return directLocations;
    }

    const directLocation = parseLocation(response.result['location']);
    if (directLocation) {
      return [directLocation];
    }

    const nestedResult = asRecord(response.result['result']);
    if (!nestedResult || nestedResult['status'] === 'stub') {
      return undefined;
    }

    const nestedLocations = parseLocationArray(nestedResult['locations']);
    if (nestedLocations && nestedLocations.length > 0) {
      return nestedLocations;
    }

    const nestedLocation = parseLocation(nestedResult['location']);
    if (nestedLocation) {
      return [nestedLocation];
    }
  } catch {
    return undefined;
  }

  return undefined;
}
