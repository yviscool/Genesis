// src/formatter.ts

function formatLine(item: any): string {
  if (Array.isArray(item)) {
    // 子数组用空格连接
    return item.join(' ');
  }
  // 其他类型直接转字符串
  return String(item);
}

/**
 * 将生成器返回的结构化数据智能格式化为输入字符串。
 * @param data 任意结构化数据
 * @returns 格式化后的字符串
 */
export function formatData(data: any): string {
  if (data === undefined || data === null) {
    return '';
  }
  
  // 如果顶层不是数组，直接格式化
  if (!Array.isArray(data)) {
    return formatLine(data);
  }
  
  // 如果顶层是数组，每个元素为一行
  return data.map(formatLine).join('\n');
}