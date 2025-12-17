// src/formatter.ts

/**
 * 格式化任意数据为字符串。
 * 用于将生成器产生的复杂对象（数组、矩阵等）转换为可用于输入的文本格式。
 *
 * @param data - 要格式化的原始数据。
 * @returns {string} - 格式化后的字符串。
 */
export function formatData(data: any): string {
  if (data === null || data === undefined) {
    return '';
  }

  // 1. 数组处理
  if (Array.isArray(data)) {
    // 1.1 二维数组 (矩阵)
    if (data.length > 0 && Array.isArray(data[0])) {
      return data.map(row => (row as any[]).join(' ')).join('\n');
    }
    // 1.2 一维数组
    return data.join(' ');
  }

  // 2. 对象处理 (尝试转换为 JSON 或 toString)
  if (typeof data === 'object') {
    // 简单的对象通常不是合法的算法题输入，但在某些特殊情况下可能需要。
    // 这里我们简单地调用 toString，除非它就是 [object Object]
    const str = data.toString();
    if (str === '[object Object]') {
        return JSON.stringify(data);
    }
    return str;
  }

  // 3. 基础类型 (number, string, boolean 等)
  return String(data);
}
