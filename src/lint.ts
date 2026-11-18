import { parseSync } from 'oxc-parser';
import {
  AI_BASE_METHOD_SIGNATURES,
  AI_CHARSET_PROPERTIES,
  AI_FMT_METHOD_SIGNATURES,
  AI_GENERATOR_METHOD_SIGNATURES,
} from './ai-contract';

/**
 * Static contract check for `make.ts` files.
 *
 * The previous implementation was a pile of regexes, which made it both over- and
 * under-sensitive: `format: ({ n, m, g }) => g.join(' ')` was reported as
 * "g.join is not part of the Genesis AI contract" because a local field happened to be
 * called `g`, while `g['join']` slipped through entirely.
 *
 * This version parses the file and resolves what an identifier actually refers to:
 * the generator `g` is only injected inside a `generate` callback, so a `g` destructured
 * by `format` is just the user's own data.
 */

export type LintSeverity = 'error' | 'warning';

export interface LintIssue {
  code: string;
  severity: LintSeverity;
  message: string;
  /** 1-based. */
  line?: number;
  /** 1-based. */
  column?: number;
}

export interface LintOptions {
  /** Used only in messages. */
  filename?: string;
  /** When set, a literal `solution` property must equal this value. */
  expectedSolution?: string | null;
}

export interface LintAllowance {
  fmtMethods: readonly string[];
  generatorMethods: readonly string[];
  baseMethods: readonly string[];
  charsetProperties: readonly string[];
  generatorPropertyRoots: readonly string[];
}

/** The complete v2 contract surface — what a hand-written maker may use. */
export function defaultLintAllowance(): LintAllowance {
  return {
    fmtMethods: Object.keys(AI_FMT_METHOD_SIGNATURES),
    generatorMethods: Object.keys(AI_GENERATOR_METHOD_SIGNATURES),
    baseMethods: Object.keys(AI_BASE_METHOD_SIGNATURES),
    charsetProperties: Object.keys(AI_CHARSET_PROPERTIES),
    generatorPropertyRoots: ['CHARSET', 'base'],
  };
}

/* -------------------------------------------------------------------------- */
/* AST plumbing                                                                */
/* -------------------------------------------------------------------------- */

type AstNode = {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
};

function isNode(value: unknown): value is AstNode {
  return Boolean(value) && typeof value === 'object' && typeof (value as AstNode).type === 'string';
}

/** Fields that either hold positions or would create cycles. */
const SKIP_KEYS = new Set(['type', 'start', 'end', 'loc', 'range', 'parent', 'decorators']);

function childrenOf(node: AstNode): AstNode[] {
  const children: AstNode[] = [];
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) children.push(item);
    } else if (isNode(value)) {
      children.push(value);
    }
  }
  return children;
}

/**
 * Which contract role a subtree plays. `g` is only injected in `generate`, which is the
 * single fact the regex implementation could not know.
 */
type Role = 'format' | 'validate' | 'generate' | 'constraints' | 'other';

const ROLE_BY_KEY: Record<string, Role> = {
  format: 'format',
  validate: 'validate',
  generate: 'generate',
  constraints: 'constraints',
};

function propertyKeyName(node: AstNode): string | null {
  if (node.type !== 'Property' && node.type !== 'ObjectProperty') return null;
  const key = node.key;
  if (!isNode(key)) return null;
  if (key.type === 'Identifier') return String(key.name);
  if (key.type === 'Literal') return typeof key.value === 'string' ? key.value : null;
  return null;
}

function markRoles(node: AstNode, roleByNode: Map<AstNode, Role>): void {
  if (node.type === 'Property' || node.type === 'ObjectProperty') {
    const name = propertyKeyName(node);
    const role = name ? ROLE_BY_KEY[name] : undefined;
    const value = node.value;
    if (role && isNode(value)) {
      markSubtree(value, role, roleByNode);
    }
  }
  for (const child of childrenOf(node)) markRoles(child, roleByNode);
}

function markSubtree(node: AstNode, role: Role, roleByNode: Map<AstNode, Role>): void {
  if (!roleByNode.has(node)) roleByNode.set(node, role);
  for (const child of childrenOf(node)) markSubtree(child, role, roleByNode);
}

/** `a.b.c` → `['a', 'b', 'c']`, or `null` when the chain is not a plain identifier chain. */
function memberChain(node: AstNode): string[] | null {
  if (node.type === 'Identifier') return [String(node.name)];
  if (node.type !== 'MemberExpression') return null;
  if (node.computed) {
    const property = node.property;
    if (!isNode(property) || property.type !== 'Literal' || typeof property.value !== 'string') return null;
    const head = memberChain(node.object as AstNode);
    return head ? [...head, property.value] : null;
  }
  const head = memberChain(node.object as AstNode);
  if (!head) return null;
  const property = node.property;
  if (!isNode(property) || property.type !== 'Identifier') return null;
  return [...head, String(property.name)];
}

function lineStarts(code: string): number[] {
  const starts = [0];
  for (let i = 0; i < code.length; i++) {
    if (code.charCodeAt(i) === 0x0a) starts.push(i + 1);
  }
  return starts;
}

function positionOf(starts: number[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (starts[mid]! <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, column: offset - starts[low]! + 1 };
}

/* -------------------------------------------------------------------------- */
/* Linting                                                                     */
/* -------------------------------------------------------------------------- */

export function lintMakerSource(code: string, options: LintOptions = {}): LintIssue[] {
  const filename = options.filename ?? 'make.ts';
  const parsed = parseSync(filename, code);
  const issues: LintIssue[] = [];
  const starts = lineStarts(code);

  const report = (issue: Omit<LintIssue, 'severity'> & { severity?: LintSeverity }, node?: AstNode) => {
    const severity = issue.severity ?? 'error';
    if (node) {
      const { line, column } = positionOf(starts, node.start);
      issues.push({ ...issue, severity, line, column });
    } else {
      issues.push({ ...issue, severity });
    }
  };

  for (const error of parsed.errors) {
    const { line, column } = positionOf(starts, error.labels?.[0]?.start ?? 0);
    report({
      code: 'syntax',
      message: `Cannot parse ${filename}: ${error.message}`,
      line,
      column,
    });
  }
  if (parsed.errors.length > 0) return issues;

  const allowance = defaultLintAllowance();
  const allowedFmt = new Set(allowance.fmtMethods);
  const allowedGen = new Set(allowance.generatorMethods);
  const allowedBase = new Set(allowance.baseMethods);
  const allowedCharset = new Set(allowance.charsetProperties);
  const allowedRoots = new Set(allowance.generatorPropertyRoots);

  const root = parsed.program as unknown as AstNode;
  const roleByNode = new Map<AstNode, Role>();
  markRoles(root, roleByNode);

  // Names rebound by a `const` / `function`. A parameter named `g` is the injected
  // generator; a *variable* named `g` means the author took over the name, so the whole
  // generator surface is skipped rather than judged against the wrong binding.
  const declared = collectDeclaredNames(root);

  let sawDefineDatasetImport = false;
  let sawFmtImport = false;
  let sawDefaultExport = false;

  const visit = (node: AstNode, role: Role): void => {
    const currentRole = roleByNode.get(node) ?? role;

    if (node.type === 'ImportDeclaration') {
      checkImport(node);
    } else if (node.type === 'ExportDefaultDeclaration') {
      sawDefaultExport = true;
      const declaration = node.declaration;
      if (!isNode(declaration) || declaration.type !== 'CallExpression') {
        report({ code: 'dataset-shape', message: 'export default 必须是 defineDataset(...) 的调用结果。' }, node);
      } else {
        const chain = memberChain(declaration.callee as AstNode);
        if (!chain || chain.join('.') !== 'defineDataset') {
          report({ code: 'dataset-shape', message: 'export default 必须直接调用 defineDataset(...)。' }, declaration);
        } else {
          checkDatasetLiteral(declaration);
        }
      }
    } else if (node.type === 'TaggedTemplateExpression') {
      const chain = memberChain(node.tag as AstNode);
      if (chain && chain[0] === 'fmt' && !declared.has('fmt')) {
        report({ code: 'legacy-fmt', message: '不允许使用旧版 fmt 模板语法，请改用 fmt.line / fmt.rows。' }, node);
      }
    } else if (node.type === 'CallExpression') {
      checkCall(node, currentRole);
    } else if (node.type === 'Identifier') {
      const name = String(node.name);
      if (name === 'Maker' || name === 'Checker') {
        report({ code: 'legacy-api', message: `不允许使用旧版 ${name} API。` }, node);
      }
    }

    for (const child of childrenOf(node)) visit(child, currentRole);
  };

  function checkImport(node: AstNode): void {
    const source = node.source;
    const sourceValue = isNode(source) && source.type === 'Literal' ? source.value : null;
    if (sourceValue !== 'genesis-kit') {
      report({
        code: 'import-rule',
        message: `maker.ts 不允许导入除 'genesis-kit' 之外的模块（发现 '${String(sourceValue)}'）。`,
      }, node);
      return;
    }
    const specifiers = Array.isArray(node.specifiers) ? node.specifiers : [];
    for (const specifier of specifiers) {
      if (!isNode(specifier)) continue;
      const imported = specifier.imported;
      const name = isNode(imported) ? String(imported.name ?? imported.value ?? '') : '';
      if (name === 'defineDataset') sawDefineDatasetImport = true;
      if (name === 'fmt') sawFmtImport = true;
    }
  }

  function checkDatasetLiteral(call: AstNode): void {
    const args = Array.isArray(call.arguments) ? call.arguments : [];
    const first = args[0];
    if (!isNode(first) || first.type !== 'ObjectExpression') return;

    const properties = Array.isArray(first.properties) ? first.properties : [];
    const seen = new Set<string>();
    for (const property of properties) {
      if (!isNode(property)) continue;
      const name = propertyKeyName(property);
      if (!name) continue;
      seen.add(name);
      if (name === 'solution' && options.expectedSolution) {
        const value = property.value;
        const literal = isNode(value) && value.type === 'Literal' ? value.value : null;
        if (typeof literal === 'string' && literal !== options.expectedSolution) {
          report({
            code: 'solution',
            message: `solution 必须精确等于 '${options.expectedSolution}'（发现 '${literal}'）。`,
          }, value as AstNode);
        }
      }
    }

    for (const required of ['solution', 'seed', 'format', 'cases']) {
      if (!seen.has(required)) {
        report({ code: required === 'cases' ? 'cases' : required, message: `defineDataset 缺少 ${required}。` }, call);
      }
    }
  }

  function checkCall(node: AstNode, role: Role): void {
    const callee = node.callee;
    if (!isNode(callee)) return;

    // `require('...')` is not an import statement, but it is still a forbidden dependency.
    if (callee.type === 'Identifier' && String(callee.name) === 'require') {
      report({ code: 'import-rule', message: 'maker.ts 不允许使用 require()。' }, node);
      return;
    }

    const chain = memberChain(callee);
    if (!chain || chain.length < 2) return;
    const [rootName, method, ...rest] = chain;

    if (rootName === 'fmt') {
      if (declared.has('fmt')) return;
      if (rest.length > 0) return;
      if (!allowedFmt.has(method!)) {
        report({
          code: 'fmt-method',
          message: `fmt.${method} 不在当前 Genesis AI 合约可用范围内。可用：${[...allowedFmt].map(name => `fmt.${name}`).join(', ')}`,
        }, callee);
      }
      return;
    }

    if (rootName === 'G') {
      report({ code: 'legacy-generator', message: 'maker.ts 不允许使用旧版全局 G API。' }, callee);
      return;
    }

    if (rootName !== 'g') return;

    // `g` is only the injected generator inside a `generate` callback. Everywhere else it
    // is the author's own variable and must not be judged against the contract.
    if (role !== 'generate') return;
    if (declared.has('g')) return;

    if (method === 'base' && rest.length === 1) {
      if (!allowedBase.has(rest[0]!)) {
        report({
          code: 'base-method',
          message: `g.base.${rest[0]} 不在当前 Genesis AI 合约可用范围内。`,
        }, callee);
      }
      return;
    }

    if (method === 'CHARSET' && rest.length === 1) {
      if (!allowedCharset.has(rest[0]!)) {
        report({
          code: 'unsupported-charset',
          message: `g.CHARSET.${rest[0]} 不在当前 Genesis AI 合约可用范围内。`,
        }, callee);
      }
      return;
    }

    if (rest.length > 0) return;

    if (method === 'pick') {
      report({ code: 'legacy-generator', message: 'g.pick 不可用，请改用 g.sample。' }, callee);
      return;
    }

    if (!allowedGen.has(method!)) {
      report({
        code: 'generator-method',
        message: `g.${method} 不在当前 Genesis AI 合约可用范围内。可用：${[...allowedGen].map(name => `g.${name}`).join(', ')}`,
      }, callee);
    }
  }

  visit(root, 'other');

  if (!sawDefineDatasetImport || !sawFmtImport) {
    const missing = [
      sawDefineDatasetImport ? null : 'defineDataset',
      sawFmtImport ? null : 'fmt',
    ].filter(Boolean).join(' 和 ');
    report({ code: 'import-rule', message: `maker.ts 必须从 'genesis-kit' 导入 ${missing}。` });
  }
  if (!sawDefaultExport) {
    report({ code: 'dataset-shape', message: 'maker.ts 必须 export default defineDataset(...)。' });
  }

  // Root property access (`g.foo.bar`) is a different mistake from calling an unknown
  // method, so report it separately — but only inside `generate`.
  for (const issue of findUnknownGeneratorRoots(root, roleByNode, allowedRoots)) {
    report(issue.issue, issue.node);
  }

  return dedupe(issues);
}

function findUnknownGeneratorRoots(
  root: AstNode,
  roleByNode: Map<AstNode, Role>,
  allowedRoots: Set<string>,
): { issue: Omit<LintIssue, 'severity'>; node: AstNode }[] {
  const found: { issue: Omit<LintIssue, 'severity'>; node: AstNode }[] = [];
  const seen = new Set<string>();

  const visit = (node: AstNode, role: Role) => {
    const currentRole = roleByNode.get(node) ?? role;
    if (node.type === 'MemberExpression' && currentRole === 'generate') {
      const chain = memberChain(node);
      if (chain && chain.length >= 3 && chain[0] === 'g' && !allowedRoots.has(chain[1]!)) {
        const key = chain.slice(0, 2).join('.');
        if (!seen.has(key)) {
          seen.add(key);
          found.push({
            issue: {
              code: 'unsupported-generator-root',
              message: `g.${chain[1]} 不是生成器的合法属性根，只允许 g.base / g.CHARSET。`,
            },
            node,
          });
        }
      }
    }
    for (const child of childrenOf(node)) visit(child, currentRole);
  };

  visit(root, 'other');
  return found;
}

/** Names the file declares itself. A parameter named `g` is the injection; a variable is not. */
function collectDeclaredNames(root: AstNode): Set<string> {
  const names = new Set<string>();
  const addPattern = (pattern: unknown): void => {
    if (!isNode(pattern)) return;
    if (pattern.type === 'Identifier') {
      names.add(String(pattern.name));
      return;
    }
    if (pattern.type === 'ObjectPattern' || pattern.type === 'ArrayPattern') {
      const properties = pattern.properties;
      if (Array.isArray(properties)) {
        for (const property of properties) {
          if (!isNode(property)) continue;
          addPattern(property.value ?? property.argument ?? property);
        }
      }
    }
  };

  const visit = (node: AstNode): void => {
    if (node.type === 'VariableDeclarator') {
      addPattern(node.id);
    } else if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
      if (isNode(node.id)) names.add(String((node.id as AstNode).name));
    }
    for (const child of childrenOf(node)) visit(child);
  };

  visit(root);
  return names;
}

function dedupe(issues: LintIssue[]): LintIssue[] {
  const seen = new Set<string>();
  const result: LintIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.code}|${issue.message}|${issue.line ?? ''}|${issue.column ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(issue);
  }
  return result;
}

/**
 * Runtime counterpart of the source lint: checks the object a `make.ts` actually produced.
 *
 * Source lint cannot see computed keys or values produced by helpers, so the loaded config
 * is verified too.
 */
export function lintDatasetConfig(
  config: Record<string, unknown>,
  options: { expectedSolution?: string | null } = {},
): LintIssue[] {
  const issues: LintIssue[] = [];
  const has = (key: string) => Object.prototype.hasOwnProperty.call(config, key);

  if (!has('solution')) {
    issues.push({ code: 'solution', severity: 'error', message: 'maker.ts 必须定义 solution。' });
  } else if (options.expectedSolution && config.solution !== options.expectedSolution) {
    issues.push({
      code: 'solution',
      severity: 'error',
      message: `maker.ts 中的 solution 必须精确等于 '${options.expectedSolution}'。`,
    });
  }
  if (!has('seed')) issues.push({ code: 'seed', severity: 'error', message: 'maker.ts 必须定义 seed。' });
  if (!has('format')) issues.push({ code: 'format', severity: 'error', message: 'maker.ts 必须定义 format。' });
  if (!has('cases')) {
    issues.push({ code: 'cases', severity: 'error', message: 'maker.ts 必须定义 cases。' });
  } else if (containsOwnKeyDeep(config.cases, 'output')) {
    issues.push({ code: 'case-output', severity: 'error', message: 'cases 中禁止定义 output。' });
  }
  return issues;
}

function containsOwnKeyDeep(value: unknown, key: string, seen = new Set<object>()): boolean {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some(item => containsOwnKeyDeep(item, key, seen));
  if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  return Object.values(value).some(child =>
    typeof child === 'function' ? false : containsOwnKeyDeep(child, key, seen),
  );
}

/** Pretty one-line rendering used by the CLI. */
export function formatLintIssue(issue: LintIssue, filename = 'make.ts'): string {
  const where = issue.line ? `${filename}:${issue.line}:${issue.column ?? 1}` : filename;
  return `${where}  [${issue.code}] ${issue.message}`;
}
