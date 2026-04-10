import { describe, expect, test } from 'bun:test';
import { detectLanguage } from '../src/language';
import { buildCompilationFingerprint, buildCompilerFlags, splitCommandString } from '../src/execution';

const cpp = detectLanguage('main.cpp');

if (!cpp) {
  throw new Error('Failed to load C++ language metadata for tests.');
}

describe('execution compiler normalization', () => {
  test('adds a Linux-compatible stack flag for Windows C++ toolchains', () => {
    const flags = buildCompilerFlags(cpp, 'g++', [], [], { platform: 'win32' });

    expect(flags).toContain('-Wl,--stack,16777216');
  });

  test('does not add a duplicate stack flag when the user already sets one', () => {
    const flags = buildCompilerFlags(cpp, 'g++', [], ['-Wl,--stack,33554432'], { platform: 'win32' });

    expect(flags.filter(flag => flag.includes('--stack')).length).toBe(1);
    expect(flags).toContain('-Wl,--stack,33554432');
  });

  test('treats inline compiler parameters as part of the compiler invocation', () => {
    const parts = splitCommandString('g++ -Wl,--stack,33554432');
    const flags = buildCompilerFlags(cpp, parts[0], parts.slice(1), [], { platform: 'win32' });

    expect(parts).toEqual(['g++', '-Wl,--stack,33554432']);
    expect(flags.some(flag => flag.includes('--stack'))).toBe(false);
  });

  test('parses quoted compiler paths with spaces', () => {
    const parts = splitCommandString('"C:/Program Files/LLVM/bin/clang++.exe" -std=c++20');

    expect(parts).toEqual([
      'C:/Program Files/LLVM/bin/clang++.exe',
      '-std=c++20',
    ]);
  });

  test('does not inject a Windows stack flag on non-Windows platforms', () => {
    const flags = buildCompilerFlags(cpp, 'g++', [], [], { platform: 'linux' });

    expect(flags.some(flag => flag.includes('--stack'))).toBe(false);
  });

  test('supports MSVC-style stack flags on Windows', () => {
    const flags = buildCompilerFlags(cpp, 'cl', [], [], { platform: 'win32' });

    expect(flags).toContain('/link');
    expect(flags).toContain('/STACK:16777216');
  });

  test('allows disabling automatic stack tuning with ojProfile none', () => {
    const flags = buildCompilerFlags(cpp, 'g++', [], [], { platform: 'win32', ojProfile: 'none' });

    expect(flags.some(flag => flag.includes('--stack'))).toBe(false);
  });

  test('cache fingerprint changes with compiler environment', () => {
    const fingerprintA = buildCompilationFingerprint(
      'int main(){}',
      { command: 'g++', inlineFlags: [], displayName: 'g++' },
      ['-O2'],
      { compilerVersion: '13.2.0', platform: 'linux', arch: 'x64' },
    );
    const fingerprintB = buildCompilationFingerprint(
      'int main(){}',
      { command: 'g++', inlineFlags: [], displayName: 'g++' },
      ['-O2'],
      { compilerVersion: '14.1.0', platform: 'linux', arch: 'x64' },
    );

    expect(fingerprintA).not.toBe(fingerprintB);
  });
});
