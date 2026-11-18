import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

function run(command, args, options = {}) {
  const isWindows = process.platform === 'win32';
  const executable = isWindows && command === 'bun' ? 'cmd.exe' : command;
  const finalArgs = isWindows && command === 'bun'
    ? ['/d', '/s', '/c', [command, ...args].map(quoteWindowsArg).join(' ')]
    : args;
  const result = spawnSync(executable, finalArgs, {
    cwd: options.cwd ?? root,
    stdio: 'inherit',
    env: {
      ...process.env,
      GENESIS_LANG: 'en',
      LANG: 'en_US.UTF-8',
    },
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function runWithRetry(command, args, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      run(command, args);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      console.warn(`Retrying ${command} ${args.join(' ')} after failure (${attempt}/${attempts})...`);
    }
  }
  throw lastError;
}

function quoteWindowsArg(value) {
  return /^[A-Za-z0-9_./:-]+$/.test(value)
    ? value
    : `"${value.replaceAll('"', '\\"')}"`;
}

function runNpm(args) {
  if (process.platform === 'win32') {
    const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    run(process.execPath, [npmCli, ...args]);
    return;
  }

  run('npm', args);
}

/**
 * dist/ is committed so that `bun add github:<user>/<repo>` works — bun blocks the
 * `prepare` lifecycle script for git dependencies. `prepare` would rebuild dist for the
 * npm tarball, but the git tag would still point at whatever was committed, so a release
 * must not go out with a build that lags behind the source.
 *
 * Compares content, not stat. With `core.autocrlf=true` (the Windows default) a freshly
 * written file can show up as ` M` in `git status` while its normalised blob is byte
 * identical to the index — `git diff` is the one that knows the difference.
 */
function assertDistMatchesSource() {
  const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });

  // Not a git checkout (e.g. running from an extracted tarball) — nothing to compare.
  if (git(['rev-parse', '--is-inside-work-tree']).status !== 0) return;

  const changed = git(['diff', '--name-only', '--', 'dist']).stdout?.trim() ?? '';
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', 'dist']).stdout?.trim() ?? '';
  if (!changed && !untracked) return;

  throw new Error(
    `committed dist/ does not match a fresh build — run \`bun run build\` and commit:\n${[changed, untracked]
      .filter(Boolean)
      .join('\n')}`,
  );
}

async function main() {
  const tmpDir = await fs.mkdtemp(path.join(root, '.tmp-release-check-'));

  try {
    run('bun', ['test']);
    runWithRetry('bun', ['run', 'build']);
    assertDistMatchesSource();
    run('node', ['dist/cli.js', '--help']);
    run('node', ['-e', "const kit = require('./dist/index.js'); if (typeof kit.defineDataset !== 'function') process.exit(1);"]);
    run('node', ['--input-type=module', '-e', "const kit = await import('./dist/index.mjs'); if (typeof kit.defineDataset !== 'function') process.exit(1);"]);

    run('node', ['dist/cli.js', 'init', tmpDir, '--lang', 'js', '--force']);
    run('node', ['dist/cli.js', 'validate', '--file', path.join(tmpDir, 'make.ts')]);
    run('node', ['dist/cli.js', 'make', '--file', path.join(tmpDir, 'make.ts')]);
    run('node', ['dist/cli.js', 'replay', '--file', path.join(tmpDir, 'make.ts'), '--case', '2']);

    await fs.access(path.join(tmpDir, 'data.manifest.json'));
    await fs.access(path.join(tmpDir, 'data', '2.in'));
    await fs.access(path.join(tmpDir, 'data', 'replay', '2.in'));

    runNpm(['pack', '--dry-run']);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
