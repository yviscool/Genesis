// src/language.ts
import path from 'node:path';

export interface LanguageInfo {
  id: string;
  name: string;
  extensions: string[];
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

export function detectLanguage(sourceFile: string): LanguageInfo | null {
  const extension = path.extname(sourceFile);
  if (!extension) return null;
  return LANGUAGES.find(lang => lang.extensions.includes(extension)) || null;
}
