// src/formatter.ts

/**
 * Formats a single item into a single-line string.
 * - If the item is an array (e.g., [3, 5]), it joins all elements with a space, becoming "3 5".
 * - Otherwise (e.g., a number 5), it converts it directly to a string "5".
 * @param item - Any data item.
 * @returns {string} - A string representing a single line.
 */
function formatLine(item: any): string {
  if (Array.isArray(item)) {
    return item.join(' ');
  }
  return String(item);
}

/**
 * (Final version) Intelligently formats any structured data returned by a generator
 * into the input string required for competitive programming problems.
 *
 * @param data Any structured data, such as numbers, strings, or their nested arrays.
 * @returns {string} The formatted string that can be written to an .in file.
 */
export function formatData(data: any): string {
  if (data === undefined || data === null) {
    return '';
  }

  // If the top level is not an array, format it directly as a single line.
  if (!Array.isArray(data)) {
    return formatLine(data);
  }

  const lines: string[] = [];
  for (const item of data) {
    // --- Core Smart-Decision Logic ---
    // This if/else if/else structure ensures we can distinguish three core cases:
    // 1. A matrix (2D array)
    // 2. An array of strings (pre-formatted lines)
    // 3. All other cases (should be treated as a single line)

    // Case 1: If an element is a [2D array] (matrix), e.g., [[1,0], [0,1]]
    if (Array.isArray(item) && item.length > 0 && Array.isArray(item[0])) {
      // Iterate over each row of this matrix...
      for (const row of item) {
        // ...format each row into a single-line string and add it to the final result.
        lines.push(formatLine(row));
      }
    }
    // Case 2: If an element is a [1D array of strings], e.g., ['...', '...']
    // This means the user has already prepared each line for us.
    else if (Array.isArray(item) && item.length > 0 && typeof item[0] === 'string') {
      // Directly expand these strings as separate lines.
      lines.push(...item);
    }
    // Case 3: All other cases, including [n, m], a single number, or an empty array.
    // These should all be treated as [single-line] content.
    else {
      lines.push(formatLine(item));
    }
  }

  return lines.join('\n');
}