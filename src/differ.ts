// src/differ.ts

import { type CompareMode } from './types';

/**
 * Normalizes an output string for comparison.
 * - Replaces CRLF with LF
 * - Splits into lines
 * - Removes all blank lines
 * - Trims trailing whitespace from each line
 * @param text - The raw output text.
 * @returns {string[]} - An array of processed lines.
 */
function normalizeOutput(text: string): string[] {
  if (!text) {
    return [];
  }
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(line => line !== '')
    .map(line => line.trimEnd());
}

/**
 * Compares two output strings.
 * @param stdOut - The standard output.
 * @param myOut - Your output.
 * @param mode - The comparison mode ('exact' or 'normalized').
 * @returns {boolean} - True if the outputs match.
 */
export function compareOutputs(stdOut: string, myOut: string, mode: CompareMode): boolean {
  if (mode === 'exact') {
    return stdOut === myOut;
  }

  // 'normalized' mode
  const stdLines = normalizeOutput(stdOut);
  const myLines = normalizeOutput(myOut);

  if (stdLines.length !== myLines.length) {
    return false;
  }

  for (let i = 0; i < stdLines.length; i++) {
    if (stdLines[i] !== myLines[i]) {
      return false;
    }
  }

  return true;
}
