// examples/make.ts
import { Maker, G } from '../src/index';


await Maker
  .configure({
    solution: 'examples/std.cpp', 
    // 我们把起始编号设为 101，来测试这个配置是否生效
    // startFrom: 101, 
  })
  
.case('Map Problem', () => {
  const n = 5, m = 5;
  const grid = G.matrix(n, m, () => G.int(0, 1)); // grid 是一个数字矩阵，如 [[0,1],[1,0]]

  // 这是错误的！因为 grid 不是字符串数组，会被格式化为多行 "0 1"
  return [ [n, m], grid ];

  // 正确的做法: 先将 grid 的每一行转换为字符串
  const stringGrid = grid.map(row => row.join(' '));
  // stringGrid 是一个字符串数组, 如 ["0 1", "1 0"]

  return [
    [n, m],     // -> "5 5"
    stringGrid  // -> "0 1\n1 0"
  ];
})
  /**
   * Case 2: 小数据 - 完全没有杂物
   * 目的: 最简单的情况，答案应该是 n * m。
   */
  .case('Small - No Debris', () => {
    const n = 10, m = 10;
    const grid = G.matrix(n, m, () => '.').map(row => row.join(''));
    return [
      [n, m],
      grid
    ];
  })

  /**
   * Case 3: 小数据 - 全是杂物
   * 目的: 测试移除一个杂物后的情况。答案应该是 1 (如果 n,m > 2)。
   */
  .case('Small - All Debris', () => {
    const n = 8, m = 8;
    const grid = G.matrix(n, m, () => '#').map(row => row.join(''));
    return [
      `${n} ${m}`,
      ...grid
    ];
  })

  /**
   * Case 4: 边界 - 只有一行
   * 目的: 测试 n=1 的情况，此时不存在上下相邻。
   */
  .case('Edge - Single Row', () => {
    const n = 1, m = 100;
    const grid = [G.string(m, '.#')]; // 随机生成一行
    return [
      `${n} ${m}`,
      ...grid
    ];
  })

  /**
   * Case 5: 边界 - 只有一列
   * 目的: 测试 m=1 的情况，此时不存在左右相邻。
   */
  .case('Edge - Single Column', () => {
    const n = 100, m = 1;
    // G.array() 生成一维数组，每个元素是一个字符
    const grid = G.array(n, () => G.sample(['.', '#'], 1)[0]);
    return [
      `${n} ${m}`,
      ...grid
    ];
  })

  /**
   * Case 6: 随机中等数据
   * 目的: 检查常规情况下的正确性。
   */
  .case('Random - Medium', () => {
    const n = 50, m = 50;
    // 使用 G.matrix 快速生成二维网格，30% 的概率为杂物
    const grid = G.matrix(n, m, () => Math.random() < 0.3 ? '#' : '.').map(row => row.join(''));
    return [
      `${n} ${m}`,
      ...grid
    ];
  })

  /**
   * Case 7: 特殊构造 - 移除中心杂物收益最大
   * 目的: 构造一个场景，只有移除特定的一个杂物才能获得最优解。
   */
  .case('Constructed - Max Gain', () => {
    const n = 100, m = 100;
    const grid = G.matrix(n, m, (r, c) => {
      // 在中心 3x3 区域放置杂物，其余都是荒地
      if (r >= 48 && r <= 50 && c >= 48 && c <= 50) {
        return '#';
      }
      return '.';
    }).map(row => row.join(''));
    return [
      `${n} ${m}`,
      ...grid
    ];
  })

  /**
   * Case 8: 特殊构造 - 棋盘格
   * 目的: 测试杂物和荒地交错分布的复杂情况。
   */
  .case('Constructed - Checkerboard', () => {
    const n = 100, m = 100;
    const grid = G.matrix(n, m, (r, c) => (r + c) % 2 === 0 ? '#' : '.').map(row => row.join(''));
    return [
      `${n} ${m}`,
      ...grid
    ];
  })

  /**
   * Case 9: 极限数据 - 稀疏杂物
   * 目的: 测试 n, m 达到最大值时的性能，且杂物较少。
   */
  .case('Max Data - Sparse Debris', () => {
    const n = 1000, m = 1000;
    // 只有 1% 的概率是杂物
    const grid = G.matrix(n, m, () => Math.random() < 0.01 ? '#' : '.').map(row => row.join(''));
    return [
      `${n} ${m}`,
      ...grid
    ];
  })

  /**
   * Case 10: 极限数据 - 密集杂物
   * 目的: 测试 n, m 达到最大值时的性能，且杂物较多。
   */
  .case('Max Data - Dense Debris', () => {
    const n = 1000, m = 1000;
    // 80% 的概率是杂物
    const grid = G.matrix(n, m, () => Math.random() < 0.8 ? '#' : '.').map(row => row.join(''));
    return [
      `${n} ${m}`,
      ...grid
    ];
  })
  
  // 启动生成流程
  .generate();