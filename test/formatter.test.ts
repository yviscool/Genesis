import { describe, test, expect } from 'bun:test';
import { formatData } from '../src/formatter';

describe('formatData', () => {
  test('should return an empty string for null or undefined input', () => {
    expect(formatData(null)).toBe('');
    expect(formatData(undefined)).toBe('');
  });

  test('should format a single value', () => {
    expect(formatData(5)).toBe('5');
    expect(formatData('hello')).toBe('hello');
  });

  test('should format a simple array where each element becomes a new line', () => {
    expect(formatData([1, 2, 3])).toBe('1\n2\n3');
  });

  test('should format an array of arrays as multiple space-separated lines', () => {
    const data = [
      [1, 2],
      [3, 4, 5],
    ];
    expect(formatData(data)).toBe('1 2\n3 4 5');
  });

  test('should format a 2D matrix (array of arrays of arrays)', () => {
    const data = [[[1, 0], [0, 1]]];
    expect(formatData(data)).toBe('1 0\n0 1');
  });

  test('should treat an array of strings as pre-formatted lines', () => {
    const data = [['hello world'], ['another line']];
    expect(formatData(data)).toBe('hello world\nanother line');
  });

  test('should handle mixed data types gracefully', () => {
    const data = [
      5, // single number
      [10, 20], // array of numbers
      [[1, 1], [2, 2]], // matrix
      ['a pre-formatted line'],
      'another single line'
    ];
    const expected = '5\n10 20\n1 1\n2 2\na pre-formatted line\nanother single line';
    expect(formatData(data)).toBe(expected);
  });

  test('should handle empty arrays and sub-arrays', () => {
    expect(formatData([])).toBe('');
    expect(formatData([[]])).toBe('');
    expect(formatData([[], []])).toBe('\n');
    expect(formatData([[1,2], [], [3,4]])).toBe('1 2\n\n3 4');
  });
});
