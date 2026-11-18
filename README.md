# Genesis

Genesis 是面向算法竞赛的 AI-first 确定性数据集生成工具。v2 是刻意破坏兼容的版本：公开工作流统一为默认导出的 `defineDataset()` 对象、显式 `fmt.*` 格式化、每个 case 独立确定性随机源、干运行校验、单点重放和 manifest v2。

## 安装

```bash
npm install -D genesis-kit
```

## 快速开始

```bash
genesis init --lang cpp
genesis validate
genesis make
genesis replay --case 2
```

`genesis validate` 不会删除 `outputDir`，不会编译或运行标程，也不会写入产物。`genesis make` 写入 `.in`、`.out` 和 manifest。`genesis replay` 默认把一个指定 case 重放到 `outputDir/replay`。

## make.ts

```ts
import { defineDataset, fmt } from 'genesis-kit';

type Input = {
  n: number;
  a: number[];
};

export default defineDataset<Input>({
  solution: 'std.cpp',
  outputDir: 'data',
  seed: 20260505,

  format: ({ n, a }) => fmt.lines(
    fmt.line(n),
    fmt.line(...a),
  ),

  validate: ({ n, a }) =>
    a.length === n || 'a.length must equal n',

  cases: [
    { name: 'sample', input: { n: 3, a: [1, 2, 3] } },
    {
      name: 'random-small',
      repeat: 5,
      generate: ({ g }) => {
        const n = g.int(1, 20);
        return { n, a: g.array(n, () => g.int(1, 1000)) };
      },
    },
  ],
});
```

## 格式化：按形态选 API

| 输入形态 | 写法 |
|---|---|
| 表头 + 矩阵（最常见） | `fmt.rows(edges, { header: [n, edges.length] })` |
| 一行装下整个数组 | `fmt.lines(fmt.line(n), fmt.flat(a))` |
| 记录之间空一行 | `fmt.block(recordA, recordB)` 或 `fmt.seq(nodes, '\n\n')` |
| 自定义分隔符 | `fmt.join('', '(', a, ',', b, ')')` |
| 无空格元组 | `fmt.tuple(3, 1)` → `(3,1)` |
| 字符网格 | `fmt.grid(rows)` |
| 上面都表达不了 | `fmt.raw(text)` |

`fmt.line` / `fmt.table` 也接受 `sep`（`fmt.table(rows, { sep: '' })` 可渲染 `.#` 这类无分隔网格）。

## 声明式约束

```ts
constraints: {
  n: { int: true, min: 1, max: N_MAX },
  edges: { minLen: 1, maxLen: M_MAX },
  'edges[*][0]': { int: true, min: 1, ref: 'n' },
  'edges[*][2]': { int: true, min: 1, max: W_MAX },
},
```

支持的键：`int` `min` `max` `ref` `eq` `len` `minLen` `maxLen` `oneOf`。

- `ref: 'n'`：上界取另一个字段的值（`value <= input.n`）。
- `eq: 'm'` / `len: 'm'`：与另一个字段等值 / 等长。
- `'xs[*]'`：展开每个元素；空数组视为真空满足（同 `xs.every(...)`）。

`constraints` 在 `validate` 之前执行，失败信息带解析后的路径
（如 `edges[1][1] = 9 exceeds maximum n=3`）。跨字段语义检查（连通性、去重、单调性、
`n*(n-1)/2` 这类派生量）仍然写在 `validate` 里。

## 类型检查

```bash
bun run typecheck        # tsrs --noEmit
bun run typecheck:fast   # tsrs --noEmit --fast
```

类型检查用 [tsrs](https://github.com/oxc-project/tsrs)（Rust 版 TypeScript 7 编译器）。
AI 契约的生成用 [oxc-parser](https://www.npmjs.com/package/oxc-parser) 直接解析源码，
不再依赖 `typescript` 编译器 API。

## CLI

```bash
genesis validate --file make.ts
```

加载模块默认导出，展开所有 case，生成输入对象，渲染 `fmt.*`，执行 `validate`。

```bash
genesis make --file make.ts
```

清理并重建 `outputDir`，运行标程，写入编号 `.in/.out` 文件，并生成 manifest。

```bash
genesis make --only 3 --prune          # 只重跑第 3 组，并清掉已废弃的编号文件
genesis make --only 2,5-7,sample       # 编号、区间、case 名混用
genesis make --from 10 --to 20 --jobs 4
genesis make --resume                  # 跳过产物仍然有效的 case
```

部分运行时**不会**清空 `outputDir`（否则 `--only 3` 会删掉其它组），manifest 仍保持完整：
未参与本次运行的 case 从上一份 manifest 继承。

| 选项 | 作用 |
|---|---|
| `--only <spec>` | 只跑指定 case：编号、区间 `3-5`、case 名，逗号分隔 |
| `--from` / `--to` | 按 case 编号区间裁剪 |
| `--resume` | 跳过产物与 manifest 一致的 case；**maker / std 变更时自动失效** |
| `--prune` | 删除不属于任何已声明 case 的编号 `.in` / `.out` |
| `--jobs <n>` | 覆盖 `caseConcurrency` |

```bash
genesis check
```

只读。比对 manifest 里记录的 `maker` / `std` 指纹、逐 case 的 `.in/.out` sha256、
case 数量与目录里的孤立编号文件，输出结构化漂移报告。退出码非 0 表示数据已过期。
**改一行 `make.ts` 就能知道哪些数据失效了，不用重跑 2 GB。**

```bash
genesis lint
genesis lint --all testdata
```

用 `oxc-parser` 做 AST 级契约检查。关键点：`g` 只在 `generate` 回调里才是注入的生成器，
所以 `format: ({ n, m, g }) => g.join(' ')` 里的 `g` 是题目数据字段，不会被误判。
错误带 `文件:行:列`。

```bash
genesis replay --file make.ts --case 7
genesis replay --file make.ts --name random-small --repeat 2 --output-dir replay
```

只重放一个展开后的 case。case 编号遵守数据集的 `startFrom`；`repeat` 下标从 0 开始。

## Manifest V3

schema 以 `genesis-kit/manifest.schema.json` 发布。

```jsonc
{
  "version": 3,
  "pathBase": "manifest",          // 下面所有路径都相对 manifest 自身所在目录
  "dataset": {
    "modulePath": "make.ts",
    "solution": "std.py",
    "outputDir": ".",
    "manifestPath": "genesis-manifest.json"
  },
  "sources": {
    "maker":    { "path": "make.ts", "sha256": "…", "bytes": 3854 },
    "solution": { "path": "std.py",  "sha256": "…", "bytes": 1204 }
  },
  "execution": {
    "runtime": "python3",
    "runArgs": ["python3", "std.py"],
    "executablePath": "std.py",
    "fingerprint": "…"
  },
  "replay": null,
  "summary": { "totalCases": 12, "succeeded": 12, "failed": 0, "durationMs": 1951 },
  "cases": [ /* 编号、名称、seed、耗时、校验状态、文件 sha256、结构化错误 */ ]
}
```

相对 v2 的三处变化，都为了解决实际问题：

- **路径可移植**。v2 存的是绝对路径，而且在「临时目录生成 → 拷回」的流程下指向
  早已删除的 temp 目录，换台机器整份 manifest 就不可读。
- **`sources` 指纹**。v2 只有一个语义不明的 `execution.fingerprint`，
  改了 `make.ts` 无法判断数据是否过期，只能全量重跑。
- **`replay` 有内容**。`genesis replay` 会把选中的 case 和相对输出目录写进去。

迁移旧 manifest 见 `MIGRATION.md`。

## API 规则

- 始终导出 `export default defineDataset(...)`。
- 始终设置稳定 `seed`，不要使用时间种子。
- 始终使用 `fmt.*`；v2 会拒绝旧式裸嵌套数组作为 `format()` 返回值。
- 静态数据使用 `input`，生成数据使用 `generate`。
- `repeat` 只允许用于生成 case。
- 优先用 `constraints` 声明字段范围；`validate` 只写跨字段的语义检查。失败时都不会写入该 case 产物。
- 在 `generate({ g })` 中使用上下文提供的 per-case 生成器，它是隔离且可重放的。
  注意 `g` 只在这个回调里是生成器；`format` / `validate` 里解构出的 `g` 是题目自己的字段。

## 发布检查

```bash
bun run release:check
```

该命令会运行测试、构建 CJS/ESM/CLI 产物，用构建后的 Node CLI 实测 `init`、`validate`、`make`、`replay`，验证 CJS/ESM 导入，并执行 `npm pack --dry-run`。
