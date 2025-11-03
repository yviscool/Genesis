// src/differ.ts

import { type CompareMode } from './types';

/**
 * 规范化输出字符串以进行比较。
 * - 替换 CRLF 为 LF
 * - 按行分割
 * - 移除所有空行
 * - 裁剪每行末尾的空白
 * @param text - 原始输出文本
 * @returns {string[]} - 处理后的行数组
 */
function normalizeOutput(text: string): string[] {
  if (!text) {
    return [];
  }
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(line => line !== '')
    .map(line => line.trimEnd());
}

/**
 * 对比两个输出字符串。
 * @param stdOut - 标准输出
 * @param myOut - 你的输出
 * @param mode - 对比模式 ('exact' 或 'normalized')
 * @returns {boolean} - 如果输出匹配则返回 true
 */
export function compareOutputs(stdOut: string, myOut: string, mode: CompareMode): boolean {
  if (mode === 'exact') {
    return stdOut === myOut;
  }

  // 'normalized' mode
  const stdLines = normalizeOutput(stdOut);
  const myLines = normalizeOutput(myOut);

  if (stdLines.length !== myLines.length) {
    return false;
  }

  for (let i = 0; i < stdLines.length; i++) {
    if (stdLines[i] !== myLines[i]) {
      return false;
    }
  }

  return true;
}
