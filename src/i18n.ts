import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM 环境下模拟 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Locale = 'en' | 'zh';

let translations: Record<string, string> = {};

function getSystemLocale(): Locale {
  // 优先使用环境变量，因为它们在不同运行时中更可靠
  const lang = process.env.LANG || process.env.LC_MESSAGES || process.env.LC_ALL;
  if (lang && lang.toLowerCase().startsWith('zh')) {
    return 'zh';
  }

  // 回退到 Intl API
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  if (locale.startsWith('zh')) {
    return 'zh';
  }

  return 'en';
}

function loadTranslations(locale: Locale) {
  const filePath = path.join(__dirname, 'locales', `${locale}.json`);
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    translations = JSON.parse(fileContent);
  } catch (error) {
    console.error(`Failed to load translations for locale: ${locale}`, error);
    // 如果加载失败，回退到英语
    if (locale !== 'en') {
      loadTranslations('en');
    }
  }
}

/**
 * 翻译函数。
 * 根据当前语言环境获取键对应的翻译文本，并支持参数替换。
 * @param key 翻译键。
 * @param args 替换参数。
 * @returns 翻译后的字符串。
 */
export function t(key: string, ...args: (string | number)[]): string {
  let message = translations[key] || key;
  args.forEach((arg, index) => {
    message = message.replace(`{${index}}`, String(arg));
  });
  return message;
}

const currentLocale = getSystemLocale();
loadTranslations(currentLocale);
