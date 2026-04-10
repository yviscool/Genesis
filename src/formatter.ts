import crypto from 'node:crypto';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';

export interface WrittenFormattedData {
  bytesWritten: number;
  lineCount: number;
  sha256: string;
}

export class FormattedDataWriteError extends Error {
  kind: 'formatter' | 'io';

  constructor(kind: 'formatter' | 'io', message: string, cause?: unknown) {
    super(message);
    this.name = 'FormattedDataWriteError';
    this.kind = kind;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export function formatData(data: any): string {
  return Array.from(iterateFormattedLines(data)).join('\n');
}

export async function writeFormattedData(filePath: string, data: any): Promise<WrittenFormattedData> {
  const output = createWriteStream(filePath, { encoding: 'utf8' });
  const hash = crypto.createHash('sha256');
  let bytesWritten = 0;
  let lineCount = 0;
  let firstLine = true;

  const writeChunk = async (chunk: string): Promise<void> => {
    if (chunk.length === 0) {
      return;
    }

    bytesWritten += Buffer.byteLength(chunk);
    hash.update(chunk, 'utf8');
    if (!output.write(chunk)) {
      await once(output, 'drain');
    }
  };

  try {
    for (const line of iterateFormattedLines(data)) {
      const chunk = firstLine ? line : `\n${line}`;
      firstLine = false;
      lineCount++;
      await writeChunk(chunk);
    }
  } catch (error) {
    output.destroy();
    throw new FormattedDataWriteError(classifyWriteError(error), getErrorMessage(error), error);
  }

  output.end();

  try {
    await finished(output);
  } catch (error) {
    throw new FormattedDataWriteError('io', getErrorMessage(error), error);
  }

  return {
    bytesWritten,
    lineCount,
    sha256: hash.digest('hex'),
  };
}

function* iterateFormattedLines(data: any): Generator<string> {
  if (!Array.isArray(data)) {
    yield data == null ? '' : String(data);
    return;
  }

  for (const element of data) {
    yield* iterateFormattedElement(element);
  }
}

function* iterateFormattedElement(element: any): Generator<string> {
  if (element == null) {
    yield '';
    return;
  }

  if (!Array.isArray(element)) {
    yield String(element);
    return;
  }

  const is2DArray = element.some(sub => Array.isArray(sub));
  if (!is2DArray) {
    yield element.join(' ');
    return;
  }

  for (const row of element) {
    if (Array.isArray(row)) {
      yield row.join(' ');
    } else if (row != null) {
      yield String(row);
    } else {
      yield '';
    }
  }
}

function classifyWriteError(error: unknown): 'formatter' | 'io' {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return 'io';
  }

  return 'formatter';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}
