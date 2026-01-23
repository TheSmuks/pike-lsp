// Type declarations for bun test
declare module 'bun:test' {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function it(name: string, fn: () => void | Promise<void>): void;

  interface Matchers {
    toBe(value: unknown): void;
    toContain(value: unknown): void;
    toHaveLength(length: number): void;
    toThrow(): void;
    toEqual(value: unknown): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    not: Matchers;
  }

  function expect(value: unknown): Matchers;
}
