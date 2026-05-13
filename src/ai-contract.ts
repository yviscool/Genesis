type CapabilitySpec = {
  signature: string;
  summary: string;
  example: string;
  declarationLines: readonly string[];
  tags: readonly string[];
};

export type AiProblemProfile = {
  multiTest: boolean;
  matrix: boolean;
  tree: boolean;
  graph: boolean;
  interval: boolean;
  string: boolean;
  grid: boolean;
  geometry: boolean;
};

export type AiContractSelection = {
  profile: AiProblemProfile;
  fmtMethods: readonly (keyof typeof AI_FMT_METHOD_SPECS)[];
  generatorMethods: readonly (keyof typeof AI_GENERATOR_METHOD_SPECS)[];
  baseMethods: readonly (keyof typeof AI_BASE_METHOD_SPECS)[];
  charsetProperties: readonly (keyof typeof AI_CHARSET_PROPERTIES)[];
  canonicalPatterns: readonly string[];
};

export type AiContractAllowance = {
  fmtMethods: readonly string[];
  generatorMethods: readonly string[];
  baseMethods: readonly string[];
  charsetProperties: readonly string[];
  generatorPropertyRoots: readonly string[];
};

const AI_FMT_METHOD_SPECS = {
  line: {
    signature: 'fmt.line(...items)',
    summary: 'One output row with space-separated atoms.',
    example: 'fmt.line(n, m)',
    declarationLines: [
      '/** One space-separated output row. Example: fmt.line(n, m) */',
      'line(...items: FormatAtom[]): FormatLine;',
    ],
    tags: ['core', 'scalar'],
  },
  lines: {
    signature: 'fmt.lines(...rows)',
    summary: 'A sequence of lines or nested nodes.',
    example: 'fmt.lines([t], ...tests.flatMap(({ n, a }) => [[n], a]))',
    declarationLines: [
      '/** Multiple rows. Each item may be one atom, one atom array, or one fmt.* node. */',
      'lines(...rows: Array<FormatNode | readonly FormatAtom[] | FormatAtom>): FormatDocument;',
    ],
    tags: ['core', 'multiline'],
  },
  table: {
    signature: 'fmt.table(rows)',
    summary: 'Rows rendered with spaces between atoms.',
    example: 'fmt.table(edges)',
    declarationLines: [
      '/** Table-style rows. Example: fmt.table(edges) */',
      'table(rows: readonly (readonly FormatAtom[])[]): FormatTable;',
    ],
    tags: ['core', 'rows'],
  },
  grid: {
    signature: 'fmt.grid(rows)',
    summary: 'Rows rendered without separators inside each row.',
    example: "fmt.grid(['.#.', '###'])",
    declarationLines: [
      '/** Grid-style rows with no separator inside each row. */',
      'grid(rows: readonly (string | readonly FormatAtom[])[]): FormatGrid;',
    ],
    tags: ['grid', 'matrix'],
  },
  raw: {
    signature: 'fmt.raw(text)',
    summary: 'Raw text emitted as-is.',
    example: "fmt.raw('1\\n2\\n3')",
    declarationLines: [
      '/** Raw text passthrough. Rarely needed. */',
      'raw(text: string): FormatRaw;',
    ],
    tags: ['advanced'],
  },
} as const;

const AI_GENERATOR_METHOD_SPECS = {
  int: {
    signature: 'g.int(min, max)',
    summary: 'One integer in [min, max].',
    example: 'g.int(1, 50)',
    declarationLines: [
      '/** One integer in [min, max]. Example: g.int(1, 50) */',
      'int(min: number, max: number): number;',
    ],
    tags: ['core', 'numeric'],
  },
  ints: {
    signature: 'g.ints(count, min, max)',
    summary: 'An array of integers, each in [min, max].',
    example: 'g.ints(n, 1, 100)',
    declarationLines: [
      '/** An array of integers. Example: g.ints(n, 1, 100) */',
      'ints(count: number, min: number, max: number): number[];',
    ],
    tags: ['core', 'array'],
  },
  distinctInts: {
    signature: 'g.distinctInts(count, min, max)',
    summary: 'An array of unique integers.',
    example: 'g.distinctInts(n, 1, 100)',
    declarationLines: [
      '/** Unique integers. Example: g.distinctInts(n, 1, 100) */',
      'distinctInts(count: number, min: number, max: number): number[];',
    ],
    tags: ['array', 'unique'],
  },
  float: {
    signature: 'g.float(min, max, precision?)',
    summary: 'One floating-point number in [min, max].',
    example: 'g.float(0, 1, 6)',
    declarationLines: [
      '/** One floating-point number in [min, max]. */',
      'float(min: number, max: number, precision?: number): number;',
    ],
    tags: ['numeric'],
  },
  even: {
    signature: 'g.even(min, max)',
    summary: 'One even integer in [min, max].',
    example: 'g.even(2, 20)',
    declarationLines: [
      '/** One even integer in [min, max]. */',
      'even(min: number, max: number): number;',
    ],
    tags: ['numeric'],
  },
  odd: {
    signature: 'g.odd(min, max)',
    summary: 'One odd integer in [min, max].',
    example: 'g.odd(1, 19)',
    declarationLines: [
      '/** One odd integer in [min, max]. */',
      'odd(min: number, max: number): number;',
    ],
    tags: ['numeric'],
  },
  prime: {
    signature: 'g.prime(min, max)',
    summary: 'One prime in [min, max].',
    example: 'g.prime(2, 97)',
    declarationLines: [
      '/** One prime in [min, max]. */',
      'prime(min: number, max: number): number;',
    ],
    tags: ['numeric'],
  },
  coprime: {
    signature: 'g.coprime(min, max)',
    summary: 'Two integers in [min, max] whose gcd is 1.',
    example: 'g.coprime(1, 100)',
    declarationLines: [
      '/** Two integers whose gcd is 1. */',
      'coprime(min: number, max: number): [number, number];',
    ],
    tags: ['numeric'],
  },
  divisible: {
    signature: 'g.divisible(min, max, divisor)',
    summary: 'One integer in [min, max] divisible by divisor.',
    example: 'g.divisible(1, 100, 5)',
    declarationLines: [
      '/** One integer divisible by divisor. */',
      'divisible(min: number, max: number, divisor: number): number;',
    ],
    tags: ['numeric'],
  },
  sequence: {
    signature: 'g.sequence(options)',
    summary: 'A structured numeric sequence.',
    example: "g.sequence({ type: 'arithmetic', start: 1, diff: 2, count: n })",
    declarationLines: [
      '/** Structured sequence: arithmetic, geometric, fibonacci, or custom. */',
      "sequence(options: { type: 'arithmetic'; start: number; diff: number; count: number } | { type: 'geometric'; start: number; ratio: number; count: number } | { type: 'fibonacci'; count: number; first?: number; second?: number } | { type: 'custom'; init: number[]; fn: (sequence: number[], index: number) => number; count: number }): number[];",
    ],
    tags: ['numeric', 'array'],
  },
  string: {
    signature: 'g.string(length, charset?)',
    summary: 'A random string of the given length.',
    example: "g.string(10, g.CHARSET.LOWERCASE)",
    declarationLines: [
      '/** Random string. Example: g.string(10, g.CHARSET.LOWERCASE) */',
      'string(length: number, charset?: string): string;',
    ],
    tags: ['string'],
  },
  palindrome: {
    signature: 'g.palindrome(length, charset?)',
    summary: 'A palindrome string.',
    example: 'g.palindrome(9)',
    declarationLines: [
      '/** Palindrome string. */',
      'palindrome(length: number, charset?: string): string;',
    ],
    tags: ['string'],
  },
  word: {
    signature: 'g.word(minLen, maxLen)',
    summary: 'One lowercase word.',
    example: 'g.word(3, 8)',
    declarationLines: [
      '/** One lowercase word. */',
      'word(minLen: number, maxLen: number): string;',
    ],
    tags: ['string'],
  },
  words: {
    signature: 'g.words(count, minLen, maxLen)',
    summary: 'An array of lowercase words.',
    example: 'g.words(5, 3, 8)',
    declarationLines: [
      '/** An array of lowercase words. */',
      'words(count: number, minLen: number, maxLen: number): string[];',
    ],
    tags: ['string', 'array'],
  },
  brackets: {
    signature: 'g.brackets(n, options?)',
    summary: 'A bracket sequence.',
    example: 'g.brackets(8)',
    declarationLines: [
      '/** Balanced bracket sequence. */',
      "brackets(n: number, options?: { types?: string }): string;",
    ],
    tags: ['string'],
  },
  array: {
    signature: 'g.array(count, itemGenerator)',
    summary: 'A mapped array built from the callback.',
    example: 'g.array(n, () => g.int(1, 100))',
    declarationLines: [
      '/** General array builder. */',
      'array<T>(count: number, itemGenerator: (index: number) => T): T[];',
    ],
    tags: ['core', 'array'],
  },
  sorted: {
    signature: 'g.sorted(count, min, max, options?)',
    summary: 'A sorted numeric array.',
    example: "g.sorted(n, 1, 100, { order: 'asc' })",
    declarationLines: [
      '/** Sorted numeric array. */',
      "sorted(count: number, min: number, max: number, options?: { order?: 'asc' | 'desc' | 'strictlyAsc' | 'strictlyDesc' }): number[];",
    ],
    tags: ['core', 'array', 'ordered'],
  },
  sparse: {
    signature: 'g.sparse(count, min, max, gap)',
    summary: 'A numeric array with spacing constraints.',
    example: 'g.sparse(n, 1, 1000, 3)',
    declarationLines: [
      '/** Numeric array with minimum gap. */',
      'sparse(count: number, min: number, max: number, gap: number): number[];',
    ],
    tags: ['array', 'ordered'],
  },
  partition: {
    signature: 'g.partition(count, sum, options?)',
    summary: 'Positive integers whose sum is sum.',
    example: 'g.partition(4, 20)',
    declarationLines: [
      '/** Positive integers whose sum is sum. */',
      'partition(count: number, sum: number, options?: { minVal?: number }): number[];',
    ],
    tags: ['core', 'sum'],
  },
  matrix: {
    signature: 'g.matrix(rows, cols, cellGenerator)',
    summary: 'A 2D array built row by row.',
    example: 'g.matrix(n, m, () => g.int(0, 9))',
    declarationLines: [
      '/** Generic 2D array builder. */',
      'matrix<T>(rows: number, cols: number, cellGenerator: (rowIndex: number, colIndex: number) => T): T[][];',
    ],
    tags: ['matrix'],
  },
  grid01: {
    signature: 'g.grid01(rows, cols, density?)',
    summary: 'A 0/1 matrix.',
    example: 'g.grid01(n, m, 0.3)',
    declarationLines: [
      '/** 0/1 grid. */',
      'grid01(rows: number, cols: number, density?: number): number[][];',
    ],
    tags: ['grid', 'matrix'],
  },
  maze: {
    signature: 'g.maze(rows, cols, options?)',
    summary: 'A maze grid using road and wall symbols.',
    example: "g.maze(9, 9, { wall: '#', road: '.' })",
    declarationLines: [
      '/** Maze-style character grid. */',
      "maze(rows: number, cols: number, options?: { wall?: string; road?: string }): string[][];",
    ],
    tags: ['grid'],
  },
  intervals: {
    signature: 'g.intervals(n, min, max, options?)',
    summary: 'A list of [l, r] intervals.',
    example: 'g.intervals(n, 1, 100, { sorted: true })',
    declarationLines: [
      '/** Interval list. */',
      "intervals(n: number, min: number, max: number, options?: { overlapping?: boolean; sorted?: boolean; minLen?: number; maxLen?: number; allowGaps?: boolean }): Array<[number, number]>;",
    ],
    tags: ['interval'],
  },
  permutation: {
    signature: 'g.permutation(n, oneBased?)',
    summary: 'A permutation of 0..n-1 or 1..n.',
    example: 'g.permutation(n, true)',
    declarationLines: [
      '/** Permutation. */',
      'permutation(n: number, oneBased?: boolean): number[];',
    ],
    tags: ['permutation'],
  },
  shuffle: {
    signature: 'g.shuffle(array)',
    summary: 'A shuffled copy of the input array.',
    example: 'g.shuffle(a)',
    declarationLines: [
      '/** Shuffled copy of the input array. */',
      'shuffle<T>(array: readonly T[]): T[];',
    ],
    tags: ['core', 'array'],
  },
  sample: {
    signature: 'g.sample(array) / g.sample(array, k)',
    summary: 'One element or a sample of size k.',
    example: 'g.sample([3, 5, 7])',
    declarationLines: [
      '/** Pick one element from a candidate list. */',
      'sample<T>(population: readonly T[]): T;',
      '/** Pick k elements from a candidate list. */',
      'sample<T>(population: readonly T[], k: number): T[];',
    ],
    tags: ['core', 'choice'],
  },
  chunk: {
    signature: 'g.chunk(array, size)',
    summary: 'A chunked view of the input array.',
    example: 'g.chunk(values, 2)',
    declarationLines: [
      '/** Chunk an array into groups. */',
      'chunk<T>(array: readonly T[], size: number): T[][];',
    ],
    tags: ['array'],
  },
  tree: {
    signature: 'g.tree(n, options?)',
    summary: 'A tree edge list.',
    example: "g.tree(n, { type: 'random', oneBased: true })",
    declarationLines: [
      '/** Tree edge list. */',
      "tree(n: number, options?: { type?: 'random' | 'path' | 'star'; weighted?: boolean | [number, number]; oneBased?: boolean }): Array<[number, number] | [number, number, number]>;",
    ],
    tags: ['tree'],
  },
  graph: {
    signature: 'g.graph(n, m, options?)',
    summary: 'A graph edge list.',
    example: "g.graph(n, m, { type: 'simple', connected: true, oneBased: true })",
    declarationLines: [
      '/** Graph edge list. */',
      "graph(n: number, m: number, options?: { type?: 'simple' | 'tree' | 'dag' | 'bipartite' | 'wheel' | 'complete'; directed?: boolean; weighted?: boolean | [number, number]; connected?: boolean; noSelfLoops?: boolean; oneBased?: boolean; negativeCycle?: boolean }): Array<[number, number] | [number, number, number]>;",
    ],
    tags: ['graph'],
  },
  points: {
    signature: 'g.points(n, minVal, maxVal, options?)',
    summary: 'A list of [x, y] points.',
    example: 'g.points(n, 1, 100)',
    declarationLines: [
      '/** 2D points. */',
      "points(n: number, minVal: number, maxVal: number, options?: { type?: 'random' | 'collinear' }): Array<[number, number]>;",
    ],
    tags: ['geometry'],
  },
  convexHull: {
    signature: 'g.convexHull(n, minVal, maxVal)',
    summary: 'A convex hull point list.',
    example: 'g.convexHull(n, 1, 100)',
    declarationLines: [
      '/** Points on a convex hull. */',
      'convexHull(n: number, minVal: number, maxVal: number): Array<[number, number]>;',
    ],
    tags: ['geometry'],
  },
  polygon: {
    signature: 'g.polygon(n, minVal, maxVal)',
    summary: 'A simple polygon point list.',
    example: 'g.polygon(n, 1, 100)',
    declarationLines: [
      '/** Simple polygon points. */',
      'polygon(n: number, minVal: number, maxVal: number): Array<[number, number]>;',
    ],
    tags: ['geometry'],
  },
  binaryTree: {
    signature: 'g.binaryTree(n, options?)',
    summary: 'Binary tree edges plus root index.',
    example: 'g.binaryTree(n, { oneBased: true })',
    declarationLines: [
      '/** Binary tree edges and root. */',
      "binaryTree(n: number, options?: { type?: 'random' | 'complete' | 'skewed'; oneBased?: boolean }): { edges: Array<[number, number]>; root: number };",
    ],
    tags: ['tree'],
  },
  isLeap: {
    signature: 'g.isLeap(year)',
    summary: 'True if year is a leap year.',
    example: 'g.isLeap(2024)',
    declarationLines: [
      '/** Leap-year predicate. */',
      'isLeap(year: number): boolean;',
    ],
    tags: ['date'],
  },
  year: {
    signature: 'g.year(minYear?, maxYear?)',
    summary: 'A random year.',
    example: 'g.year(2000, 2024)',
    declarationLines: [
      '/** Random year. */',
      'year(minYear?: number, maxYear?: number): number;',
    ],
    tags: ['date'],
  },
  date: {
    signature: 'g.date(options?)',
    summary: 'A formatted date string.',
    example: "g.date({ format: 'YYYY-MM-DD' })",
    declarationLines: [
      '/** Random date string. */',
      "date(options?: { minYear?: number; maxYear?: number; format?: string }): string;",
    ],
    tags: ['date'],
  },
  debug: {
    signature: 'g.debug(data, options?) / g.debug(label, data, options?)',
    summary: 'Debug printer.',
    example: "g.debug('shape', input)",
    declarationLines: [
      '/** Debug printer. Do not keep it in final maker.ts unless needed. */',
      'debug<T>(data: T, options?: { separator?: string; printDims?: boolean; printType?: boolean; printStats?: boolean; truncate?: number; colors?: boolean }): void;',
      'debug<T>(label: string, data: T, options?: { separator?: string; printDims?: boolean; printType?: boolean; printStats?: boolean; truncate?: number; colors?: boolean }): void;',
    ],
    tags: ['debug'],
  },
} as const;

const AI_BASE_METHOD_SPECS = {
  convert: {
    signature: 'g.base.convert(input, fromRadix, toRadix)',
    summary: 'Base conversion helper.',
    example: "g.base.convert('1010', 2, 16)",
    declarationLines: [
      '/** Base conversion helper. */',
      'convert(input: string | number | bigint, fromRadix: number, toRadix: number): string;',
    ],
    tags: ['base'],
  },
  binToHex: {
    signature: 'g.base.binToHex(binaryString)',
    summary: 'Binary to hexadecimal helper.',
    example: "g.base.binToHex('1010')",
    declarationLines: [
      '/** Binary to hexadecimal helper. */',
      'binToHex(binaryString: string): string;',
    ],
    tags: ['base'],
  },
  hexToBin: {
    signature: 'g.base.hexToBin(hexString)',
    summary: 'Hexadecimal to binary helper.',
    example: "g.base.hexToBin('0f')",
    declarationLines: [
      '/** Hexadecimal to binary helper. */',
      'hexToBin(hexString: string): string;',
    ],
    tags: ['base'],
  },
  digits: {
    signature: 'g.base.digits(length, radix)',
    summary: 'A random digit string in the chosen radix.',
    example: 'g.base.digits(8, 10)',
    declarationLines: [
      '/** Random digit string in the chosen radix. */',
      'digits(length: number, radix: number): string;',
    ],
    tags: ['base'],
  },
} as const;

export const AI_FMT_METHOD_SIGNATURES = Object.fromEntries(
  Object.entries(AI_FMT_METHOD_SPECS).map(([key, spec]) => [key, spec.signature]),
) as Record<keyof typeof AI_FMT_METHOD_SPECS, string>;

export const AI_GENERATOR_METHOD_SIGNATURES = Object.fromEntries(
  Object.entries(AI_GENERATOR_METHOD_SPECS).map(([key, spec]) => [key, spec.signature]),
) as Record<keyof typeof AI_GENERATOR_METHOD_SPECS, string>;

export const AI_BASE_METHOD_SIGNATURES = Object.fromEntries(
  Object.entries(AI_BASE_METHOD_SPECS).map(([key, spec]) => [key, spec.signature]),
) as Record<keyof typeof AI_BASE_METHOD_SPECS, string>;

export const AI_CHARSET_PROPERTIES = {
  LOWERCASE: 'LOWERCASE',
  UPPERCASE: 'UPPERCASE',
  DIGITS: 'DIGITS',
  ALPHANUMERIC: 'ALPHANUMERIC',
  ALPHA: 'ALPHA',
  BASE36: 'BASE36',
} as const;

function extractSectionBlock(statement: string, headings: string[]): string {
  const normalizedHeadings = new Set(headings.map(item => item.toLowerCase()));
  const lines = statement.split(/\r?\n/);
  const collected: string[] = [];
  let active = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = trimmed.replace(/^#+\s*/, '').toLowerCase();

    if (normalizedHeadings.has(heading)) {
      active = true;
      collected.push(line);
      continue;
    }

    if (active && /^#+\s+/.test(trimmed)) {
      break;
    }

    if (active) {
      collected.push(line);
    }
  }

  return collected.join('\n').trim();
}

function normalizeStatementText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_>#]/g, ' ')
    .replace(/\$/g, '')
    .replace(/[()[\]{}，。；：,.:!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildStructuralText(statement: string): string {
  const parts = [
    extractSectionBlock(statement, ['输入格式', '输入', 'input format', 'input']),
    extractSectionBlock(statement, ['数据范围', 'constraints', 'limits']),
    extractSectionBlock(statement, ['格式', 'format']),
  ].filter(Boolean);

  return normalizeStatementText(parts.join('\n\n') || statement);
}

function buildWholeText(statement: string): string {
  return normalizeStatementText(statement);
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

export function analyzeProblemStatement(statement: string): AiProblemProfile {
  const structuralText = buildStructuralText(statement);
  const wholeText = buildWholeText(statement);

  const multiTest = matchesAny(structuralText, [
    /测试用例组数/,
    /多组测试/,
    /接下来\s*t\s*组/,
    /for each test case/,
    /multiple test cases/,
    /the next t/,
  ]);

  const matrix = matchesAny(structuralText, [
    /(矩阵|matrix).*(接下来.*n.*行|n.*行.*每行.*m)/,
    /(接下来.*n.*行|n.*行.*每行.*m).*(矩阵|matrix)/,
    /n\s+rows?\s+and\s+m\s+columns?/,
  ]);

  const grid = matchesAny(structuralText, [
    /网格/,
    /\bgrid\b/,
    /迷宫/,
    /\bmaze\b/,
    /字符矩阵/,
    /01矩阵/,
  ]);

  const tree = matchesAny(structuralText, [
    /输入保证是一棵树/,
    /(树|tree).*(边|edge)/,
    /(接下来.*n\s*-\s*1.*行|next\s+n\s*-\s*1\s+lines?).*(边|edge)/,
  ]);

  const graph = !tree && matchesAny(structuralText, [
    /(图|graph).*(边|edge)/,
    /(接下来.*m.*行|next\s+m\s+lines?).*(边|edge)/,
  ]);

  const interval = matchesAny(structuralText, [
    /区间/,
    /\binterval\b/,
    /\[l/i,
    /\[ r/i,
  ]);

  const string = matchesAny(structuralText, [
    /字符串/,
    /\bstring\b/,
    /字符序列/,
    /character sequence/,
    /单词/,
  ]);

  const geometry = matchesAny(wholeText, [
    /坐标/,
    /\bcoordinate\b/,
    /\bcoordinates\b/,
    /\bpolygon\b/,
    /多边形/,
    /几何/,
    /平面/,
    /二维点/,
  ]);

  return {
    multiTest,
    matrix,
    tree,
    graph,
    interval,
    string,
    grid,
    geometry,
  };
}

function pushUnique<T>(items: T[], ...values: T[]): void {
  for (const value of values) {
    if (!items.includes(value)) {
      items.push(value);
    }
  }
}

export function selectAiContract(statement: string): AiContractSelection {
  const profile = analyzeProblemStatement(statement);

  const fmtMethods: (keyof typeof AI_FMT_METHOD_SPECS)[] = ['line', 'lines', 'table'];
  if (profile.grid) {
    pushUnique(fmtMethods, 'grid');
  }

  const generatorMethods: (keyof typeof AI_GENERATOR_METHOD_SPECS)[] = [
    'int',
    'ints',
    'distinctInts',
    'sorted',
    'array',
    'sample',
    'shuffle',
    'partition',
  ];

  if (profile.string) {
    pushUnique(generatorMethods, 'string', 'word', 'words');
  }
  if (profile.matrix) {
    pushUnique(generatorMethods, 'matrix');
  }
  if (profile.grid) {
    pushUnique(generatorMethods, 'matrix', 'grid01', 'maze');
  }
  if (profile.tree) {
    pushUnique(generatorMethods, 'tree', 'binaryTree');
  }
  if (profile.graph) {
    pushUnique(generatorMethods, 'graph');
  }
  if (profile.interval) {
    pushUnique(generatorMethods, 'intervals');
  }
  if (profile.geometry) {
    pushUnique(generatorMethods, 'points', 'convexHull', 'polygon');
  }

  const canonicalPatterns: string[] = [
    'Default dataset shape: export default defineDataset<Input>({ solution, seed, format, validate, cases })',
    'Static case: { name, input }',
    'Generated case: { name, repeat?, generate: ({ g, caseIndex, caseNumber, caseName, repeatIndex, seed }) => input }',
  ];

  if (profile.multiTest) {
    canonicalPatterns.push('Multi-test input pattern: { tests: [...] } and format with fmt.lines([tests.length], ...tests.flatMap(...))');
  }
  if (profile.tree) {
    canonicalPatterns.push('Tree input pattern: { n, edges } with edges formatted by fmt.lines([n], fmt.table(edges))');
  }
  if (profile.graph) {
    canonicalPatterns.push('Graph input pattern: { n, m, edges } with edges formatted by fmt.lines([n, m], fmt.table(edges))');
  }
  if (profile.interval) {
    canonicalPatterns.push('Interval input pattern: { n, intervals } with intervals formatted by fmt.lines([n], fmt.table(intervals))');
  }
  if (profile.matrix) {
    canonicalPatterns.push('Matrix input pattern: { n, m, matrix } with matrix formatted by fmt.lines([n, m], fmt.table(matrix))');
  }
  if (profile.grid) {
    canonicalPatterns.push("Grid input pattern: { n, m, rows } with rows formatted by fmt.lines([n, m], fmt.grid(rows)) or fmt.table(rows)");
  }

  return {
    profile,
    fmtMethods,
    generatorMethods,
    baseMethods: [],
    charsetProperties: profile.string ? Object.keys(AI_CHARSET_PROPERTIES) as (keyof typeof AI_CHARSET_PROPERTIES)[] : [],
    canonicalPatterns,
  };
}

export function resolveAiContractAllowance(selection: AiContractSelection): AiContractAllowance {
  return {
    fmtMethods: [...selection.fmtMethods],
    generatorMethods: [...selection.generatorMethods],
    baseMethods: [...selection.baseMethods],
    charsetProperties: [...selection.charsetProperties],
    generatorPropertyRoots: [
      ...(selection.charsetProperties.length > 0 ? ['CHARSET'] : []),
      ...(selection.baseMethods.length > 0 ? ['base'] : []),
    ],
  };
}

function indentLines(lines: readonly string[], spaces = 2): string[] {
  const indent = ' '.repeat(spaces);
  return lines.map(line => line.length > 0 ? `${indent}${line}` : line);
}

function renderDeclarationBlock(lines: readonly string[]): string[] {
  return indentLines(lines, 4);
}

function renderFmtInterface(selection: AiContractSelection): string[] {
  const lines = [
    '  export const fmt: {',
  ];

  for (const methodName of selection.fmtMethods) {
    lines.push(...renderDeclarationBlock(AI_FMT_METHOD_SPECS[methodName].declarationLines));
  }

  lines.push('  };');
  return lines;
}

function renderGeneratorInterface(selection: AiContractSelection): string[] {
  const lines = [
    '  export interface DatasetGenerator {',
  ];

  if (selection.charsetProperties.length > 0) {
    lines.push('    readonly CHARSET: {');
    for (const property of selection.charsetProperties) {
      lines.push(`      readonly ${property}: string;`);
    }
    lines.push('    };');
  }

  for (const methodName of selection.generatorMethods) {
    lines.push(...renderDeclarationBlock(AI_GENERATOR_METHOD_SPECS[methodName].declarationLines));
  }

  if (selection.baseMethods.length > 0) {
    lines.push('    readonly base: {');
    for (const methodName of selection.baseMethods) {
      lines.push(...indentLines(AI_BASE_METHOD_SPECS[methodName].declarationLines, 6));
    }
    lines.push('    };');
  }

  lines.push('  }');
  return lines;
}

export function renderAiGenesisContractDts(
  selection: AiContractSelection = selectAiContract(''),
): string {
  const lines = [
    '// Genesis AI contract for maker.ts',
    '// Only use declarations present in this file.',
    '// If a helper is missing, write plain TypeScript instead of inventing a Genesis API.',
    '',
    "declare module 'genesis-kit' {",
    '  export type SeedInput = string | number | bigint;',
    "  export type OjProfile = 'auto' | 'linux' | 'windows' | 'none';",
    '  export type MaybePromise<T> = T | Promise<T>;',
    '  export type FormatAtom = string | number | bigint | boolean | null | undefined;',
    '',
    "  export interface FormatLine { readonly kind: 'line'; readonly items: readonly FormatAtom[]; }",
    "  export interface FormatTable { readonly kind: 'table'; readonly rows: readonly (readonly FormatAtom[])[]; }",
    "  export interface FormatGrid { readonly kind: 'grid'; readonly rows: readonly (string | readonly FormatAtom[])[]; }",
    "  export interface FormatRaw { readonly kind: 'raw'; readonly text: string; }",
    '  export type FormatNode = FormatLine | FormatTable | FormatGrid | FormatRaw;',
    '  export interface FormatDocument { readonly __genesisFormat: 2; readonly nodes: readonly FormatNode[]; }',
    '',
    ...renderFmtInterface(selection),
    '',
    ...renderGeneratorInterface(selection),
    '',
    '  export interface DatasetGenerateContext {',
    '    caseIndex: number;',
    '    caseNumber: number;',
    '    caseName: string;',
    '    repeatIndex: number;',
    '    seed: string;',
    '    g: DatasetGenerator;',
    '  }',
    '',
    '  export interface DatasetValidationContext {',
    '    caseIndex: number;',
    '    caseNumber: number;',
    '    caseName: string;',
    '    repeatIndex: number;',
    '    tags: string[];',
    '    seed: string;',
    '    formattedInput: string;',
    '  }',
    '',
    '  export interface DatasetValidationResult {',
    '    ok: boolean;',
    '    reason?: string;',
    '  }',
    '',
    '  export type DatasetValidationReturn = void | boolean | string | DatasetValidationResult;',
    '',
    '  export interface DatasetStaticCase<TInput> {',
    '    name: string;',
    '    tags?: string[];',
    '    input: TInput;',
    '    generate?: never;',
    '    repeat?: never;',
    '  }',
    '',
    '  export interface DatasetGeneratedCase<TInput> {',
    '    name: string;',
    '    tags?: string[];',
    '    repeat?: number;',
    '    generate(ctx: DatasetGenerateContext): MaybePromise<TInput>;',
    '    input?: never;',
    '  }',
    '',
    '  export type DatasetCase<TInput> = DatasetStaticCase<TInput> | DatasetGeneratedCase<TInput>;',
    '',
    '  export interface DatasetConfig<TInput> {',
    '    solution: string;',
    '    outputDir?: string;',
    '    seed: SeedInput;',
    '    startFrom?: number;',
    '    runTimeoutMs?: number;',
    '    caseConcurrency?: number;',
    '    compiler?: string;',
    '    compilerFlags?: string[];',
    '    ojProfile?: OjProfile;',
    '    stackSizeBytes?: number;',
    '    manifestPath?: string | false;',
    '    format(input: TInput): FormatDocument | FormatNode;',
    '    validate?(input: TInput, context: DatasetValidationContext): MaybePromise<DatasetValidationReturn>;',
    '    cases: DatasetCase<TInput>[];',
    '  }',
    '',
    '  export interface Dataset<TInput = unknown> {',
    '    readonly __genesisDataset: 2;',
    '    readonly config: DatasetConfig<TInput>;',
    '  }',
    '',
    '  export function defineDataset<TInput>(config: DatasetConfig<TInput>): Dataset<TInput>;',
    '}',
    '',
    '// Canonical patterns:',
    ...selection.canonicalPatterns.map(item => `// - ${item}`),
    '',
    '// Notes:',
    '// - Import only defineDataset and fmt from genesis-kit',
    '// - Use only the fmt.* and g.* declarations shown above',
    '// - Prefer fmt.line, fmt.lines, and fmt.table unless the contract above exposes a more specific helper',
    '// - Keep seed descriptive and lowercase kebab-case',
    '// - Always define validate for semantic invariants',
  ];

  return `${lines.join('\n')}\n`;
}

export function renderAiGenesisContractMarkdown(
  selection: AiContractSelection = selectAiContract(''),
): string {
  return renderAiGenesisContractDts(selection);
}

export function isAiFormatMethodName(value: string): value is keyof typeof AI_FMT_METHOD_SPECS {
  return value in AI_FMT_METHOD_SPECS;
}

export function isAiGeneratorMethodName(value: string): value is keyof typeof AI_GENERATOR_METHOD_SPECS {
  return value in AI_GENERATOR_METHOD_SPECS;
}
