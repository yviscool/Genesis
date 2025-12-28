import { describe, test, expect } from 'bun:test';
import { formatData } from '../src/formatter';

describe('formatData - 无歧义格式化设计', () => {
  describe('基础规则：顶层每个元素 = 一行', () => {
    test('单个数字元素', () => {
      expect(formatData([42])).toBe('42');
    });

    test('多个数字元素 → 多行', () => {
      expect(formatData([1, 2, 3])).toBe('1\n2\n3');
    });

    test('多个字符串元素 → 多行', () => {
      expect(formatData(['.##.', '#..#', '####'])).toBe('.##.\n#..#\n####');
    });

    test('混合类型元素', () => {
      expect(formatData([5, 'hello', true])).toBe('5\nhello\ntrue');
    });
  });

  describe('一维数组 → 空格拼接为一行', () => {
    test('数字数组', () => {
      expect(formatData([[1, 2, 3]])).toBe('1 2 3');
    });

    test('字符串数组', () => {
      expect(formatData([['a', 'b', 'c']])).toBe('a b c');
    });

    test('多个一维数组 → 多行', () => {
      expect(formatData([[1, 2], [3, 4]])).toBe('1 2\n3 4');
    });
  });

  describe('二维数组 → 自动展开为多行', () => {
    test('矩阵展开', () => {
      const matrix = [[1, 0, 1], [0, 1, 0], [1, 1, 1]];
      expect(formatData([matrix])).toBe('1 0 1\n0 1 0\n1 1 1');
    });

    test('带前缀的矩阵', () => {
      const n = 3, m = 3;
      const matrix = [[1, 2], [3, 4], [5, 6]];
      expect(formatData([[n, m], matrix])).toBe('3 3\n1 2\n3 4\n5 6');
    });
  });

  describe('实际使用场景', () => {
    test('典型算法题输入：n, m + 矩阵', () => {
      const result = formatData([
        [5, 3],
        [[0, 1, 0], [1, 0, 1], [0, 0, 1], [1, 1, 0], [0, 1, 1]]
      ]);
      expect(result).toBe('5 3\n0 1 0\n1 0 1\n0 0 1\n1 1 0\n0 1 1');
    });

    test('字符网格输入', () => {
      const result = formatData([
        [3, 4],
        '.##.',
        '#..#',
        '####'
      ]);
      expect(result).toBe('3 4\n.##.\n#..#\n####');
    });

    test('多组查询', () => {
      const result = formatData([
        3,
        [1, 2],
        [3, 4],
        [5, 6]
      ]);
      expect(result).toBe('3\n1 2\n3 4\n5 6');
    });
  });

  describe('边界情况', () => {
    test('空数组', () => {
      expect(formatData([])).toBe('');
    });

    test('包含 null 元素', () => {
      expect(formatData([1, null, 3])).toBe('1\n\n3');
    });

    test('包含 undefined 元素', () => {
      expect(formatData([1, undefined, 3])).toBe('1\n\n3');
    });

    test('非数组输入：单个数字', () => {
      expect(formatData(42)).toBe('42');
    });

    test('非数组输入：单个字符串', () => {
      expect(formatData('hello')).toBe('hello');
    });

    test('非数组输入：null', () => {
      expect(formatData(null)).toBe('');
    });

    test('非数组输入：undefined', () => {
      expect(formatData(undefined)).toBe('');
    });

    test('空的一维数组', () => {
      expect(formatData([[]])).toBe('');
    });

    test('空的二维数组', () => {
      expect(formatData([[[]]])).toBe('');
    });
  });
});
