import { describe, test, expect, mock } from 'bun:test';
import { G } from '../src/generator';

describe('G (Generator) - 生成器测试', () => {
  describe('G.CHARSET - 字符集', () => {
    test('应包含正确的预定义字符集', () => {
      expect(G.CHARSET.LOWERCASE).toBe('abcdefghijklmnopqrstuvwxyz');
      expect(G.CHARSET.UPPERCASE).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      expect(G.CHARSET.DIGITS).toBe('0123456789');
      expect(G.CHARSET.ALPHANUMERIC).toBe(G.CHARSET.LOWERCASE + G.CHARSET.UPPERCASE + G.CHARSET.DIGITS);
      expect(G.CHARSET.ALPHA).toBe(G.CHARSET.LOWERCASE + G.CHARSET.UPPERCASE);
      expect(G.CHARSET.BASE36).toBe(G.CHARSET.DIGITS + G.CHARSET.UPPERCASE);
    });
  });

  describe('G.int - 整数生成', () => {
    test('应生成指定范围内的整数', () => {
      const min = 1;
      const max = 10;
      const result = G.int(min, max);
      expect(result).toBeTypeOf('number');
      expect(result).toBeGreaterThanOrEqual(min);
      expect(result).toBeLessThanOrEqual(max);
      expect(Math.floor(result)).toBe(result);
    });
  });

  describe('G.ints - 整数数组生成', () => {
    test('应生成指定数量的整数数组', () => {
      const count = 5;
      const min = 1;
      const max = 100;
      const result = G.ints(count, min, max);
      expect(result).toBeArrayOfSize(count);
      result.forEach(num => {
        expect(num).toBeTypeOf('number');
        expect(num).toBeGreaterThanOrEqual(min);
        expect(num).toBeLessThanOrEqual(max);
        expect(Math.floor(num)).toBe(num);
      });
    });
  });

  describe('G.distinctInts - 不重复整数生成', () => {
    test('应生成指定数量的互不相同整数数组', () => {
      const count = 5;
      const min = 1;
      const max = 10;
      const result = G.distinctInts(count, min, max);
      expect(result).toBeArrayOfSize(count);
      const uniqueCount = new Set(result).size;
      expect(uniqueCount).toBe(count);
      result.forEach(num => {
        expect(num).toBeTypeOf('number');
        expect(num).toBeGreaterThanOrEqual(min);
        expect(num).toBeLessThanOrEqual(max);
      });
    });

    test('当数量超过范围大小时应抛出错误', () => {
      expect(() => G.distinctInts(10, 1, 5)).toThrow('Cannot generate 10 distinct integers from a range of size 5.');
    });
  });

  describe('G.float - 浮点数生成', () => {
    test('应生成指定范围和精度的浮点数', () => {
      const min = 1.0;
      const max = 2.0;
      const precision = 4;
      const result = G.float(min, max, precision);
      expect(result).toBeTypeOf('number');
      expect(result).toBeGreaterThanOrEqual(min);
      expect(result).toBeLessThanOrEqual(max);
      expect(result.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(precision);
    });
  });

  describe('G.even - 偶数生成', () => {
    test('应生成指定范围内的偶数', () => {
      const min = 1;
      const max = 10;
      const result = G.even(min, max);
      expect(result).toBeTypeOf('number');
      expect(result).toBeGreaterThanOrEqual(min);
      expect(result).toBeLessThanOrEqual(max);
      expect(result % 2).toBe(0);
    });

    test('如果在范围内没有偶数应抛出错误', () => {
      expect(() => G.even(1, 1)).toThrow('No even numbers exist in the range [1, 1].');
    });
  });

  describe('G.odd - 奇数生成', () => {
    test('应生成指定范围内的奇数', () => {
      const min = 1;
      const max = 10;
      const result = G.odd(min, max);
      expect(result).toBeTypeOf('number');
      expect(result).toBeGreaterThanOrEqual(min);
      expect(result).toBeLessThanOrEqual(max);
      expect(result % 2).toBe(1);
    });

    test('如果在范围内没有奇数应抛出错误', () => {
      expect(() => G.odd(2, 2)).toThrow('No odd numbers exist in the range [2, 2].');
    });
  });

  describe('G.string - 字符串生成', () => {
    test('应生成指定长度的字符串', () => {
      const len = 15;
      const result = G.string(len);
      expect(result).toBeTypeOf('string');
      expect(result.length).toBe(len);
    });

    test('应使用提供的字符集生成字符串', () => {
      const len = 20;
      const charset = 'abc';
      const result = G.string(len, charset);
      expect(result.length).toBe(len);
      for (const char of result) {
        expect(charset).toContain(char);
      }
    });
  });

  describe('G.palindrome - 回文串生成', () => {
    test('应生成指定长度的有效奇数长度回文串', () => {
      const len = 7;
      const result = G.palindrome(len);
      expect(result.length).toBe(len);
      expect(result).toEqual(result.split('').reverse().join(''));
    });

    test('应生成指定长度的有效偶数长度回文串', () => {
      const len = 8;
      const result = G.palindrome(len);
      expect(result.length).toBe(len);
      expect(result).toEqual(result.split('').reverse().join(''));
    });

    test('对于长度 0 或更小应返回空字符串', () => {
      expect(G.palindrome(0)).toBe('');
      expect(G.palindrome(-5)).toBe('');
    });
  });

  describe('G.word - 单词生成', () => {
    test('应生成长度在 minLen 和 maxLen 之间的单词', () => {
      const minLen = 5;
      const maxLen = 10;
      const result = G.word(minLen, maxLen);
      expect(result).toBeTypeOf('string');
      expect(result.length).toBeGreaterThanOrEqual(minLen);
      expect(result.length).toBeLessThanOrEqual(maxLen);
      expect(result).toMatch(/^[a-z]+$/);
    });
  });

  describe('G.words - 单词数组生成', () => {
    test('应生成数量和长度正确的单词数组', () => {
      const count = 3;
      const minLen = 4;
      const maxLen = 6;
      const result = G.words(count, minLen, maxLen);
      expect(result).toBeArrayOfSize(count);
      result.forEach(word => {
        expect(word).toBeTypeOf('string');
        expect(word.length).toBeGreaterThanOrEqual(minLen);
        expect(word.length).toBeLessThanOrEqual(maxLen);
        expect(word).toMatch(/^[a-z]+$/);
      });
    });
  });

  describe('G.array - 数组生成', () => {
    test('应使用 itemGenerator 生成数组', () => {
      const count = 5;
      const itemGenerator = (i: number) => `item-${i}`;
      const result = G.array(count, itemGenerator);
      expect(result).toBeArrayOfSize(count);
      expect(result).toEqual(['item-0', 'item-1', 'item-2', 'item-3', 'item-4']);
    });
  });

  describe('G.sorted - 有序数组生成', () => {
    test('应生成排序数组 (默认升序)', () => {
      const result = G.sorted(10, 1, 100);
      expect(result).toBeArrayOfSize(10);
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i]).toBeLessThanOrEqual(result[i + 1]);
      }
    });

    test('应生成严格升序数组', () => {
      const result = G.sorted(10, 1, 100, { order: 'strictlyAsc' });
      expect(result).toBeArrayOfSize(10);
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i]).toBeLessThan(result[i + 1]);
      }
    });

    test('应生成降序数组', () => {
      const result = G.sorted(10, 1, 100, { order: 'desc' });
      expect(result).toBeArrayOfSize(10);
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i]).toBeGreaterThanOrEqual(result[i + 1]);
      }
    });

    test('应生成严格降序数组', () => {
      const result = G.sorted(10, 1, 100, { order: 'strictlyDesc' });
      expect(result).toBeArrayOfSize(10);
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i]).toBeGreaterThan(result[i + 1]);
      }
    });
  });

  describe('G.sparse - 稀疏数组生成', () => {
    test('应生成具有指定间隔的稀疏数组', () => {
      const count = 5;
      const min = 1;
      const max = 50;
      const gap = 5;
      const result = G.sparse(count, min, max, gap);
      expect(result).toBeArrayOfSize(count);
      const sortedResult = [...result].sort((a, b) => a - b);
      for (let i = 0; i < sortedResult.length - 1; i++) {
        expect(sortedResult[i + 1] - sortedResult[i]).toBeGreaterThanOrEqual(gap);
      }
      result.forEach(num => {
        expect(num).toBeGreaterThanOrEqual(min);
        expect(num).toBeLessThanOrEqual(max);
      });
    });

    test('如果范围对于间隔太小应抛出错误', () => {
      expect(() => G.sparse(3, 1, 10, 5)).toThrow('Cannot generate 3 sparse numbers with gap 5 in range [1, 10]. Range is too small.');
    });
  });

  describe('G.partition - 整数拆分生成', () => {
    test('应生成元素之和等于目标和的数组', () => {
      const count = 5;
      const sum = 100;
      const result = G.partition(count, sum);
      expect(result).toBeArrayOfSize(count);
      const actualSum = result.reduce((acc, val) => acc + val, 0);
      expect(actualSum).toBe(sum);
      result.forEach(num => expect(num).toBeGreaterThanOrEqual(1));
    });

    test('应遵守 minVal 选项', () => {
      const count = 3;
      const sum = 30;
      const minVal = 10;
      const result = G.partition(count, sum, { minVal });
      expect(result).toBeArrayOfSize(count);
      const actualSum = result.reduce((acc, val) => acc + val, 0);
      expect(actualSum).toBe(sum);
      result.forEach(num => expect(num).toBeGreaterThanOrEqual(minVal));
    });

    test('如果 sum 对于 minVal 来说太小应抛出错误', () => {
      expect(() => G.partition(5, 10, { minVal: 3 })).toThrow('Cannot partition sum 10 into 5 parts with minVal 3. Required sum is at least 15.');
    });
  });

  describe('G.matrix - 矩阵生成', () => {
    test('应生成具有正确维度的矩阵', () => {
      const rows = 3;
      const cols = 4;
      const result = G.matrix(rows, cols, () => 0);
      expect(result).toBeArrayOfSize(rows);
      expect(result[0]).toBeArrayOfSize(cols);
      expect(result[1]).toBeArrayOfSize(cols);
      expect(result[2]).toBeArrayOfSize(cols);
    });

    test('应正确使用 cellGenerator', () => {
      const rows = 2;
      const cols = 2;
      const cellGenerator = (r: number, c: number) => `(${r},${c})`;
      const result = G.matrix(rows, cols, cellGenerator);
      expect(result).toEqual([['(0,0)', '(0,1)'], ['(1,0)', '(1,1)']]);
    });
  });

  describe('G.grid01 - 01矩阵生成', () => {
    test('应生成具有正确维度的 01 矩阵', () => {
      const rows = 5;
      const cols = 5;
      const result = G.grid01(rows, cols);
      expect(result).toBeArrayOfSize(rows);
      result.forEach(row => {
        expect(row).toBeArrayOfSize(cols);
        row.forEach(cell => {
          expect(cell === 0 || cell === 1).toBeTrue();
        });
      });
    });

    test('应遵守 density 选项', () => {
      const rows = 10;
      const cols = 10;
      const density = 0.1;
      const result = G.grid01(rows, cols, density);
      let onesCount = 0;
      result.forEach(row => row.forEach(cell => { if (cell === 1) onesCount++; }));
      // 允许由于随机性产生的偏差
      expect(onesCount).toBeGreaterThanOrEqual(rows * cols * (density - 0.1));
      expect(onesCount).toBeLessThanOrEqual(rows * cols * (density + 0.1));
    });
  });

  describe('G.base.convert - 进制转换', () => {
    test('应正确在不同进制间转换', () => {
      expect(G.base.convert('1010', 2, 10)).toBe('10');
      expect(G.base.convert('F', 16, 10)).toBe('15');
      expect(G.base.convert(255, 10, 16)).toBe('FF');
      expect(G.base.convert('Z', 36, 10)).toBe('35');
      expect(G.base.convert(10, 10, 2)).toBe('1010');
      expect(G.base.convert(15, 10, 16)).toBe('F');
      expect(G.base.convert(35, 10, 36)).toBe('Z');
    });

    test('应处理 BigInt 输入', () => {
      expect(G.base.convert(BigInt('1000000000000000000'), 10, 16)).toBe('DE0B6B3A7640000');
    });

    test('对于非法输入字符应抛出错误', () => {
      expect(() => G.base.convert('102', 2, 10)).toThrow('Input "102" contains invalid characters for base 2.');
      expect(() => G.base.convert('G', 16, 10)).toThrow('Input "G" contains invalid characters for base 16.');
    });

    test('对于非法进制应抛出错误', () => {
      expect(() => G.base.convert('10', 1, 10)).toThrow('Radix must be an integer between 2 and 36. Received: from=1, to=10');
      expect(() => G.base.convert('10', 10, 37)).toThrow('Radix must be an integer between 2 and 36. Received: from=10, to=37');
    });
  });

  describe('G.base.binToHex - 二进制转十六进制', () => {
    test('应将二进制转换为十六进制', () => {
      expect(G.base.binToHex('111100001010')).toBe('F0A');
      expect(G.base.binToHex('101')).toBe('5');
    });

    test('对于非法二进制输入应抛出错误', () => {
      expect(() => G.base.binToHex('1012')).toThrow();
    });
  });

  describe('G.base.hexToBin - 十六进制转二进制', () => {
    test('应将十六进制转换为二进制', () => {
      expect(G.base.hexToBin('F0A')).toBe('111100001010');
      expect(G.base.hexToBin('5')).toBe('101');
    });

    test('对于非法十六进制输入应抛出错误', () => {
      expect(() => G.base.hexToBin('G')).toThrow();
    });
  });

  describe('G.base.digits - 随机数字符串生成', () => {
    test('应生成指定长度和进制的随机数字符串', () => {
      const length = 10;
      const radix = 16;
      const result = G.base.digits(length, radix);
      expect(result.length).toBe(length);
      expect(result).toMatch(/^[1-9A-F][0-9A-F]*$/); // 无前导零，字符集正确
    });

    test('应生成单位数数字字符串', () => {
      const length = 1;
      const radix = 10;
      const result = G.base.digits(length, radix);
      expect(result.length).toBe(1);
      expect(result).toMatch(/^[0-9]$/);
    });

    test('对于非法进制应抛出错误', () => {
      expect(() => G.base.digits(5, 1)).toThrow('Radix must be an integer between 2 and 36. Received: 1');
      expect(() => G.base.digits(5, 37)).toThrow('Radix must be an integer between 2 and 36. Received: 37');
    });

    test('长度 > 1 时不应有前导零', () => {
      const length = 5;
      const radix = 10;
      const result = G.base.digits(length, radix);
      expect(result.length).toBe(length);
      if (length > 1) {
        expect(result.startsWith('0')).toBeFalse();
      }
    });
  });

  describe('G.tree - 树生成', () => {
    test('应生成具有正确顶点数和边数的随机树', () => {
      const n = 10;
      const tree = G.tree(n);
      const nodes = new Set<number>();
      tree.forEach(([u, v]) => {
        nodes.add(u);
        nodes.add(v);
      });
      expect(tree.length).toBe(n - 1);
      expect(nodes.size).toBe(n);
    });

    test('应生成链图 (Path Graph)', () => {
      const n = 5;
      const tree = G.tree(n, { type: 'path' });
      const degrees = new Map<number, number>();
      tree.forEach(([u, v]) => {
        degrees.set(u, (degrees.get(u) || 0) + 1);
        degrees.set(v, (degrees.get(v) || 0) + 1);
      });

      let leafNodes = 0;
      let internalNodes = 0;
      for (const degree of degrees.values()) {
        if (degree === 1) leafNodes++;
        if (degree === 2) internalNodes++;
      }

      expect(tree.length).toBe(n - 1);
      expect(leafNodes).toBe(2);
      expect(internalNodes).toBe(n - 2);
    });

    test('应生成菊花图 (Star Graph)', () => {
      const n = 7;
      const tree = G.tree(n, { type: 'star' });
      const degrees = new Map<number, number>();
      tree.forEach(([u, v]) => {
        degrees.set(u, (degrees.get(u) || 0) + 1);
        degrees.set(v, (degrees.get(v) || 0) + 1);
      });

      let centerNode = 0;
      let leafNodes = 0;
      for (const degree of degrees.values()) {
        if (degree === n - 1) centerNode++;
        if (degree === 1) leafNodes++;
      }

      expect(tree.length).toBe(n - 1);
      expect(centerNode).toBe(1);
      expect(leafNodes).toBe(n - 1);
    });

    test('应遵守 oneBased: false 选项', () => {
      const tree = G.tree(5, { oneBased: false });
      const nodes = new Set<number>();
      tree.forEach(([u, v]) => {
        nodes.add(u);
        nodes.add(v);
      });
      expect(Math.min(...nodes)).toBe(0);
      expect(Math.max(...nodes)).toBe(4);
    });

    test('应生成带权边', () => {
      const tree = G.tree(8, { weighted: [10, 20] });
      expect(tree[0].length).toBe(3);
      tree.forEach(edge => {
        expect(edge[2]).toBeGreaterThanOrEqual(10);
        expect(edge[2]).toBeLessThanOrEqual(20);
      });
    });
  });

  describe('G.graph - 图生成', () => {
    test('应生成包含 n 个顶点 m 条边的简单图', () => {
      const n = 20;
      const m = 50;
      const graph = G.graph(n, m);
      const nodes = new Set<number>();
      graph.forEach(([u, v]) => {
        nodes.add(u);
        nodes.add(v);
      });
      expect(graph.length).toBe(m);
      // 注意: 如果 m 较小，不保证所有节点都出现在边集中
    });

    test('默认情况下不应生成自环', () => {
      const graph = G.graph(10, 30, { noSelfLoops: true });
      graph.forEach(([u, v]) => {
        expect(u).not.toBe(v);
      });
    });

    test('应生成连通图', () => {
      const n = 15;
      const m = 20;
      const graph = G.graph(n, m, { connected: true });

      const adj = new Map<number, number[]>();
      for (let i = 1; i <= n; i++) adj.set(i, []);

      graph.forEach(([u, v]) => {
        adj.get(u)?.push(v);
        adj.get(v)?.push(u);
      });

      const visited = new Set<number>();
      const q = [1];
      visited.add(1);
      while (q.length > 0) {
        const u = q.shift()!;
        adj.get(u)?.forEach(v => {
          if (!visited.has(v)) {
            visited.add(v);
            q.push(v);
          }
        });
      }

      expect(graph.length).toBe(m);
      expect(visited.size).toBe(n);
    });

    test('应生成有向无环图 (DAG)', () => {
      const n = 10;
      const m = 15;
      const graph = G.graph(n, m, { type: 'dag', directed: true, oneBased: false });

      const inDegree = new Array(n).fill(0);
      const adj = new Map<number, number[]>();
      for (let i = 0; i < n; i++) adj.set(i, []);

      graph.forEach(([u, v]) => {
        adj.get(u)?.push(v);
        inDegree[v]++;
      });

      const q: number[] = [];
      for (let i = 0; i < n; i++) {
        if (inDegree[i] === 0) {
          q.push(i);
        }
      }

      let count = 0;
      while (q.length > 0) {
        const u = q.shift()!;
        count++;
        adj.get(u)?.forEach(v => {
          inDegree[v]--;
          if (inDegree[v] === 0) {
            q.push(v);
          }
        });
      }

      expect(count).toBe(n); // 如果所有节点都被访问，说明没有环
    });

    test('应生成二分图', () => {
      const n = 12;
      const m = 20;
      const graph = G.graph(n, m, { type: 'bipartite', oneBased: false });

      const adj = new Map<number, number[]>();
      for (let i = 0; i < n; i++) adj.set(i, []);
      graph.forEach(([u, v]) => {
        adj.get(u)?.push(v);
        adj.get(v)?.push(u);
      });

      const colors = new Map<number, number>();
      let isBipartite = true;

      function bfs(startNode: number) {
        if (colors.has(startNode)) return;
        const q: [number, number][] = [[startNode, 0]];
        colors.set(startNode, 0);

        let head = 0;
        while (head < q.length) {
          const [u, color] = q[head++]!;
          adj.get(u)?.forEach(v => {
            if (!colors.has(v)) {
              colors.set(v, 1 - color);
              q.push([v, 1 - color]);
            } else if (colors.get(v) === color) {
              isBipartite = false;
            }
          });
        }
      }

      for (let i = 0; i < n; i++) {
        if (!isBipartite) break;
        if (!colors.has(i)) {
          bfs(i);
        }
      }

      expect(isBipartite).toBe(true);
    });

    test('当边数超过 DAG 最大限制时应抛出错误', () => {
      // DAG n=10 最大边数是 45
      expect(() => G.graph(10, 46, { type: 'dag', directed: true })).toThrow(/can have at most 45 edges/);
    });

    test('应正确处理二分图的最大边数限制', () => {
      // n=10, 二分图 (无向) 最大边数是 5*5=25
      expect(() => G.graph(10, 26, { type: 'bipartite', directed: false })).toThrow(/can have at most 25 edges/);
      // n=10, 二分图 (有向) 最大边数是 2*5*5=50
      expect(() => G.graph(10, 51, { type: 'bipartite', directed: true })).toThrow(/can have at most 50 edges/);
    });

    test('如果边数在范围内应始终成功生成二分图 (防止随机挂起)', () => {
      // 之前的 bug: 划分可能是 1 vs 9，最大边数 9。请求 20 条边会挂起。
      // 现在应确保划分足够平衡。
      const n = 10;
      const m = 20;
      // 尝试多次以确保无不稳定的行为
      for (let i = 0; i < 10; i++) {
        const graph = G.graph(n, m, { type: 'bipartite' });
        expect(graph.length).toBe(m);
      }
    });

    test('应生成连通二分图', () => {
      const n = 10;
      const m = 15;
      const graph = G.graph(n, m, { type: 'bipartite', connected: true, oneBased: false });
      expect(graph.length).toBe(m);

      // 验证连通性
      const adj = new Map<number, number[]>();
      for (let i = 0; i < n; i++) adj.set(i, []);
      graph.forEach(([u, v]) => {
        adj.get(u)?.push(v);
        adj.get(v)?.push(u);
      });

      const visited = new Set<number>();
      const q = [0];
      visited.add(0);
      while (q.length > 0) {
        const u = q.shift()!;
        adj.get(u)?.forEach(v => {
          if (!visited.has(v)) {
            visited.add(v);
            q.push(v);
          }
        });
      }
      expect(visited.size).toBe(n);
    });

    test('应生成连通 DAG', () => {
      const n = 10;
      const m = 15;
      const graph = G.graph(n, m, { type: 'dag', connected: true, oneBased: false });
      expect(graph.length).toBe(m);

      // 验证连通性 (检查弱连通性)
      const adj = new Map<number, number[]>();
      for (let i = 0; i < n; i++) adj.set(i, []);
      graph.forEach(([u, v]) => {
        adj.get(u)?.push(v);
        adj.get(v)?.push(u);
      });

      const visited = new Set<number>();
      const q = [0];
      visited.add(0);
      while (q.length > 0) {
        const u = q.shift()!;
        adj.get(u)?.forEach(v => {
          if (!visited.has(v)) {
            visited.add(v);
            q.push(v);
          }
        });
      }
      expect(visited.size).toBe(n);
    });

  });

  // ============ 新功能测试 ============

  describe('G.prime - 质数生成', () => {
    test('应生成指定范围内的质数', () => {
      const result = G.prime(10, 50);
      expect(result).toBeTypeOf('number');
      expect(result).toBeGreaterThanOrEqual(10);
      expect(result).toBeLessThanOrEqual(50);
      // 验证是质数
      const isPrime = (n: number) => {
        if (n < 2) return false;
        for (let i = 2; i * i <= n; i++) {
          if (n % i === 0) return false;
        }
        return true;
      };
      expect(isPrime(result)).toBe(true);
    });

    test('如果范围内没有质数应抛出错误', () => {
      expect(() => G.prime(24, 28)).toThrow(/No prime numbers exist/);
    });
  });

  describe('G.coprime - 互质数对生成', () => {
    test('应生成互质数对', () => {
      const [a, b] = G.coprime(1, 100);
      expect(a).toBeTypeOf('number');
      expect(b).toBeTypeOf('number');
      expect(a).not.toBe(b);
      // 验证互质
      const gcd = (x: number, y: number): number => y === 0 ? x : gcd(y, x % y);
      expect(gcd(a, b)).toBe(1);
    });
  });

  describe('G.divisible - 可整除数生成', () => {
    test('应生成能被指定数整除的数', () => {
      const d = 7;
      const result = G.divisible(1, 100, d);
      expect(result).toBeTypeOf('number');
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(100);
      expect(result % d).toBe(0);
    });

    test('如果范围内没有可整除数应抛出错误', () => {
      expect(() => G.divisible(1, 5, 7)).toThrow(/No numbers divisible by/);
    });

    test('除数为零应抛出错误', () => {
      expect(() => G.divisible(1, 100, 0)).toThrow('Divisor cannot be zero.');
    });
  });

  describe('G.brackets - 括号序列生成', () => {
    test('应生成合法括号序列', () => {
      const n = 5;
      const result = G.brackets(n);
      expect(result.length).toBe(n * 2);
      // 验证括号匹配
      let count = 0;
      for (const c of result) {
        if (c === '(') count++;
        else if (c === ')') count--;
        expect(count).toBeGreaterThanOrEqual(0);
      }
      expect(count).toBe(0);
    });

    test('应支持多种括号类型', () => {
      const result = G.brackets(3, { types: '()[]' });
      expect(result.length).toBe(6);
      // 验证只包含指定类型
      for (const c of result) {
        expect('()[]').toContain(c);
      }
    });
  });

  describe('G.intervals - 区间列表生成', () => {
    test('应生成指定数量的区间', () => {
      const n = 5;
      const result = G.intervals(n, 1, 100);
      expect(result).toBeArrayOfSize(n);
      result.forEach(([l, r]) => {
        expect(l).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(100);
        expect(l).toBeLessThanOrEqual(r);
      });
    });

    test('应支持排序选项', () => {
      const result = G.intervals(5, 1, 100, { sorted: true });
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i][0]).toBeLessThanOrEqual(result[i + 1][0]);
      }
    });

    test('overlapping intervals should remain inside [min, max]', () => {
      const samples = G.intervals(20, 1, 5, { overlapping: true, minLen: 1, maxLen: 1 });
      samples.forEach(([l, r]) => {
        expect(l).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(5);
        expect(l).toBeLessThanOrEqual(r);
      });

      const single = G.intervals(1, 1, 1, { overlapping: true, minLen: 1, maxLen: 1 });
      expect(single).toEqual([[1, 1]]);
    });
  });

  describe('G.convexHull - 凸包点生成', () => {
    test('应生成指定数量的点', () => {
      const n = 10;
      const result = G.convexHull(n, -100, 100);
      expect(result).toBeArrayOfSize(n);
      result.forEach(([x, y]) => {
        expect(x).toBeGreaterThanOrEqual(-100);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(-100);
        expect(y).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('G.graph - 新图类型', () => {
    test('应生成轮图 (wheel)', () => {
      const n = 6;
      const graph = G.graph(n, 0, { type: 'wheel', oneBased: false });
      // 轮图边数 = 2(n-1): n-1条轮辐 + n-1条外环
      expect(graph.length).toBe(2 * (n - 1));
    });

    test('应生成完全图 (complete)', () => {
      const n = 5;
      const graph = G.graph(n, 0, { type: 'complete', oneBased: false });
      // 完全图边数 = n(n-1)/2
      expect(graph.length).toBe(n * (n - 1) / 2);
    });

    test('应生成带负权环的图', () => {
      const graph = G.graph(10, 15, { negativeCycle: true, weighted: [1, 100] });
      expect(graph.length).toBe(15);
      // 检查存在负权边
      const hasNegative = graph.some(e => e[2] < 0);
      expect(hasNegative).toBe(true);
    });

    test('directed negativeCycle should always create a real negative cycle', () => {
      const hasNegativeCycle = (n: number, edges: number[][]): boolean => {
        // Super-source trick: initialize all distances to 0 to detect cycles in any component.
        const dist = new Array(n).fill(0);

        for (let i = 0; i < n - 1; i++) {
          let updated = false;
          for (const [u, v, w] of edges) {
            const from = u - 1;
            const to = v - 1;
            if (dist[from] + w < dist[to]) {
              dist[to] = dist[from] + w;
              updated = true;
            }
          }
          if (!updated) break;
        }

        for (const [u, v, w] of edges) {
          const from = u - 1;
          const to = v - 1;
          if (dist[from] + w < dist[to]) return true;
        }
        return false;
      };

      for (let i = 0; i < 20; i++) {
        const edges = G.graph(8, 10, { directed: true, negativeCycle: true, weighted: [1, 10] });
        expect(hasNegativeCycle(8, edges)).toBe(true);
      }
    });

    test('轮图顶点数小于4应抛出错误', () => {
      expect(() => G.graph(3, 0, { type: 'wheel' })).toThrow(/at least 4 vertices/);
    });
  });

  describe('G.sequence - 数列生成', () => {
    test('应生成等差数列', () => {
      const result = G.sequence({ type: 'arithmetic', start: 1, diff: 2, count: 5 });
      expect(result).toEqual([1, 3, 5, 7, 9]);
    });

    test('应生成等比数列', () => {
      const result = G.sequence({ type: 'geometric', start: 2, ratio: 3, count: 4 });
      expect(result).toEqual([2, 6, 18, 54]);
    });

    test('应生成斐波那契数列', () => {
      const result = G.sequence({ type: 'fibonacci', count: 8 });
      expect(result).toEqual([1, 1, 2, 3, 5, 8, 13, 21]);
    });

    test('应生成自定义初值的斐波那契数列', () => {
      const result = G.sequence({ type: 'fibonacci', count: 5, first: 2, second: 3 });
      expect(result).toEqual([2, 3, 5, 8, 13]);
    });

    test('应生成自定义递推数列', () => {
      // a[n] = a[n-1] * 2 + 1
      const result = G.sequence({
        type: 'custom',
        init: [1],
        fn: (prev) => prev[prev.length - 1] * 2 + 1,
        count: 5
      });
      expect(result).toEqual([1, 3, 7, 15, 31]);
    });

    test('边界：斐波那契 count=0 应返回空数组', () => {
      expect(G.sequence({ type: 'fibonacci', count: 0 })).toEqual([]);
    });

    test('边界：斐波那契 count=1 应返回只有首项', () => {
      expect(G.sequence({ type: 'fibonacci', count: 1 })).toEqual([1]);
    });
  });

  describe('G.polygon - 简单多边形生成', () => {
    test('应生成 n 个顶点的多边形', () => {
      const n = 5;
      const result = G.polygon(n, -100, 100);
      expect(result).toBeArrayOfSize(n);
      result.forEach(([x, y]) => {
        expect(x).toBeGreaterThanOrEqual(-100);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(-100);
        expect(y).toBeLessThanOrEqual(100);
      });
    });

    test('n < 3 应返回点列表', () => {
      expect(G.polygon(2, 0, 10).length).toBe(2);
      expect(G.polygon(1, 0, 10).length).toBe(1);
    });
  });

  describe('G.binaryTree - 二叉树生成', () => {
    test('应生成随机二叉树', () => {
      const n = 10;
      const { edges, root } = G.binaryTree(n);
      expect(edges.length).toBe(n - 1);
      expect(root).toBe(1); // 默认 oneBased
    });

    test('应生成完全二叉树', () => {
      const n = 7;
      const { edges, root } = G.binaryTree(n, { type: 'complete', oneBased: false });
      expect(edges.length).toBe(n - 1);
      expect(root).toBe(0);
      // 完全二叉树的边数 = n - 1
    });

    test('应生成倾斜二叉树', () => {
      const n = 5;
      const { edges, root } = G.binaryTree(n, { type: 'skewed' });
      expect(edges.length).toBe(n - 1);
      expect(root).toBe(1);
    });

    test('n=0 应返回空边集', () => {
      const { edges, root } = G.binaryTree(0);
      expect(edges).toEqual([]);
      expect(root).toBe(1);
    });
  });

  // G.debug 主要用于控制台日志，直接测试其输出较为复杂且易碎。
  // 通常只需确保其不抛出错误，必要时可以 mock console.log。
  // 暂时跳过对 G.debug 的显式测试。
});

