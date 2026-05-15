import { AI_CONTRACT_GENERATED } from './ai-contract.generated';

type AiContractMethodSpec = {
  signature: string;
  declarationLines: readonly string[];
};

type AiContractBlock = {
  name: string;
  declarationLines: readonly string[];
};

type AiMethodPatch = {
  docLines?: readonly string[];
  declarationLines?: readonly string[];
  signature?: string;
};

type AiBlockPatch = {
  docLines?: readonly string[];
  declarationLines?: readonly string[];
};

type AiFmtMethodName = typeof AI_CONTRACT_GENERATED.fmtMethods[number]['name'];
type AiGeneratorMethodName = typeof AI_CONTRACT_GENERATED.generatorMethods[number]['name'];
type AiBaseMethodName = typeof AI_CONTRACT_GENERATED.baseMethods[number]['name'];
type AiCharsetPropertyName = typeof AI_CONTRACT_GENERATED.charsetProperties[number];

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
  fmtMethods: readonly AiFmtMethodName[];
  generatorMethods: readonly AiGeneratorMethodName[];
  baseMethods: readonly AiBaseMethodName[];
  charsetProperties: readonly AiCharsetPropertyName[];
  canonicalPatterns: readonly string[];
};

export type AiContractAllowance = {
  fmtMethods: readonly string[];
  generatorMethods: readonly string[];
  baseMethods: readonly string[];
  charsetProperties: readonly string[];
  generatorPropertyRoots: readonly string[];
};

const FMT_METHOD_PATCHES: Partial<Record<AiFmtMethodName, AiMethodPatch>> = {
  lines: {
    docLines: [
      '/** Multiple rows. Each item may be one atom, one atom array, or one fmt.* node. */',
      '/** Atom arrays become one space-separated line; nested fmt.* nodes are embedded verbatim. */',
    ],
  },
  grid: {
    docLines: [
      '/** Grid-style rows with no separator inside each row. */',
      '/** Use fmt.table(...) instead when row items should be separated by spaces. */',
    ],
  },
  raw: {
    docLines: [
      '/** Raw text passthrough. */',
      '/** Text is emitted exactly as provided, including embedded newlines. */',
    ],
  },
};

const GENERATOR_METHOD_PATCHES: Partial<Record<AiGeneratorMethodName, AiMethodPatch>> = {
  sample: {
    docLines: [
      '/** Pick one element from a candidate list. */',
      '/** Pick k distinct elements without replacement from a candidate list. */',
    ],
  },
  sparse: {
    docLines: [
      '/** Numeric array whose sorted order has adjacent differences >= gap. */',
      '/** Final output order may be shuffled. Sort it yourself if order matters. */',
    ],
  },
  partition: {
    docLines: [
      '/** Positive integers whose sum is sum. */',
      '/** Final output order may be shuffled. */',
    ],
  },
  intervals: {
    docLines: [
      '/** Interval list. */',
      '/** When overlapping is false and sorted is not set, interval order may be shuffled. */',
    ],
    declarationLines: [
      "intervals(n: number, min: number, max: number, options?: { overlapping?: boolean; sorted?: boolean; minLen?: number; maxLen?: number; allowGaps?: boolean; }): Array<[number, number]>;",
    ],
  },
  tree: {
    declarationLines: [
      'tree(n: number, options?: TreeOptions): Array<[number, number] | [number, number, number]>;',
    ],
  },
  graph: {
    declarationLines: [
      'graph(n: number, m: number, options?: GraphOptions): Array<[number, number] | [number, number, number]>;',
    ],
  },
  points: {
    declarationLines: [
      "points(n: number, minVal: number, maxVal: number, options?: { type?: 'random' | 'collinear'; }): Array<[number, number]>;",
    ],
  },
  convexHull: {
    declarationLines: [
      'convexHull(n: number, minVal: number, maxVal: number): Array<[number, number]>;',
    ],
  },
  polygon: {
    declarationLines: [
      'polygon(n: number, minVal: number, maxVal: number): Array<[number, number]>;',
    ],
  },
  binaryTree: {
    docLines: [
      '/** Binary tree edges and the actual root label of this generated tree. */',
    ],
    declarationLines: [
      'binaryTree(n: number, options?: BinaryTreeOptions): {',
      '  edges: Array<[number, number]>;',
      '  root: number;',
      '};',
    ],
  },
  date: {
    docLines: [
      '/** Supported format tokens are YYYY, MM, and DD. */',
    ],
  },
};

const BASE_METHOD_PATCHES: Partial<Record<AiBaseMethodName, AiMethodPatch>> = {
  digits: {
    docLines: [
      '/** For length > 1, the first digit is non-zero. */',
    ],
  },
};

const DATASET_DECLARATION_PATCHES: Partial<Record<string, AiBlockPatch>> = {
  DatasetValidationReturn: {
    docLines: [
      '/** void/true => pass, false => fail with a generic message, string => fail with that reason. */',
      '/** { ok: false, reason } => fail with a structured reason. */',
    ],
  },
};

const RESOLVED_HEADER_DECLARATIONS = AI_CONTRACT_GENERATED.headerDeclarations.map(block => resolveBlock(block));
const RESOLVED_DATASET_DECLARATIONS = AI_CONTRACT_GENERATED.datasetDeclarations.map(block =>
  resolveBlock(block, DATASET_DECLARATION_PATCHES[block.name]),
);
const RESOLVED_FMT_METHODS = AI_CONTRACT_GENERATED.fmtMethods.map(method =>
  resolveMethod(method, FMT_METHOD_PATCHES[method.name as AiFmtMethodName]),
);
const RESOLVED_GENERATOR_METHODS = AI_CONTRACT_GENERATED.generatorMethods.map(method =>
  resolveMethod(method, GENERATOR_METHOD_PATCHES[method.name as AiGeneratorMethodName]),
);
const RESOLVED_BASE_METHODS = AI_CONTRACT_GENERATED.baseMethods.map(method =>
  resolveMethod(method, BASE_METHOD_PATCHES[method.name as AiBaseMethodName]),
);

const RESOLVED_FMT_METHOD_MAP = Object.fromEntries(
  RESOLVED_FMT_METHODS.map(method => [method.name, method]),
) as Record<AiFmtMethodName, AiContractMethodSpec & { name: AiFmtMethodName }>;

const RESOLVED_GENERATOR_METHOD_MAP = Object.fromEntries(
  RESOLVED_GENERATOR_METHODS.map(method => [method.name, method]),
) as Record<AiGeneratorMethodName, AiContractMethodSpec & { name: AiGeneratorMethodName }>;

const RESOLVED_BASE_METHOD_MAP = Object.fromEntries(
  RESOLVED_BASE_METHODS.map(method => [method.name, method]),
) as Record<AiBaseMethodName, AiContractMethodSpec & { name: AiBaseMethodName }>;

export const AI_FMT_METHOD_SIGNATURES = Object.fromEntries(
  RESOLVED_FMT_METHODS.map(method => [method.name, method.signature]),
) as Record<AiFmtMethodName, string>;

export const AI_GENERATOR_METHOD_SIGNATURES = Object.fromEntries(
  RESOLVED_GENERATOR_METHODS.map(method => [method.name, method.signature]),
) as Record<AiGeneratorMethodName, string>;

export const AI_BASE_METHOD_SIGNATURES = Object.fromEntries(
  RESOLVED_BASE_METHODS.map(method => [method.name, method.signature]),
) as Record<AiBaseMethodName, string>;

export const AI_CHARSET_PROPERTIES = Object.fromEntries(
  AI_CONTRACT_GENERATED.charsetProperties.map(property => [property, property]),
) as Record<AiCharsetPropertyName, AiCharsetPropertyName>;

const ALL_FMT_METHOD_NAMES = RESOLVED_FMT_METHODS.map(method => method.name) as AiFmtMethodName[];
const ALL_GENERATOR_METHOD_NAMES = RESOLVED_GENERATOR_METHODS.map(method => method.name) as AiGeneratorMethodName[];
const ALL_BASE_METHOD_NAMES = RESOLVED_BASE_METHODS.map(method => method.name) as AiBaseMethodName[];
const ALL_CHARSET_PROPERTY_NAMES = [...AI_CONTRACT_GENERATED.charsetProperties] as AiCharsetPropertyName[];

function resolveBlock(
  block: typeof AI_CONTRACT_GENERATED.headerDeclarations[number] | typeof AI_CONTRACT_GENERATED.datasetDeclarations[number],
  patch?: AiBlockPatch,
): AiContractBlock {
  return {
    name: block.name,
    declarationLines: [
      ...(patch?.docLines ?? []),
      ...(patch?.declarationLines ?? block.declarationLines),
    ],
  };
}

function resolveMethod(
  method: typeof AI_CONTRACT_GENERATED.fmtMethods[number] | typeof AI_CONTRACT_GENERATED.generatorMethods[number] | typeof AI_CONTRACT_GENERATED.baseMethods[number],
  patch?: AiMethodPatch,
): AiContractMethodSpec & { name: string } {
  const declarationLines = [
    ...(patch?.docLines ?? []),
    ...(patch?.declarationLines ?? method.declarationLines),
  ];

  return {
    name: method.name,
    declarationLines,
    signature: patch?.signature ?? firstDeclarationLine(declarationLines),
  };
}

function firstDeclarationLine(lines: readonly string[]): string {
  const line = lines.find(item => item.trim().length > 0 && !item.trim().startsWith('/**'));
  if (!line) {
    throw new Error('Resolved AI contract declaration lines are empty.');
  }
  return line.trim();
}

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

export function selectAiContract(statement: string): AiContractSelection {
  const profile = analyzeProblemStatement(statement);

  const canonicalPatterns: string[] = [
    'Default dataset shape: export default defineDataset<Input>({ solution, seed, format, validate, cases })',
    'Static case: { name, input }',
    'Generated case: { name, repeat?, generate: ({ g, caseIndex, caseNumber, caseName, repeatIndex, seed }) => input }',
    'Canonical explicit format style: fmt.lines(fmt.line(...), fmt.table(...), fmt.grid(...), fmt.raw(...))',
    'Matrix/grid input pattern: { n, m, rows } with fmt.lines(fmt.line(n, m), fmt.table(rows)) or fmt.lines(fmt.line(n, m), fmt.grid(rows))',
    'Graph/tree input pattern: { n, edges } or { n, m, edges } with fmt.lines(fmt.line(...header), fmt.table(edges))',
    'Multi-test input pattern: { tests: [...] } with fmt.lines(fmt.line(t), ...tests.flatMap(...))',
  ];

  return {
    profile,
    fmtMethods: [...ALL_FMT_METHOD_NAMES],
    generatorMethods: [...ALL_GENERATOR_METHOD_NAMES],
    baseMethods: [...ALL_BASE_METHOD_NAMES],
    charsetProperties: [...ALL_CHARSET_PROPERTY_NAMES],
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

function renderNamedBlocks(blocks: readonly AiContractBlock[], spaces = 2): string[] {
  const rendered: string[] = [];

  for (const [index, block] of blocks.entries()) {
    if (index > 0) rendered.push('');
    rendered.push(...indentLines(block.declarationLines, spaces));
  }

  return rendered;
}

function renderFmtInterface(selection: AiContractSelection): string[] {
  const lines = [
    '  export const fmt: {',
  ];

  for (const methodName of selection.fmtMethods) {
    lines.push(...renderDeclarationBlock(RESOLVED_FMT_METHOD_MAP[methodName].declarationLines));
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
    lines.push(...renderDeclarationBlock(RESOLVED_GENERATOR_METHOD_MAP[methodName].declarationLines));
  }

  if (selection.baseMethods.length > 0) {
    lines.push('    readonly base: {');
    for (const methodName of selection.baseMethods) {
      lines.push(...indentLines(RESOLVED_BASE_METHOD_MAP[methodName].declarationLines, 6));
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
    ...renderNamedBlocks(RESOLVED_HEADER_DECLARATIONS),
    '',
    ...renderFmtInterface(selection),
    '',
    ...renderGeneratorInterface(selection),
    '',
    ...renderNamedBlocks(RESOLVED_DATASET_DECLARATIONS),
    '}',
    '',
    '// Canonical patterns:',
    ...selection.canonicalPatterns.map(item => `// - ${item}`),
    '',
    '// Notes:',
    '// - Import only defineDataset and fmt from genesis-kit',
    '// - Use only the fmt.* and g.* declarations shown above',
  ];

  return `${lines.join('\n')}\n`;
}

export function renderAiGenesisContractMarkdown(
  selection: AiContractSelection = selectAiContract(''),
): string {
  return renderAiGenesisContractDts(selection);
}

export function isAiFormatMethodName(value: string): value is AiFmtMethodName {
  return value in RESOLVED_FMT_METHOD_MAP;
}

export function isAiGeneratorMethodName(value: string): value is AiGeneratorMethodName {
  return value in RESOLVED_GENERATOR_METHOD_MAP;
}
