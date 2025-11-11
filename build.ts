// build.ts
import { build as tsupBuild } from 'tsup'
import { $ } from 'bun'
import path from 'path'

/**
 • Config

 */
const OUT_DIR = 'dist'
const BUN_OUT_DIR = path.join(OUT_DIR, 'bun')

/**
 • external: Dependencies that should not be bundled.

 • 'typescript' is a peer dependency.

 */
const EXTERNAL = ['typescript']

/**
 • Clean

 */
console.log('🧹 Cleaning', OUT_DIR)
try {
  await $`rm -rf ${OUT_DIR}`
} catch (err) {
  console.warn('warning: rm -rf failed', err)
}

/**
 • Build Step 1: Library (CJS + ESM)

 • Bundles the library code from src/index.ts.

 */
console.log('🔧 Building library (CJS + ESM) with tsup...')
try {
  await tsupBuild({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    outDir: OUT_DIR,
    dts: true,
    sourcemap: true,
    clean: false,
    minify: false,
    splitting: false,
    bundle: true, // Bundle the library into single files
    external: EXTERNAL
  })
  console.log('✅ Library build complete')
} catch (err) {
  console.error('❌ Library build failed:', err)
  throw err
}

/**
 • Build Step 2: CLI (ESM)

 • Bundles the CLI code from src/cli.ts into a single executable file.

 */
console.log('🔧 Building CLI with tsup...')
try {
  await tsupBuild({
    entry: { 'cli': 'src/cli/index.ts' },
    format: ['esm'],
    outDir: OUT_DIR,
    dts: false,
    sourcemap: false,
    clean: false,
    minify: true,
    splitting: false,
    bundle: true, // Bundle the CLI and its dependencies
    external: EXTERNAL,
  })
  console.log('✅ CLI build complete')
} catch (err) {
  console.error('❌ CLI build failed:', err)
  throw err
}


await $`tsc --project tsconfig.dts.json`

/**
 • Bun optimized build (Library only)

 • - Outputs to dist/bun

 */
if (process.versions.bun) {
  console.log('⚡ Detected Bun runtime — building Bun optimized bundle...')
  try {
    await (Bun as any).build({
      entrypoints: ['./src/index.ts'],
      outdir: BUN_OUT_DIR,
      minify: {
        whitespace: true,
        syntax: true,
        identifiers: false
      },
      target: 'bun',
      sourcemap: 'linked',
      external: EXTERNAL
    })
    console.log('✅ Bun build complete')
  } catch (err) {
    console.error('❌ Bun build failed:', err)
    throw err
  }
}

console.log('🎉 All builds finished. Output ->', OUT_DIR)


/**
 * 步骤 X: 复制静态资源 (locales)
 * tsup 不会打包 .json 文件，所以我们手动复制
 */
console.log('📂 Copying static assets (locales)...');
try {
  const LOCALE_SRC = path.join('src', 'locales');
  const LOCALE_DEST = path.join(OUT_DIR, 'locales');

  // 1. 创建目标目录
  await $`mkdir -p ${LOCALE_DEST}`;

  // 2. 复制所有 .json 文件
  await $`cp ${LOCALE_SRC}/*.json ${LOCALE_DEST}/`;

  console.log('✅ Static assets copied');
} catch (err) {
  console.error('❌ Failed to copy static assets:', err);
  throw err;
}

console.log('🎉 All builds finished. Output ->', OUT_DIR);
process.exit()