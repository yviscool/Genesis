export type FormatAtom = string | number | bigint | boolean | null | undefined;

export interface FormatLine {
  readonly kind: 'line';
  readonly items: readonly FormatAtom[];
}

export interface FormatTable {
  readonly kind: 'table';
  readonly rows: readonly (readonly FormatAtom[])[];
}

export interface FormatGrid {
  readonly kind: 'grid';
  readonly rows: readonly (string | readonly FormatAtom[])[];
}

export interface FormatRaw {
  readonly kind: 'raw';
  readonly text: string;
}

export type FormatNode = FormatLine | FormatTable | FormatGrid | FormatRaw;

export interface FormatDocument {
  readonly __genesisFormat: 2;
  readonly nodes: readonly FormatNode[];
}

export const fmt = {
  line(...items: FormatAtom[]): FormatLine {
    return { kind: 'line', items };
  },

  lines(...rows: (FormatNode | readonly FormatAtom[] | FormatAtom)[]): FormatDocument {
    return createFormatDocument(rows.map(row => normalizeRow(row)));
  },

  table(rows: readonly (readonly FormatAtom[])[]): FormatTable {
    return { kind: 'table', rows };
  },

  grid(rows: readonly (string | readonly FormatAtom[])[]): FormatGrid {
    return { kind: 'grid', rows };
  },

  raw(text: string): FormatRaw {
    return { kind: 'raw', text };
  },
} as const;

export function createFormatDocument(nodes: readonly FormatNode[]): FormatDocument {
  return { __genesisFormat: 2, nodes };
}

export function isFormatNode(value: unknown): value is FormatNode {
  if (!value || typeof value !== 'object') return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === 'line' || kind === 'table' || kind === 'grid' || kind === 'raw';
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
      return node.items.map(renderAtom).join(' ');
    case 'table':
      return node.rows.map(row => row.map(renderAtom).join(' ')).join('\n');
    case 'grid':
      return node.rows.map(row => Array.isArray(row) ? row.map(renderAtom).join('') : row).join('\n');
    case 'raw':
      return node.text;
  }
}

function renderAtom(value: FormatAtom): string {
  return value == null ? '' : String(value);
}
