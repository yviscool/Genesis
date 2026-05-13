import fs from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDatasetFromFile, type DatasetRunResult } from '../src/dataset-runner';

type Lang = 'js' | 'cpp' | 'py';

type Options = {
  statementPath?: string;
  name?: string;
  solutionPath?: string;
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.asxs.top/v1').replace(/\/$/, '');
const apiKey = process.env.OPENAI_API_KEY ?? process.env.ASXS_API_KEY;
const defaultJobRoot = path.join(__dirname, '.ai-jobs');
const contractPath = path.join(__dirname, 'ai-genesis-contract.md');

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

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
      response => {
        let data = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          data += chunk;
        });
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`${pathname} failed: ${status} ${data}`));
            return;
          }

          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.setTimeout(30000, () => {
      request.destroy(new Error(`${pathname} timed out after 30s`));
    });
    request.on('error', reject);
    request.write(JSON.stringify(body));
    request.end();
  });
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
  return code
    .replace(/\bg\.pick\(/g, 'g.sample(')
    .trim();
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

function extractSectionBlock(statement: string, headings: string[]): string {
  const lines = statement.split(/\r?\n/);
  const normalized = headings.map(item => item.toLowerCase());
  const collected: string[] = [];
  let active = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = trimmed.replace(/^#+\s*/, '').toLowerCase();

    if (normalized.includes(heading)) {
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

function extractImportantSections(statement: string): string {
  const parts = [
    extractSectionBlock(statement, ['输入格式', 'input format', 'input']),
    extractSectionBlock(statement, ['输出格式', 'output format', 'output']),
    extractSectionBlock(statement, ['数据范围', 'constraints', 'limits']),
  ].filter(Boolean);

  return parts.join('\n\n').trim();
}

function buildInitialPrompt(context: PromptContext): string {
  const highlights = extractImportantSections(context.statement);
  const lines = [
    'Task: given the Genesis contract and the problem statement, generate a correct reference solution if needed and a correct maker.ts.',
    'The user only wants final working outputs.',
    'Think silently. Do not output analysis.',
    'Output exactly these sections, each marker on its own line:',
  ];

  if (context.needSolution) {
    lines.push('<<<SOLUTION_CODE>>>');
  }
  lines.push('<<<MAKER_TS>>>');
  lines.push('No other sections.');
  lines.push('maker.ts requirements:');
  lines.push('- 5 to 10 test cases');
  lines.push('- each case must have a distinct job');
  lines.push('- prefer minimal total size while covering many bug types');
  lines.push('- at most 2 extreme cases');
  lines.push('- random cases must be built on clear structural skeletons, never pure random');
  lines.push('- if limits are missing, infer conservative limits and encode them in validate');
  lines.push(`- maker.ts must use solution: '${context.solutionFile}' exactly`);
  lines.push('- use only APIs present in the Genesis contract');
  lines.push('- do not use nonexistent methods, guessed fields, or legacy syntax');

  if (context.needSolution) {
    lines.push(`${languageHint[context.lang]} Save it as ${context.solutionFile}.`);
  } else {
    lines.push(`A reference solution is already provided as ${context.solutionFile}. maker.ts must match it exactly.`);
  }

  if (highlights) {
    lines.push('Critical I/O and limits excerpt:');
    lines.push(highlights);
  }

  lines.push('Genesis contract begins:');
  lines.push(context.contract);
  lines.push('Genesis contract ends.');

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
  errorMessage: string,
): string {
  const highlights = extractImportantSections(context.statement);
  const lines = [
    'The previous answer failed local validation or generation. Fix it.',
    'Output exactly the same required sections, each marker on its own line.',
  ];

  if (context.needSolution) {
    lines.push('<<<SOLUTION_CODE>>>');
  }
  lines.push('<<<MAKER_TS>>>');
  lines.push('No other sections.');
  lines.push(`Reference solution file must stay '${context.solutionFile}'.`);
  lines.push(`Local error: ${errorMessage}`);
  lines.push('Do not use g.pick(). Use g.sample().');
  lines.push('Do not use case.output.');
  lines.push('Do not use fmt`...`.');

  if (highlights) {
    lines.push('Critical I/O and limits excerpt:');
    lines.push(highlights);
  }

  lines.push('Genesis contract begins:');
  lines.push(context.contract);
  lines.push('Genesis contract ends.');

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

function lintMakerTs(code: string, solutionFile: string): string[] {
  const errors: string[] = [];

  if (!/export\s+default\s+defineDataset\s*</.test(code) && !/export\s+default\s+defineDataset\s*\(/.test(code)) {
    errors.push('maker.ts must export default defineDataset(...)');
  }
  if (!/solution\s*:\s*['"`][^'"`]+['"`]/.test(code)) {
    errors.push('maker.ts must define solution');
  } else if (!new RegExp(`solution\\s*:\\s*['"\`]${escapeRegExp(solutionFile)}['"\`]`).test(code)) {
    errors.push(`maker.ts solution must be '${solutionFile}'`);
  }
  if (!/seed\s*:/.test(code)) errors.push('maker.ts must define seed');
  if (!/format\s*:/.test(code)) errors.push('maker.ts must define format');
  if (!/cases\s*:/.test(code)) errors.push('maker.ts must define cases');
  if (/output\s*:/.test(code)) errors.push('cases must not define output');
  if (/fmt`/.test(code)) errors.push('legacy fmt template syntax is not allowed');
  if (/g\.pick\(/.test(code)) errors.push('g.pick is not available; use g.sample');

  return errors;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatFailures(result: DatasetRunResult): string {
  const failed = result.results
    .filter(item => item.status === 'failure')
    .slice(0, 5)
    .map(item => `${item.name}: ${item.error?.message ?? 'failed'}`);

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
  const lintErrors = lintMakerTs(params.draft.makerTs, params.solutionFile);
  if (lintErrors.length > 0) {
    throw new Error(lintErrors.join(' | '));
  }

  await ensureDir(params.jobDir);
  await fs.writeFile(path.join(params.jobDir, 'problem.md'), `${params.statement.trim()}\n`, 'utf8');
  await fs.writeFile(path.join(params.jobDir, 'genesis-contract.md'), `${params.contract.trim()}\n`, 'utf8');
  await fs.writeFile(path.join(params.jobDir, 'maker.ts'), `${params.draft.makerTs.trim()}\n`, 'utf8');

  const solutionTarget = path.join(params.jobDir, params.solutionFile);
  if (params.providedSolutionPath) {
    await fs.copyFile(path.resolve(params.providedSolutionPath), solutionTarget);
  } else {
    await fs.writeFile(solutionTarget, `${(params.draft.solutionCode ?? '').trim()}\n`, 'utf8');
  }

  if (params.providedSolutionSource) {
    await fs.writeFile(path.join(params.jobDir, 'solution.source.txt'), `${params.providedSolutionSource.trim()}\n`, 'utf8');
  }

  const result = await generateDatasetFromFile(path.join(params.jobDir, 'maker.ts'));
  if (result.summary.failed > 0) {
    throw new Error(formatFailures(result));
  }
  return result;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!apiKey) {
    throw new Error('Set OPENAI_API_KEY or ASXS_API_KEY before running examples/ai-maker.ts');
  }

  const statement = await readStatement(options);
  if (!statement) {
    throw new Error('Problem statement is empty.');
  }

  const contract = (await fs.readFile(contractPath, 'utf8')).trim();
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

  const promptContext: PromptContext = {
    contract,
    statement,
    solutionFile,
    solutionSource,
    needSolution,
    lang: options.lang,
  };

  let previous: Draft | undefined;
  let lastError = '';
  let finalResult: DatasetRunResult | null = null;

  for (let attempt = 0; attempt <= options.repair; attempt++) {
    const prompt = attempt === 0
      ? buildInitialPrompt(promptContext)
      : buildRepairPrompt(promptContext, previous!, lastError);

    console.log(`ai attempt ${attempt + 1}/${options.repair + 1}`);
    const raw = await requestText(options.model, prompt);
    await fs.writeFile(path.join(jobDir, `response.attempt-${attempt + 1}.txt`), `${raw.trim()}\n`, 'utf8');

    let draft: Draft;
    try {
      draft = parseDraft(raw, needSolution);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.log(`attempt failed: ${lastError}`);
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
      lastError = error instanceof Error ? error.message : String(error);
      console.log(`attempt failed: ${lastError}`);
    }
  }

  if (!finalResult || finalResult.summary.failed > 0) {
    throw new Error(`AI workflow failed after ${options.repair + 1} attempt(s): ${lastError}`);
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
