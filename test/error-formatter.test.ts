import { describe, test, expect } from 'bun:test';
import { formatRuntimeError, getSignalFromExitCode } from '../src/error-formatter';

describe('error formatter signal fallback', () => {
  test('maps Unix-style exit code to signal name', () => {
    expect(getSignalFromExitCode(139)).toBe('SIGSEGV');
  });

  test('reports signal diagnosis when stderr is empty but exit code indicates a signal', () => {
    const output = formatRuntimeError('', 139);
    expect(output).toContain('Segmentation Fault');
  });
});
