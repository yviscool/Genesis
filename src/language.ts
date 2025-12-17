// src/language.ts
import path from 'node:path';

/**
 * 编程语言信息接口。
 */
export interface LanguageInfo {
  /** 语言唯一标识符 (例如 'cpp', 'python')。 */
  id: string;
  /** 语言显示名称。 */
  name: string;
  /** 支持的文件扩展名列表。 */
  extensions: string[];
  /** 语言类型：编译型 ('compiled') 或 解释型 ('interpreted')。 */
  type: 'compiled' | 'interpreted';
}

const LANGUAGES: LanguageInfo[] = [
  { id: 'cpp', name: 'C++', extensions: ['.cpp', '.cc', '.cxx'], type: 'compiled' },
  { id: 'go', name: 'Go', extensions: ['.go'], type: 'compiled' },
  { id: 'rust', name: 'Rust', extensions: ['.rs'], type: 'compiled' },
  { id: 'java', name: 'Java', extensions: ['.java'], type: 'compiled' },
  { id: 'python', name: 'Python', extensions: ['.py'], type: 'interpreted' },
  { id: 'javascript', name: 'JavaScript', extensions: ['.js'], type: 'interpreted' },
  { id: 'typescript', name: 'TypeScript', extensions: ['.ts'], type: 'interpreted' },
];

/**
 * 根据源文件扩展名检测编程语言。
 * @param sourceFile 源文件路径。
 * @returns {LanguageInfo | null} 匹配的语言信息，如果未找到则返回 null。
 */
export function detectLanguage(sourceFile: string): LanguageInfo | null {
  const extension = path.extname(sourceFile);
  if (!extension) return null;
  return LANGUAGES.find(lang => lang.extensions.includes(extension)) || null;
}
