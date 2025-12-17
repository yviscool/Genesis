import { describe, test, expect } from 'bun:test';
import { formatData } from '../src/formatter';

describe('formatData - 数据格式化', () => {
  test('应将数字数组格式化为空格分隔的字符串', () => {
    const data = [1, 2, 3];
    expect(formatData(data)).toBe('1 2 3');
  });

  test('应将数字矩阵格式化为多行字符串', () => {
    const data = [[1, 2], [3, 4]];
    expect(formatData(data)).toBe('1 2\n3 4');
  });

  test('应将字符串数组格式化为空格分隔的字符串', () => {
    const data = ['a', 'b', 'c'];
    expect(formatData(data)).toBe('a b c');
  });

  test('应将单个数字格式化为字符串', () => {
    expect(formatData(123)).toBe('123');
  });

  test('应将单个字符串原样返回', () => {
    expect(formatData('hello')).toBe('hello');
  });

  test('对于 null 或 undefined 应返回空字符串', () => {
    expect(formatData(null)).toBe('');
    expect(formatData(undefined)).toBe('');
  });

  test('如果对象不是普通对象，应将其转换为字符串', () => {
    expect(formatData(true)).toBe('true');
    // Date.toString() 返回日期字符串，这对于算法题输入通常不常见，但也算一种行为
    const date = new Date('2023-01-01');
    expect(formatData(date)).toBe(date.toString());
  });

  test('如果对象是普通对象，应尝试将其转换为 JSON', () => {
      const obj = { a: 1, b: 2 };
      expect(formatData(obj)).toBe('{"a":1,"b":2}');
  });
});
