/**
 * Simple example test for tdd-guard demonstration
 */
import { describe, test, expect } from 'bun:test';

describe('Math operations', () => {
  test('adds two numbers', () => {
    expect(2 + 2).toBe(4);
  });

  test('subtraction works correctly', () => {
    expect(5 - 3).toBe(2); // Correct implementation
  });
});
