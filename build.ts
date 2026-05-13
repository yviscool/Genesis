import path from 'node:path';
import { build as tsdownBuild } from 'tsdown';

const OUT_DIR = 'dist';
const BUN_OUT_DIR = path.join(OUT_DIR, 'bun');
const EXTERNAL = ['typescript'];

console.log('Building library (CJS + ESM) and copying assets with tsdown...');
try {
  await tsdownBuild({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    outDir: OUT_DIR,
    dts: {
      resolve: true,
    },
    sourcemap: true,
    clean: true,
    minify: false,
    external: EXTERNAL,
    copy: [
      { from: 'src/locales', to: 'dist/locales' },
    ],
    outExtensions: ({ format }) => ({
      js: format === 'cjs' ? '.js' : '.mjs',
    }),
  });
  console.log('Library build and asset copy complete.');
} catch (error) {
  console.error('Library build failed:', error);
  throw error;
}

console.log('Building CLI (CJS) with tsdown...');
try {
  await tsdownBuild({
    entry: { cli: 'src/cli/index.ts' },
    format: ['cjs'],
    outDir: OUT_DIR,
    dts: false,
    sourcemap: false,
    clean: false,
    minify: true,
    external: EXTERNAL,
    outExtensions: () => ({
      js: '.js',
    }),
  });
  console.log('CLI build complete.');
} catch (error) {
  console.error('CLI build failed:', error);
  throw error;
}

if (process.versions.bun) {
  console.log('Detected Bun runtime; building Bun optimized bundle with tsdown...');
  try {
    await tsdownBuild({
      entry: ['./src/index.ts'],
      outDir: BUN_OUT_DIR,
      minify: true,
      platform: 'node',
      sourcemap: true,
      external: EXTERNAL,
      clean: true,
      outExtensions: () => ({
        js: '.js',
      }),
    });
    console.log('Bun build complete.');
  } catch (error) {
    console.error('Bun build failed:', error);
    throw error;
  }
}

console.log('All builds finished. Output ->', OUT_DIR);
