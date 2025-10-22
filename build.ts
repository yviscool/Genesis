// build.ts
import { build as tsupBuild } from 'tsup'
import { $ } from 'bun'
import path from 'path'

/**
 * Config
 */
const OUT_DIR = 'dist'
const BUN_OUT_DIR = path.join(OUT_DIR, 'bun')

/**
 * external: 不希望被打包进最终产物的依赖（peerDependencies/大依赖）
 * 根据项目实际情况添加，比如 'typescript'、'es-toolkit' 等（如果你希望外部依赖由用户安装）
 */
const EXTERNAL = ['typescript']

/**
 * Clean
 */
console.log('🧹 Cleaning', OUT_DIR)
try {
  await $`rm -rf ${OUT_DIR}`
} catch (err) {
  // 若 rm 失败也继续（容错）
  console.warn('warning: rm -rf failed', err)
}

/**
 * Node build (cjs + esm) with declarations
 * tsup 的 dts: true 会自动生成 .d.ts（需项目安装 typescript）
 */
console.log('🔧 Building Node (CJS + ESM) with tsup...')
try {
  await tsupBuild({
    entry: ['src/**/*.ts'],
    format: ['cjs', 'esm'],
    outDir: OUT_DIR,
    dts: true,           // 生成类型声明文件 (.d.ts)
    sourcemap: true,
    clean: false,        // 我们前面已经手动清理过 dist
    minify: false,       // 根据需要可以改为 true
    splitting: false,
    bundle: false,
    external: EXTERNAL
  })
  console.log('✅ Node build complete')
} catch (err) {
  console.error('❌ Node build failed:', err)
  // 非零退出码，CI 会失败
  throw err
}

await $`tsc --project tsconfig.dts.json`

/**
 * Bun optimized build
 * - 输出到 dist/bun
 */
  console.log('⚡ Detected Bun runtime — building Bun optimized bundle...')
  try {
    // Bun.build options
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

console.log('🎉 All builds finished. Output ->', OUT_DIR)
process.exit()
