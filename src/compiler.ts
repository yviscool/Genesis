// src/compiler.ts
import { execaCommand } from 'execa';
import { green } from 'picocolors'; // 使用颜色库让命令更醒目

/**
 * 为支持的编译器预设优化的编译参数。
 * 我们为 clang++ 添加了 -Wno-unused-result，这是一个常见的、在竞赛代码中可以忽略的警告。
 */
export const DEFAULT_COMPILER_CONFIGS = {
  'g++': {
    flags: ['-O2', '-std=c++17', '-Wall'],
  },
  'clang++': {
    flags: ['-O2', '-std=c++17', '-Wall', '-Wno-unused-result'],
  },
};

// 探测顺序
const COMPILERS_TO_CHECK = ['g++', 'clang++'] as const;

/**
 * 探测系统中可用的 C++ 编译器。
 * @returns 返回找到的编译器命令，如 'g++' 或 'clang++'，如果都找不到则返回 null。
 */
export async function findSystemCompiler(): Promise<'g++' | 'clang++' | null> {
  for (const cmd of COMPILERS_TO_CHECK) {
    try {
      // 通过执行 --version 来检查命令是否存在且可用
      // stdio: 'ignore' 会抑制所有输出，我们只关心它是否成功
      await execaCommand(`${cmd} --version`, { stdio: 'ignore' });
      return cmd; // 找到了，立即返回
    } catch {
      // 命令不存在或执行失败，继续尝试下一个
    }
  }
  return null; // 遍历完都没找到
}

/**
 * 根据当前操作系统，生成人性化的编译器安装指南。
 */
export function getCompilerHelpMessage(): string {
  const platform = process.platform;
  let message = 'No C++ compiler found (g++ or clang++). Please install one and ensure it is in your system PATH.\n';

  switch (platform) {
    case 'win32':
      message += `On Windows, we recommend installing MinGW-w64 via MSYS2. Follow these steps:\n`;
      message += `  1. Install MSYS2 from https://www.msys2.org/\n`;
      message += `  2. Open the MSYS2 terminal and run: ${green('pacman -S --needed base-devel mingw-w64-ucrt-x86_64-toolchain')}\n`;
      message += `  3. Add the compiler's bin directory to your system's PATH (e.g., C:\\msys64\\ucrt64\\bin).`;
      break;
    case 'darwin': // macOS
      message += `On macOS, you can install Clang by installing the Xcode Command Line Tools. Run this command in your terminal:\n`;
      message += `  ${green('xcode-select --install')}`;
      break;
    case 'linux':
      message += `On Debian/Ubuntu-based Linux, run:\n`;
      message += `  ${green('sudo apt update && sudo apt install build-essential')}\n`;
      message += `On Fedora/CentOS-based Linux, run:\n`;
      message += `  ${green('sudo dnf groupinstall "Development Tools"')}`;
      break;
    default:
      message += 'Please consult your operating system\'s documentation for instructions on installing a C++ compiler.';
  }
  return message;
}