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

## CLI

```bash
genesis validate --file make.ts
```

加载模块默认导出，展开所有 case，生成输入对象，渲染 `fmt.*`，执行 `validate`。

```bash
genesis make --file make.ts
```

清理并重建 `outputDir`，运行标程，写入编号 `.in/.out` 文件，并生成 manifest v2。

```bash
genesis replay --file make.ts --case 7
genesis replay --file make.ts --name random-small --repeat 2 --output-dir replay
```

只重放一个展开后的 case。case 编号遵守数据集的 `startFrom`；`repeat` 下标从 0 开始。

## Manifest V2

schema 以 `genesis-kit/manifest.schema.json` 发布。

manifest 会记录：

- `tool`：包名和版本。
- `dataset`：数据集模块路径、标程、输出目录、root seed、编译配置、manifest 路径。
- `execution`：运行命令、可执行文件路径和执行指纹。
- `replay`：重放时被选中的 case 信息。
- `summary`：总数、成功数、失败数和耗时。
- `cases`：case 编号、名称、repeat 下标、标签、派生 seed、阶段耗时、校验状态、输入输出 hash 和结构化错误阶段。

## API 规则

- 始终导出 `export default defineDataset(...)`。
- 始终设置稳定 `seed`，不要使用时间种子。
- 始终使用 `fmt.*`；v2 会拒绝旧式裸嵌套数组作为 `format()` 返回值。
- 静态数据使用 `input`，生成数据使用 `generate`。
- `repeat` 只允许用于生成 case。
- 在 `validate` 中检查题面约束，失败时不会写入该 case 产物。
- 在 `generate({ g })` 中使用上下文提供的 per-case 生成器，它是隔离且可重放的。

## 发布检查

```bash
bun run release:check
```

该命令会运行测试、构建 CJS/ESM/CLI 产物，用构建后的 Node CLI 实测 `init`、`validate`、`make`、`replay`，验证 CJS/ESM 导入，并执行 `npm pack --dry-run`。
