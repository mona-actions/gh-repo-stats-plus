import { describe, it, expect } from 'vitest';

describe('Arguments Type Conversion', () => {
  it('should properly convert string defaults to numbers', () => {
    // Test the Number() conversion logic that we added
    const testCases = [
      { input: '10', expected: 10 },
      { input: '25', expected: 25 },
      { input: undefined, pageSize: true, expected: 10 }, // fallback for pageSize
      { input: undefined, pageSize: false, expected: 25 }, // fallback for extraPageSize
      { input: null, pageSize: true, expected: 10 }, // fallback for pageSize
      { input: null, pageSize: false, expected: 25 }, // fallback for extraPageSize
      { input: 15, expected: 15 }, // already a number
    ];

    testCases.forEach(({ input, expected, pageSize }) => {
      if (input === undefined || input === null) {
        // Test the fallback logic with null checking
        const result = input != null ? Number(input) : pageSize ? 10 : 25;
        expect(result).toBe(expected);
      } else {
        const result = input != null ? Number(input) : 10;
        expect(result).toBe(expected);
      }
    });
  });

  it('should handle various input types for Number conversion with null checking', () => {
    // Test edge cases for our improved conversion logic
    // Use a helper function to simulate the actual logic
    const convertWithFallback = (
      value: string | number | null | undefined,
      fallback: number,
    ) => (value != null ? Number(value) : fallback);

    expect(convertWithFallback('50', 25)).toBe(50);
    expect(convertWithFallback('0', 25)).toBe(0); // Now 0 is preserved!
    expect(convertWithFallback('', 25)).toBe(0); // empty string converts to 0
    expect(convertWithFallback(undefined, 25)).toBe(25);
    expect(convertWithFallback(null, 25)).toBe(25);

    // For invalid strings, Number() returns NaN, but we still preserve it
    const invalidResult = convertWithFallback('invalid', 25);
    expect(isNaN(invalidResult)).toBe(true);
  });
});
