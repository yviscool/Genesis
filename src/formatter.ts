// src/formatter.ts

/**
 * 将单个项目格式化为单行字符串。
 * - 如果项目是数组 (如 [3, 5])，用空格连接所有元素，变为 "3 5"。
 * - 否则 (如数字 5)，直接转换为字符串 "5"。
 * @param item - 任何数据项
 * @returns {string} - 代表单行的字符串
 */
function formatLine(item: any): string {
  if (Array.isArray(item)) {
    return item.join(' ');
  }
  return String(item);
}

/**
 * (最终决定版) 将生成器返回的任意结构化数据智能格式化为竞赛题目所需的输入字符串。
 *
 * @param data 任何结构化数据，例如数字、字符串、或它们的嵌套数组。
 * @returns {string} 格式化后的、可以写入 .in 文件的字符串。
 */
export function formatData(data: any): string {
  if (data === undefined || data === null) {
    return '';
  }

  // 如果顶层不是数组，直接格式化为单行
  if (!Array.isArray(data)) {
    return formatLine(data);
  }

  const lines: string[] = [];
  for (const item of data) {
    // --- 核心智能判断逻辑 ---
    // 这个 if/else if/else 结构确保我们能区分三种核心情况：
    // 1. 矩阵 (二维数组)
    // 2. 字符串数组 (预格式化的行)
    // 3. 其他所有情况 (应被视为单行)

    // 情况1: 如果一个元素是【二维数组】(矩阵), 例如 [[1,0], [0,1]]
    if (Array.isArray(item) && item.length > 0 && Array.isArray(item[0])) {
      // 遍历这个矩阵的每一行...
      for (const row of item) {
        // ...将每一行都格式化为单行字符串，并添加到最终结果中。
        lines.push(formatLine(row));
      }
    }
    // 情况2: 如果一个元素是【一维的字符串数组】, 例如 ['...', '...']
    // 这意味着用户已经为我们准备好了每一行。
    else if (Array.isArray(item) && item.length > 0 && typeof item[0] === 'string') {
      // 直接将这些字符串作为独立的行展开。
      lines.push(...item);
    }
    // 情况3: 其他所有情况，包括 [n, m], 单个数字, 或空数组。
    // 这些都应该被视为【单行】内容。
    else {
      lines.push(formatLine(item));
    }
  }

  return lines.join('\n');
}