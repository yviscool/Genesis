import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM-compatible equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Locale = 'en' | 'zh';

let translations: Record<string, string> = {};

function getSystemLocale(): Locale {
  // Prioritize environment variables, which are more reliable in different runtimes.
  const lang = process.env.LANG || process.env.LC_MESSAGES || process.env.LC_ALL;
  if (lang && lang.toLowerCase().startsWith('zh')) {
    return 'zh';
  }

  // Fallback to Intl API
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
    // Fallback to English if loading fails
    if (locale !== 'en') {
      loadTranslations('en');
    }
  }
}

export function t(key: string, ...args: (string | number)[]): string {
  let message = translations[key] || key;
  args.forEach((arg, index) => {
    message = message.replace(`{${index}}`, String(arg));
  });
  return message;
}

const currentLocale = getSystemLocale();
loadTranslations(currentLocale);
