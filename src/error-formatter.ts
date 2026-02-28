// src/error-formatter.ts
// Error formatting and runtime diagnostics.

import pc from 'picocolors';
import fs from 'node:fs';

const SIGNAL_EXPLANATIONS: Record<string, { name: string; desc: string; hint: string }> = {
  SIGSEGV: {
    name: 'Segmentation Fault',
    desc: 'The process accessed memory outside of its valid address space.',
    hint: 'Check array bounds, null pointers, and deep recursion stack usage.',
  },
  SIGFPE: {
    name: 'Floating Point Exception',
    desc: 'An invalid arithmetic operation occurred.',
    hint: 'Check division/modulo by zero and integer overflow conditions.',
  },
  SIGABRT: {
    name: 'Abort',
    desc: 'The process terminated itself via abort().',
    hint: 'Check failed assertions and runtime sanity checks.',
  },
  SIGKILL: {
    name: 'Killed',
    desc: 'The process was terminated by the operating system.',
    hint: 'This often indicates memory pressure or external termination.',
  },
  SIGBUS: {
    name: 'Bus Error',
    desc: 'The process made an invalid memory alignment or bus access.',
    hint: 'Check low-level pointer operations and memory layout assumptions.',
  },
  SIGILL: {
    name: 'Illegal Instruction',
    desc: 'The process executed an invalid CPU instruction.',
    hint: 'Check compiler flags, architecture mismatches, or memory corruption.',
  },
};

function appendSignalDiagnosis(lines: string[], signal: string): void {
  const info = SIGNAL_EXPLANATIONS[signal];
  if (!info) return;

  lines.push(pc.red(`[Signal] ${signal} (${info.name})`));
  lines.push(pc.dim(`  ${info.desc}`));
  lines.push(pc.yellow(`  Hint: ${info.hint}`));
  lines.push('');
}

export function formatRuntimeError(stderr: string, exitCode?: number): string {
  const lines: string[] = [];
  const detectedSignals = new Set<string>();
  const stderrLower = stderr.toLowerCase();

  for (const signal of Object.keys(SIGNAL_EXPLANATIONS)) {
    if (stderr.includes(signal) || stderrLower.includes(signal.toLowerCase())) {
      detectedSignals.add(signal);
      appendSignalDiagnosis(lines, signal);
    }
  }

  const signalFromExitCode = typeof exitCode === 'number' ? getSignalFromExitCode(exitCode) : null;
  if (signalFromExitCode && !detectedSignals.has(signalFromExitCode)) {
    appendSignalDiagnosis(lines, signalFromExitCode);
  }

  if (stderr.includes('out_of_range') || stderr.includes('vector::_M_range_check')) {
    lines.push(pc.red('Container out-of-range access detected.'));
    lines.push(pc.dim('  The process accessed a vector/array index outside valid bounds.'));
    lines.push(pc.yellow('  Hint: verify all index calculations and boundary checks.'));
    lines.push('');
  }

  if (stderr.includes('bad_alloc')) {
    lines.push(pc.red('Memory allocation failed.'));
    lines.push(pc.dim('  The process requested more memory than available.'));
    lines.push(pc.yellow('  Hint: review allocation size and possible unbounded growth.'));
    lines.push('');
  }

  if (stderr.includes('stack smashing') || stderr.includes('buffer overflow')) {
    lines.push(pc.red('Stack/buffer overflow detected.'));
    lines.push(pc.dim('  A write likely exceeded the allocated buffer boundary.'));
    lines.push(pc.yellow('  Hint: validate fixed-size buffer writes and local array bounds.'));
    lines.push('');
  }

  if (lines.length === 0 && stderr.trim()) {
    lines.push(pc.red('Error output:'));
    lines.push(pc.dim(stderr.trim()));
  }

  if (lines.length === 0 && typeof exitCode === 'number') {
    lines.push(pc.red(`Process exited with code ${exitCode}.`));
  }

  return lines.join('\n');
}

export function formatCompilerError(stderr: string, sourceFile?: string): string {
  const lines: string[] = [];

  const errorPattern = /^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  const errors: Array<{ file: string; line: number; col: number; type: string; message: string }> = [];

  while ((match = errorPattern.exec(stderr)) !== null) {
    errors.push({
      file: match[1],
      line: Number.parseInt(match[2], 10),
      col: Number.parseInt(match[3], 10),
      type: match[4],
      message: match[5],
    });
  }

  if (errors.length === 0) {
    return stderr;
  }

  for (const error of errors) {
    const tag = error.type === 'error' ? '[ERROR]' : '[WARN]';
    const color = error.type === 'error' ? pc.red : pc.yellow;

    lines.push(color(`${tag} ${error.file}:${error.line}:${error.col}`));
    lines.push(`  ${error.message}`);

    const targetFile = sourceFile || error.file;
    if (fs.existsSync(targetFile)) {
      try {
        const content = fs.readFileSync(targetFile, 'utf-8');
        const sourceLines = content.split('\n');
        const errorLine = sourceLines[error.line - 1];

        if (errorLine) {
          lines.push('');
          lines.push(pc.dim(`  ${error.line} | `) + errorLine);
          const pointer = ' '.repeat(Math.max(0, error.col - 1)) + pc.red('^');
          lines.push(pc.dim('    | ') + pointer);
        }
      } catch {
        // Ignore source preview failures.
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function getSignalFromExitCode(exitCode: number): string | null {
  if (exitCode > 128) {
    const signalNum = exitCode - 128;
    const signalMap: Record<number, string> = {
      4: 'SIGILL',
      6: 'SIGABRT',
      7: 'SIGBUS',
      8: 'SIGFPE',
      9: 'SIGKILL',
      11: 'SIGSEGV',
    };
    return signalMap[signalNum] || null;
  }
  return null;
}
