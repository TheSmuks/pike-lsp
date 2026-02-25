export const DEFAULT_WAIT_TIMEOUT_MS = 15000;
const SLEEP_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitFor<T>(
  description: string,
  producer: () => Promise<T> | T,
  predicate: (value: T) => boolean,
  timeoutMs = DEFAULT_WAIT_TIMEOUT_MS
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | undefined;

  while (Date.now() < deadline) {
    lastValue = await producer();
    if (predicate(lastValue)) {
      return lastValue;
    }
    await sleep(SLEEP_MS);
  }

  throw new Error(`Timed out waiting for ${description}`);
}

export function labelOf(item: any): string {
  return typeof item.label === 'string' ? item.label : item.label?.label || '';
}

export function positionForRegex(doc: any, pattern: RegExp, relativeOffset = 0): any {
  const text = doc.getText();
  const match = text.match(pattern);
  if (!match) {
    throw new Error(`Could not find pattern: ${pattern}`);
  }
  const offset = text.indexOf(match[0]) + relativeOffset;
  return doc.positionAt(offset);
}

export function normalizeLocations(locations: any): any[] {
  if (!locations) {
    return [];
  }
  if (!Array.isArray(locations)) {
    return [locations];
  }
  if (locations.length === 0) {
    return [];
  }
  if ('targetUri' in locations[0]) {
    return locations.map((l: any) => ({ uri: l.targetUri, range: l.targetRange }));
  }
  return locations;
}

export function hoverText(hover: any): string {
  const contents = Array.isArray(hover.contents) ? hover.contents : [hover.contents];
  const content = contents[0];
  return typeof content === 'string' ? content : content?.value || '';
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => {
      setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

export function flattenSymbols(symbols: any[]): any[] {
  const result: any[] = [];
  const stack = [...symbols];

  while (stack.length > 0) {
    const symbol = stack.pop();
    if (!symbol) {
      continue;
    }
    result.push(symbol);
    if (Array.isArray(symbol.children) && symbol.children.length > 0) {
      for (let i = symbol.children.length - 1; i >= 0; i -= 1) {
        stack.push(symbol.children[i]);
      }
    }
  }

  return result;
}

export function findSymbolByName(symbols: any[], name: string): any | null {
  const allSymbols = flattenSymbols(symbols);
  return allSymbols.find(symbol => symbol.name === name) ?? null;
}
