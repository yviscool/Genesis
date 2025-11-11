// build.ts
import { build as tsdownBuild } from 'tsdown'
import path from 'path'

/**
 * Config
 */
const OUT_DIR = 'dist'
const BUN_OUT_DIR = path.join(OUT_DIR, 'bun')

/**
 * external: Dependencies that should not be bundled.
 * 'typescript' is a peer dependency.
 */
const EXTERNAL = ['typescript']

/**
 * Build Step 1: Library (CJS + ESM) & Static Assets
 */
console.log('🔧 Building library (CJS + ESM) and copying assets with tsdown...')
try {
  await tsdownBuild({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    outDir: OUT_DIR,
    // --- CHANGE 1: Use dts object to resolve into a single .d.ts file ---
    dts: {
      resolve: true,
    },
    sourcemap: true,
    clean: true,
    minify: false,
    external: EXTERNAL,
    copy: [
      { from: 'src/locales', to: 'dist/locales' }
    ],
    // --- CHANGE 2: Customize output extensions to match package.json ---
    outExtensions: ({ format }) => ({
      js: format === 'cjs' ? '.js' : '.mjs',
    }),
  })
  console.log('✅ Library build and asset copy complete')
} catch (err) {
  console.error('❌ Library build failed:', err)
  throw err
}

/**
 * Build Step 2: CLI (ESM)
 */
console.log('🔧 Building CLI with tsdown...')
try {
  await tsdownBuild({
    entry: { 'cli': 'src/cli/index.ts' },
    format: ['esm'],
    outDir: OUT_DIR,
    dts: false,
    sourcemap: false,
    clean: false,
    minify: true,
    external: EXTERNAL,
    // --- CHANGE 3: Force CLI output to be .js for the `bin` field ---
    // Node.js will treat this as an ES Module because "type": "module" is in package.json
    outExtensions: () => ({
      js: '.js'
    }),
  })
  console.log('✅ CLI build complete')
} catch (err) {
  console.error('❌ CLI build failed:', err)
  throw err
}

/**
 * Bun optimized build (Library only)
 */
if (process.versions.bun) {
  console.log('⚡ Detected Bun runtime — building Bun optimized bundle with tsdown...')
  try {
    await tsdownBuild({
      entry: ['./src/index.ts'],
      outDir: BUN_OUT_DIR,
      minify: true,
      platform: 'node', // Suitable for Bun
      sourcemap: true,
      external: EXTERNAL,
      clean: true,
      // --- CHANGE 4: Force Bun output to be .js to match `exports` field ---
      outExtensions: () => ({
        js: '.js'
      }),
    })
    console.log('✅ Bun build complete')
  } catch (err) {
    console.error('❌ Bun build failed:', err)
    throw err
  }
}

console.log('🎉 All builds finished. Output ->', OUT_DIR)