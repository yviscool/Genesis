export type FormatAtom = string | number | bigint | boolean | null | undefined;

export interface FormatLine {
  readonly kind: 'line';
  readonly items: readonly FormatAtom[];
  /** Separator between atoms. Defaults to a single space. */
  readonly sep?: string;
}

export interface FormatTable {
  readonly kind: 'table';
  readonly rows: readonly (readonly FormatAtom[])[];
  /** Separator between atoms inside a row. Defaults to a single space. */
  readonly sep?: string;
  /** Separator between rows. Defaults to a newline. */
  readonly rowSep?: string;
}

export interface FormatGrid {
  readonly kind: 'grid';
  readonly rows: readonly (string | readonly FormatAtom[])[];
}

export interface FormatRaw {
  readonly kind: 'raw';
  readonly text: string;
}

/**
 * Ordered list of nodes joined by an arbitrary separator.
 *
 * This is the piece v2 was missing: `fmt.lines` can only join with `\n`, so
 * problems that need a blank line between records (multi-test inputs, block
 * output) had no way to express it and fell back to hand-built strings.
 */
export interface FormatSeq {
  readonly kind: 'seq';
  readonly nodes: readonly FormatNode[];
  readonly sep: string;
}

export type FormatNode = FormatLine | FormatTable | FormatGrid | FormatRaw | FormatSeq;

export interface FormatDocument {
  readonly __genesisFormat: 2;
  readonly nodes: readonly FormatNode[];
}

export interface FormatTableOptions {
  sep?: string;
  rowSep?: string;
}

export interface FormatRowsOptions extends FormatTableOptions {
  /** Optional header line rendered before the rows. */
  header?: readonly FormatAtom[];
}

export const fmt = {
  line(...items: FormatAtom[]): FormatLine {
    return { kind: 'line', items };
  },

  lines(...rows: (FormatNode | readonly FormatAtom[] | FormatAtom)[]): FormatDocument {
    return createFormatDocument(rows.map(row => normalizeRow(row)));
  },

  table(rows: readonly (readonly FormatAtom[])[], options?: FormatTableOptions): FormatTable {
    const node: { kind: 'table'; rows: readonly (readonly FormatAtom[])[]; sep?: string; rowSep?: string } = { kind: 'table', rows };
    if (options?.sep !== undefined) node.sep = options.sep;
    if (options?.rowSep !== undefined) node.rowSep = options.rowSep;
    return node;
  },

  grid(rows: readonly (string | readonly FormatAtom[])[]): FormatGrid {
    return { kind: 'grid', rows };
  },

  raw(text: string): FormatRaw {
    return { kind: 'raw', text };
  },

  /** Join atoms with a custom separator, e.g. `fmt.join('', '(', a, ',', b, ')')`. */
  join(sep: string, ...items: FormatAtom[]): FormatLine {
    return { kind: 'line', items, sep };
  },

  /** One line holding every value, space separated: `n` then the whole array. */
  flat(values: readonly FormatAtom[]): FormatLine {
    return { kind: 'line', items: values };
  },

  /** Parenthesised tuple without spaces, e.g. `(3,1)`. */
  tuple(...items: FormatAtom[]): FormatLine {
    return { kind: 'line', items: ['(', ...joinWithCommas(items), ')'], sep: '' };
  },

  /** Join nodes with a custom separator. Use `'\n\n'` for a blank line between records. */
  seq(nodes: readonly FormatNode[], sep = '\n'): FormatSeq {
    return { kind: 'seq', nodes, sep };
  },

  /** Consecutive blocks separated by one blank line. */
  block(...nodes: FormatNode[]): FormatSeq {
    return { kind: 'seq', nodes, sep: '\n\n' };
  },

  /**
   * Header line plus a matrix of rows — the single most common input shape.
   *
   * ```ts
   * format: ({ n, edges }) => fmt.rows(edges, { header: [n, edges.length] })
   * ```
   */
  rows(rows: readonly (readonly FormatAtom[])[], options?: FormatRowsOptions): FormatNode {
    const table = fmt.table(rows, options);
    if (!options?.header) return table;
    return { kind: 'seq', nodes: [fmt.line(...options.header), table], sep: '\n' };
  },
} as const;

function joinWithCommas(items: readonly FormatAtom[]): FormatAtom[] {
  const out: FormatAtom[] = [];
  for (let index = 0; index < items.length; index += 1) {
    if (index > 0) out.push(',');
    out.push(items[index]);
  }
  return out;
}

export function createFormatDocument(nodes: readonly FormatNode[]): FormatDocument {
  return { __genesisFormat: 2, nodes };
}

export function isFormatNode(value: unknown): value is FormatNode {
  if (!value || typeof value !== 'object') return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === 'line' || kind === 'table' || kind === 'grid' || kind === 'raw' || kind === 'seq';
}

export function isFormatDocument(value: unknown): value is FormatDocument {
  return Boolean(
    value
      && typeof value === 'object'
      && (value as { __genesisFormat?: unknown }).__genesisFormat === 2
      && Array.isArray((value as { nodes?: unknown }).nodes)
      && (value as FormatDocument).nodes.every(isFormatNode),
  );
}

export function normalizeFormat(value: unknown): FormatDocument {
  if (isFormatDocument(value)) return value;
  if (isFormatNode(value)) return createFormatDocument([value]);
  throw new Error('Dataset format() must return a v2 format document created with fmt.*.');
}

export function renderFormatDocument(document: FormatDocument | FormatNode): string {
  const normalized = isFormatDocument(document) ? document : createFormatDocument([document]);
  return normalized.nodes.map(renderNode).join('\n');
}

function normalizeRow(row: FormatNode | readonly FormatAtom[] | FormatAtom): FormatNode {
  if (isFormatNode(row)) return row;
  if (Array.isArray(row)) return fmt.line(...row);
  return fmt.line(row as FormatAtom);
}

function renderNode(node: FormatNode): string {
  switch (node.kind) {
    case 'line':
      return node.items.map(renderAtom).join(node.sep ?? ' ');
    case 'table':
      return node.rows
        .map(row => row.map(renderAtom).join(node.sep ?? ' '))
        .join(node.rowSep ?? '\n');
    case 'grid':
      return node.rows.map(row => Array.isArray(row) ? row.map(renderAtom).join('') : row).join('\n');
    case 'raw':
      return node.text;
    case 'seq':
      return node.nodes.map(renderNode).join(node.sep);
  }
}

function renderAtom(value: FormatAtom): string {
  return value == null ? '' : String(value);
}
