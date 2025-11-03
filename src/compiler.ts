// src/compiler.ts
import { execaCommand } from 'execa';
import { green } from 'picocolors';
import { t } from './i18n';

/**
 * Pre-configured optimized compilation flags for supported compilers.
 * We add -Wno-unused-result for clang++ to suppress a common warning in competitive programming code.
 */
export const DEFAULT_COMPILER_CONFIGS = {
  'g++': {
    flags: ['-O2', '-std=c++17', '-Wall'],
  },
  'clang++': {
    flags: ['-O2', '-std=c++17', '-Wall', '-Wno-unused-result'],
  },
};

// Order of compilers to check for
const COMPILERS_TO_CHECK = ['g++', 'clang++'] as const;

/**
 * Detects available C++ compilers on the system.
 * @returns The command for a found compiler (e.g., 'g++' or 'clang++'), or null if none are found.
 */
export async function findSystemCompiler(): Promise<'g++' | 'clang++' | null> {
  for (const cmd of COMPILERS_TO_CHECK) {
    try {
      // Check if the command exists and is executable by running --version
      // stdio: 'ignore' suppresses all output; we only care about success
      await execaCommand(`${cmd} --version`, { stdio: 'ignore' });
      return cmd; // Found, return immediately
    } catch {
      // Command doesn't exist or failed, try the next one
    }
  }
  return null; // None found after checking all
}

/**
 * Generates a user-friendly guide for installing a C++ compiler based on the current OS.
 */
export function getCompilerHelpMessage(): string {
  const platform = process.platform;
  let message = t('compiler.notFound') + '\n';

  switch (platform) {
    case 'win32':
      message += t('compiler.installGuide.windows', green('pacman -S --needed base-devel mingw-w64-ucrt-x86_64-toolchain'));
      break;
    case 'darwin': // macOS
      message += t('compiler.installGuide.macos', green('xcode-select --install'));
      break;
    case 'linux':
      message += t('compiler.installGuide.linux.debian', green('sudo apt update && sudo apt install build-essential'));
      message += '\n' + t('compiler.installGuide.linux.fedora', green('sudo dnf groupinstall "Development Tools"'));
      break;
    default:
      message += t('compiler.installGuide.default');
  }
  return message;
}