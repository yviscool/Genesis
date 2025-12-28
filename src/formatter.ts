// src/formatter.ts

/**
 * 格式化返回值为输入文件内容。
 * 
 * ## 核心规则（无歧义版）
 * 
 * 顶层数组的每个元素代表一行：
 * ```
 * return [元素1, 元素2, ..., 元素N]
 *        ↓       ↓           ↓
 *        行1     行2         行N
 * ```
 * 
 * 每个元素的转换规则：
 * - 单值 (number/string/boolean) → 直接转字符串
 * - 一维数组 → 空格拼接为一行
 * - 二维数组 → 展开为多行（每个子数组空格拼接）
 * 
 * ## 示例
 * 
 * ```typescript
 * return [5, 3, [1, 2, 3]]     // → "5\n3\n1 2 3"
 * return [[n, m], grid]        // grid 是二维数组，会展开
 * return [[1,2,3]]             // → "1 2 3" (一行三个数)
 * return [1, 2, 3]             // → "1\n2\n3" (三行)
 * return ['.##.', '#..#']      // → ".##.\n#..#" (两行字符串)
 * ```
 *
 * @param data - 生成器函数的返回值
 * @returns 格式化后的字符串，可直接写入 .in 文件
 */
export function formatData(data: any): string {
  // 非数组：直接转字符串（边界情况）
  if (!Array.isArray(data)) {
    return data == null ? '' : String(data);
  }

  const lines: string[] = [];

  for (const element of data) {
    if (element == null) {
      // null/undefined → 空行
      lines.push('');
    } else if (Array.isArray(element)) {
      // 检查是否为二维数组
      if (element.length > 0 && Array.isArray(element[0])) {
        // 二维数组：展开为多行
        for (const row of element) {
          lines.push((row as any[]).join(' '));
        }
      } else {
        // 一维数组：空格拼接为一行
        lines.push(element.join(' '));
      }
    } else {
      // 单值：直接转字符串
      lines.push(String(element));
    }
  }

  return lines.join('\n');
}
