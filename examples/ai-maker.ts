import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type DatasetRunResult, generateDataset, loadDatasetFromFile, validateDataset } from '../src/dataset-runner';
import {
  AI_BASE_METHOD_SIGNATURES,
  AI_CHARSET_PROPERTIES,
  AI_FMT_METHOD_SIGNATURES,
  AI_GENERATOR_METHOD_SIGNATURES,
  renderAiGenesisContractDts,
} from '../src/ai-contract';

type Lang = 'js' | 'cpp' | 'py';

type Options = {
  statementPath?: string;
  name?: string;
  solutionPath?: string;
  mockResponseFile?: string;
  lang: Lang;
  repair: number;
  model: string;
  jobRoot: string;
};

type Draft = {
  makerTs: string;
  solutionCode?: string;
  raw: string;
};

type PromptContext = {
  contract: string;
  statement: string;
  solutionFile: string;
  solutionSource?: string;
  needSolution: boolean;
  lang: Lang;
};

type MakerIssue = {
  code: string;
  message: string;
};

class AiWorkflowError extends Error {
  readonly issues: MakerIssue[];

  constructor(issues: MakerIssue[]) {
    super(formatIssues(issues));
    this.issues = issues;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.asxs.top/v1').replace(/\/$/, '');
const apiKey = process.env.OPENAI_API_KEY ?? process.env.ASXS_API_KEY;
const defaultJobRoot = path.join(__dirname, '.ai-jobs');

const solutionFileByLang: Record<Lang, string> = {
  js: 'std.js',
  cpp: 'std.cpp',
  py: 'std.py',
};

const languageHint: Record<Lang, string> = {
  js: 'Write Node.js code that reads stdin and writes stdout. No external packages.',
  cpp: 'Write a single-file C++17 program.',
  py: 'Write a single-file Python 3 program.',
};

const systemPrompt = [
  'You generate Genesis datasets from problem statements.',
  'Treat the supplied Genesis contract as the only API truth.',
  'Do not guess nonexistent methods, fields, or parameters.',
  'Return only the requested sections. No markdown fences. No explanation.',
].join(' ');

const helpText = [
  'Usage:',
  'bun run examples/ai-maker.ts --statement path/to/problem.md --name demo',
  'type problem.md | bun run examples/ai-maker.ts --name demo',
  'bun run examples/ai-maker.ts --statement path/to/problem.md --solution path/to/std.cpp --name demo',
  '',
  'Options:',
  '--statement <file>   read the problem statement from file',
  '--solution <file>    use an existing reference solution',
  '--mock-response-file <file>  skip network and use a canned AI response',
  '--name <job>         output folder name under examples/.ai-jobs',
  '--lang <js|cpp|py>   solution language when AI must generate one, default js',
  '--repair <n>         local repair attempts, default 1',
  '--model <id>         default gpt-5.4',
  '--job-root <dir>     default examples/.ai-jobs',
].join('\n');

function parseArgs(argv: string[]): Options {
  const options: Options = {
    lang: 'js',
    repair: 1,
    model: process.env.OPENAI_MODEL ?? 'gpt-5.4',
    jobRoot: defaultJobRoot,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--help' || arg === '-h') {
      console.log(helpText);
      process.exit(0);
    }
    if (arg === '--statement' && next) {
      options.statementPath = next;
      index++;
      continue;
    }
    if (arg === '--solution' && next) {
      options.solutionPath = next;
      index++;
      continue;
    }
    if (arg === '--mock-response-file' && next) {
      options.mockResponseFile = next;
      index++;
      continue;
    }
    if (arg === '--name' && next) {
      options.name = next;
      index++;
      continue;
    }
    if (arg === '--lang' && next) {
      if (!['js', 'cpp', 'py'].includes(next)) {
        throw new Error(`Unsupported --lang: ${next}`);
      }
      options.lang = next as Lang;
      index++;
      continue;
    }
    if (arg === '--repair' && next) {
      const repair = Number(next);
      if (!Number.isInteger(repair) || repair < 0 || repair > 3) {
        throw new Error('--repair must be an integer in [0, 3]');
      }
      options.repair = repair;
      index++;
      continue;
    }
    if (arg === '--model' && next) {
      options.model = next;
      index++;
      continue;
    }
    if (arg === '--job-root' && next) {
      options.jobRoot = path.resolve(next);
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\r?\n/, '')
    .replace(/\r?\n```$/, '')
    .trim();
}

function extractText(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (Array.isArray(payload?.output)) {
    const parts: string[] = [];
    for (const item of payload.output) {
      if (!Array.isArray(item?.content)) continue;
      for (const content of item.content) {
        if (typeof content?.text === 'string') {
          parts.push(content.text);
        }
      }
    }
    if (parts.length > 0) return parts.join('');
  }

  const message = payload?.choices?.[0]?.message?.content;
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message)) {
    const parts = message
      .map((item: any) => typeof item?.text === 'string' ? item.text : '')
      .filter(Boolean);
    if (parts.length > 0) return parts.join('');
  }

  throw new Error(`Cannot extract text from API response: ${JSON.stringify(payload).slice(0, 800)}`);
}

async function postJson(pathname: string, body: Record<string, unknown>): Promise<any> {
  const url = new URL(`${baseUrl}${pathname}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(`${pathname} timed out after 30s`), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`${pathname} failed: ${response.status} ${text}`);
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid JSON from ${pathname}: ${error instanceof Error ? error.message : String(error)} | body=${text.slice(0, 800)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function requestText(model: string, prompt: string): Promise<string> {
  try {
    const payload = await postJson('/chat/completions', {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    });
    return stripCodeFences(extractText(payload));
  } catch (error) {
    console.log(`chat/completions failed, fallback to /responses: ${error instanceof Error ? error.message : String(error)}`);
    const payload = await postJson('/responses', {
      model,
      instructions: systemPrompt,
      input: prompt,
    });
    return stripCodeFences(extractText(payload));
  }
}

async function requestTextWithMock(options: {
  model: string;
  prompt: string;
  mockResponseFile?: string;
}): Promise<string> {
  if (options.mockResponseFile) {
    return stripCodeFences(await fs.readFile(path.resolve(options.mockResponseFile), 'utf8'));
  }
  return requestText(options.model, options.prompt);
}

async function readAllStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function readStatement(options: Options): Promise<string> {
  if (options.statementPath) {
    return (await fs.readFile(path.resolve(options.statementPath), 'utf8')).trim();
  }

  if (!process.stdin.isTTY) {
    return (await readAllStdin()).trim();
  }

  throw new Error('Provide --statement <file> or pipe the problem statement through stdin.');
}

function timestampName(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

function normalizeJobName(input?: string): string {
  const cleaned = (input ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned || `job-${timestampName()}`;
}

function extractSection(text: string, name: string): string {
  const markers = [`<<<${name}>>>`, `[${name}]`];
  let marker = '';
  let start = -1;

  for (const candidate of markers) {
    start = text.indexOf(candidate);
    if (start >= 0) {
      marker = candidate;
      break;
    }
  }

  if (start < 0) {
    throw new Error(`Missing section <<<${name}>>>`);
  }

  const from = start + marker.length;
  let end = text.length;
  const matches = [
    ...text.matchAll(/<<<[A-Z_]+>>>/g),
    ...text.matchAll(/\[[A-Z_]+\]/g),
  ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  for (const match of matches) {
    const index = match.index ?? -1;
    if (index > from && index < end) {
      end = index;
    }
  }

  return stripCodeFences(text.slice(from, end).trim());
}

function normalizeMakerTs(code: string): string {
  return code.trim();
}

function parseDraft(text: string, needSolution: boolean): Draft {
  const draft: Draft = {
    makerTs: normalizeMakerTs(extractSection(text, 'MAKER_TS')),
    raw: text,
  };

  if (needSolution) {
    draft.solutionCode = extractSection(text, 'SOLUTION_CODE').trim();
  }

  return draft;
}

function buildInitialPrompt(context: PromptContext): string {
  const lines = [
    'Task: given the Genesis contract and the problem statement, generate a correct reference solution if needed and a correct maker.ts.',
    'The user only wants final working outputs.',
    'Think silently. Do not output analysis.',
    'The Genesis contract below is a TypeScript declaration file. Treat it as the only API truth.',
    'Output exactly these sections, each marker on its own line:',
  ];

  if (context.needSolution) {
    lines.push('<<<SOLUTION_CODE>>>');
  }
  lines.push('<<<MAKER_TS>>>');
  lines.push('No other sections.');
  lines.push('maker.ts requirements:');
  lines.push(`- maker.ts must use solution: '${context.solutionFile}' exactly`);
  lines.push('- use only APIs present in the Genesis contract');
  lines.push('- if the contract does not provide a helper, write plain TypeScript instead of inventing a Genesis API');
  lines.push('- maker.ts must be executable by the local Genesis runner without manual edits');

  if (context.needSolution) {
    lines.push(`${languageHint[context.lang]} Save it as ${context.solutionFile}.`);
  } else {
    lines.push(`A reference solution is already provided as ${context.solutionFile}. maker.ts must match it exactly.`);
    lines.push('If the statement feels ambiguous, prefer the provided reference solution semantics over your own reinterpretation.');
  }

  lines.push('Genesis contract declaration file begins:');
  lines.push(context.contract);
  lines.push('Genesis contract declaration file ends.');

  if (context.solutionSource) {
    lines.push(`Reference solution source (${context.solutionFile}) begins:`);
    lines.push(context.solutionSource);
    lines.push('Reference solution source ends.');
  }

  lines.push('Problem statement begins:');
  lines.push(context.statement);
  lines.push('Problem statement ends.');

  return lines.join('\n');
}

function buildRepairPrompt(
  context: PromptContext,
  previous: Draft,
  issues: readonly MakerIssue[],
): string {
  const lines = [
    'The previous answer failed local validation or generation. Fix it.',
    'The Genesis contract below is a TypeScript declaration file. Treat it as the only API truth.',
    'Output exactly the same required sections, each marker on its own line.',
  ];

  if (context.needSolution) {
    lines.push('<<<SOLUTION_CODE>>>');
  }
  lines.push('<<<MAKER_TS>>>');
  lines.push('No other sections.');
  lines.push(`Reference solution file must stay '${context.solutionFile}'.`);
  lines.push('Local issues:');
  for (const issue of issues) {
    lines.push(`- [${issue.code}] ${issue.message}`);
  }
  lines.push('Fix the issues strictly according to the Genesis contract and the statement semantics.');

  lines.push('Genesis contract declaration file begins:');
  lines.push(context.contract);
  lines.push('Genesis contract declaration file ends.');

  if (context.solutionSource) {
    lines.push(`Reference solution source (${context.solutionFile}) begins:`);
    lines.push(context.solutionSource);
    lines.push('Reference solution source ends.');
  }

  if (context.needSolution) {
    lines.push('Previous solution code begins:');
    lines.push(previous.solutionCode ?? '');
    lines.push('Previous solution code ends.');
  }

  lines.push('Previous maker.ts begins:');
  lines.push(previous.makerTs);
  lines.push('Previous maker.ts ends.');
  lines.push('Problem statement begins:');
  lines.push(context.statement);
  lines.push('Problem statement ends.');

  return lines.join('\n');
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function materializeLocalGenesisPackage(jobDir: string): Promise<void> {
  const packageDir = path.join(jobDir, 'node_modules', 'genesis-kit');
  const sourceIndex = path.resolve(__dirname, '..', 'src', 'index.ts');
  const relativeSourceIndex = path.relative(packageDir, sourceIndex).split(path.sep).join('/');
  const packageJson = {
    name: 'genesis-kit',
    private: true,
    type: 'module',
    exports: {
      '.': './index.ts',
    },
  };

  await ensureDir(packageDir);
  await fs.writeFile(path.join(packageDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    path.join(packageDir, 'index.ts'),
    `export * from ${JSON.stringify(relativeSourceIndex.startsWith('.') ? relativeSourceIndex : `./${relativeSourceIndex}`)};\n`,
    'utf8',
  );
}

async function materializeRuntimeMaker(jobDir: string, makerTs: string): Promise<string> {
  const runtimeImportUrl = pathToFileURL(path.resolve(__dirname, '..', 'src', 'index.ts')).href;
  const runtimeMakerTs = makerTs.replace(
    /from\s*(['"])genesis-kit\1/g,
    `from ${JSON.stringify(runtimeImportUrl)}`,
  );
  const runtimePath = path.join(jobDir, '.maker.runtime.ts');
  await fs.writeFile(runtimePath, `${runtimeMakerTs.trim()}\n`, 'utf8');
  return runtimePath;
}

function lintMakerTs(
  code: string,
  solutionFile: string,
): MakerIssue[] {
  const issues: MakerIssue[] = [];
  const allowedFmtMethods = new Set(Object.keys(AI_FMT_METHOD_SIGNATURES));
  const allowedGeneratorMethods = new Set(Object.keys(AI_GENERATOR_METHOD_SIGNATURES));
  const allowedBaseMethods = new Set(Object.keys(AI_BASE_METHOD_SIGNATURES));
  const allowedCharsetProperties = new Set(Object.keys(AI_CHARSET_PROPERTIES));
  const allowedGeneratorPropertyRoots = new Set(['CHARSET', 'base']);

  if (!/import\s*{\s*[^}]*\bdefineDataset\b[^}]*\bfmt\b[^}]*}\s*from\s*['"]genesis-kit['"]/.test(code)) {
    issues.push(issue('import-rule', "maker.ts must import defineDataset and fmt from 'genesis-kit'"));
  }
  if (/^\s*import\s.+from\s+['"](?!genesis-kit['"]).+['"]\s*;?\s*$/m.test(code)) {
    issues.push(issue('import-rule', "maker.ts must not import modules other than 'genesis-kit'"));
  }

  if (!/export\s+default\s+defineDataset\s*</.test(code) && !/export\s+default\s+defineDataset\s*\(/.test(code)) {
    issues.push(issue('dataset-shape', 'maker.ts must export default defineDataset(...)'));
  }
  if (!/solution\s*:\s*['"`][^'"`]+['"`]/.test(code)) {
    issues.push(issue('solution', 'maker.ts must define solution'));
  } else if (!new RegExp(`solution\\s*:\\s*['"\`]${escapeRegExp(solutionFile)}['"\`]`).test(code)) {
    issues.push(issue('solution', `maker.ts solution must be '${solutionFile}'`));
  }
  if (!/seed\s*:/.test(code)) issues.push(issue('seed', 'maker.ts must define seed'));
  if (!/format\s*:/.test(code)) issues.push(issue('format', 'maker.ts must define format'));
  if (!/cases\s*:/.test(code)) issues.push(issue('cases', 'maker.ts must define cases'));
  if (/output\s*:/.test(code)) issues.push(issue('case-output', 'cases must not define output'));
  if (/fmt`/.test(code)) issues.push(issue('legacy-fmt', 'legacy fmt template syntax is not allowed'));
  if (/g\.pick\(/.test(code)) issues.push(issue('legacy-generator', 'g.pick is not available; use g.sample'));
  if (/\bG\./.test(code)) issues.push(issue('legacy-generator', 'maker.ts must not use G. Use the per-case generate() context g instead'));
  if (/\b(?:Maker|Checker)\b/.test(code)) issues.push(issue('legacy-api', 'maker.ts must not use legacy Maker or Checker APIs'));

  issues.push(...scanUnsupportedMethodCalls(code, 'fmt', allowedFmtMethods, 'fmt', 'unsupported-fmt-method'));
  issues.push(...scanUnsupportedMethodCalls(code, 'g', allowedGeneratorMethods, 'g', 'unsupported-generator-method'));
  issues.push(...scanUnsupportedMethodCalls(code, 'g.base', allowedBaseMethods, 'g.base', 'unsupported-base-method'));
  issues.push(...scanUnsupportedPropertyRoots(code, allowedGeneratorPropertyRoots));
  issues.push(...scanUnsupportedCharsetProperties(code, allowedCharsetProperties));

  return issues;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function issue(code: string, message: string): MakerIssue {
  return { code, message };
}

function formatIssues(issues: readonly MakerIssue[]): string {
  return issues.map(({ code, message }) => `[${code}] ${message}`).join(' | ');
}

function normalizeIssues(error: unknown, fallbackCode: string): MakerIssue[] {
  if (error instanceof AiWorkflowError) {
    return error.issues;
  }

  const message = error instanceof Error ? error.message : String(error);
  return [issue(fallbackCode, message)];
}

function scanUnsupportedMethodCalls(
  code: string,
  objectPath: string,
  allowed: Set<string>,
  label: string,
  codeName: string,
): MakerIssue[] {
  const methods = new Set<string>();
  const regex = new RegExp(`\\b${escapeRegExp(objectPath)}\\.([A-Za-z_$][\\w$]*)\\s*\\(`, 'g');

  for (const match of code.matchAll(regex)) {
    const method = match[1];
    if (!method || allowed.has(method)) continue;
    methods.add(method);
  }

  return [...methods].map(method => issue(codeName, `${label}.${method} is not available in the Genesis contract for this problem`));
}

function scanUnsupportedPropertyRoots(
  code: string,
  allowedRoots: Set<string>,
): MakerIssue[] {
  const roots = new Set<string>();
  const regex = /\bg\.([A-Za-z_$][\w$]*)\./g;

  for (const match of code.matchAll(regex)) {
    const root = match[1];
    if (!root || allowedRoots.has(root)) continue;
    roots.add(root);
  }

  return [...roots].map(root => issue('unsupported-generator-root', `g.${root} is not available in the Genesis contract for this problem`));
}

function scanUnsupportedCharsetProperties(
  code: string,
  allowedProperties: Set<string>,
): MakerIssue[] {
  const properties = new Set<string>();
  const regex = /\bg\.CHARSET\.([A-Za-z_$][\w$]*)\b/g;

  for (const match of code.matchAll(regex)) {
    const property = match[1];
    if (!property || allowedProperties.has(property)) continue;
    properties.add(property);
  }

  return [...properties].map(property => issue('unsupported-charset', `g.CHARSET.${property} is not available in the Genesis contract for this problem`));
}

function formatFailures(result: DatasetRunResult): string {
  const failed = result.results
    .filter(item => item.status === 'failure')
    .slice(0, 5)
    .map(item => {
      const phase = item.error?.phase ?? 'unknown';
      const kind = item.error?.kind ?? 'unknown';
      const suffix = item.repeatIndex > 0 ? ` repeat=${item.repeatIndex}` : '';
      return `#${item.caseNumber} ${item.name}${suffix} phase=${phase} kind=${kind}: ${item.error?.message ?? 'failed'}`;
    });

  if (failed.length === 0) {
    return `dataset generation failed: ${result.summary.failed} case(s) failed`;
  }

  return failed.join(' | ');
}

async function materializeAndRun(params: {
  jobDir: string;
  contract: string;
  statement: string;
  solutionFile: string;
  providedSolutionPath?: string;
  providedSolutionSource?: string;
  draft: Draft;
}): Promise<DatasetRunResult> {
  const lintIssues = lintMakerTs(params.draft.makerTs, params.solutionFile);
  if (lintIssues.length > 0) {
    throw new AiWorkflowError(lintIssues);
  }

  const makerPath = path.join(params.jobDir, 'maker.ts');
  await ensureDir(params.jobDir);
  await fs.writeFile(path.join(params.jobDir, 'problem.md'), `${params.statement.trim()}\n`, 'utf8');
  await fs.writeFile(path.join(params.jobDir, 'genesis-contract.d.ts'), `${params.contract.trim()}\n`, 'utf8');
  await fs.writeFile(makerPath, `${params.draft.makerTs.trim()}\n`, 'utf8');
  await materializeLocalGenesisPackage(params.jobDir);
  const runtimeMakerPath = await materializeRuntimeMaker(params.jobDir, params.draft.makerTs);

  const solutionTarget = path.join(params.jobDir, params.solutionFile);
  if (params.providedSolutionPath) {
    await fs.copyFile(path.resolve(params.providedSolutionPath), solutionTarget);
  } else {
    await fs.writeFile(solutionTarget, `${(params.draft.solutionCode ?? '').trim()}\n`, 'utf8');
  }

  if (params.providedSolutionSource) {
    await fs.writeFile(path.join(params.jobDir, 'solution.source.txt'), `${params.providedSolutionSource.trim()}\n`, 'utf8');
  }

  const runtimeDataset = await loadDatasetFromFile(runtimeMakerPath);
  const validation = await validateDataset(runtimeDataset, { datasetFile: makerPath });
  if (validation.summary.failed > 0) {
    throw new AiWorkflowError([
      issue('dataset-validation', `dataset validation failed: ${formatFailures(validation)}`),
    ]);
  }

  const result = await generateDataset(runtimeDataset, { datasetFile: makerPath });
  if (result.summary.failed > 0) {
    throw new AiWorkflowError([
      issue('dataset-generation', `dataset generation failed: ${formatFailures(result)}`),
    ]);
  }
  return result;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!apiKey && !options.mockResponseFile) {
    throw new Error('Set OPENAI_API_KEY or ASXS_API_KEY before running examples/ai-maker.ts');
  }

  const statement = await readStatement(options);
  if (!statement) {
    throw new Error('Problem statement is empty.');
  }

  const contract = renderAiGenesisContractDts().trim();
  const jobName = normalizeJobName(options.name);
  const jobDir = path.join(path.resolve(options.jobRoot), jobName);
  const needSolution = !options.solutionPath;
  const solutionFile = options.solutionPath
    ? path.basename(options.solutionPath)
    : solutionFileByLang[options.lang];
  const solutionSource = options.solutionPath
    ? (await fs.readFile(path.resolve(options.solutionPath), 'utf8')).trim()
    : undefined;

  await ensureDir(jobDir);
  console.log(`jobDir=${jobDir}`);
  console.log(`model=${options.model}`);
  console.log(`solution=${solutionFile}${needSolution ? ' (AI)' : ' (provided)'}`);
  if (options.mockResponseFile) {
    console.log(`mockResponse=${path.resolve(options.mockResponseFile)}`);
  }

  const promptContext: PromptContext = {
    contract,
    statement,
    solutionFile,
    solutionSource,
    needSolution,
    lang: options.lang,
  };

  let previous: Draft | undefined;
  let lastIssues: MakerIssue[] = [];
  let finalResult: DatasetRunResult | null = null;

  for (let attempt = 0; attempt <= options.repair; attempt++) {
    const prompt = attempt === 0
      ? buildInitialPrompt(promptContext)
      : buildRepairPrompt(promptContext, previous!, lastIssues);

    console.log(`ai attempt ${attempt + 1}/${options.repair + 1}`);
    const raw = await requestTextWithMock({
      model: options.model,
      prompt,
      mockResponseFile: options.mockResponseFile,
    });
    await fs.writeFile(path.join(jobDir, `response.attempt-${attempt + 1}.txt`), `${raw.trim()}\n`, 'utf8');

    let draft: Draft;
    try {
      draft = parseDraft(raw, needSolution);
    } catch (error) {
      lastIssues = normalizeIssues(error, 'parse-sections');
      console.log(`attempt failed: ${formatIssues(lastIssues)}`);
      continue;
    }

    previous = draft;

    try {
      finalResult = await materializeAndRun({
        jobDir,
        contract,
        statement,
        solutionFile,
        providedSolutionPath: options.solutionPath,
        providedSolutionSource: solutionSource,
        draft,
      });
      break;
    } catch (error) {
      lastIssues = normalizeIssues(error, 'local-run');
      console.log(`attempt failed: ${formatIssues(lastIssues)}`);
    }
  }

  if (!finalResult || finalResult.summary.failed > 0) {
    throw new Error(`AI workflow failed after ${options.repair + 1} attempt(s): ${formatIssues(lastIssues)}`);
  }

  console.log(`ok: ${path.join(jobDir, 'maker.ts')}`);
  if (finalResult.manifest) {
    console.log(`manifest=${finalResult.manifest.dataset.manifestPath}`);
  }
  console.log(`cases=${finalResult.summary.totalCases}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
