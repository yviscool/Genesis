[English Version](./README.en.md)

# Genesis: 为算法竞赛而生的测试数据生成器

[![npm version](https://img.shields.io/npm/v/genesis-kit.svg)](https://www.npmjs.com/package/genesis-kit)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**Genesis** 是一个为算法竞赛出题人、选手和教练量身打造的、极其简单易用的测试数据生成工具。它将繁琐的编译、数据生成、文件 I/O、对拍验证等流程自动化，让你能专注于**数据本身的设计**，而非过程的实现。

## ✨ 核心特性

* **声明式 API**: 使用链式调用 `.case()` 和 `.run()` 直观地定义数据和对拍，代码结构与逻辑高度一致。
* **内置对拍器 (`Checker`)**: 自动运行标程和待测程序，高保真地对比输出 (Diff)，快速定位 `WA`/`TLE`。
* **强大的数据生成器 (`G`)**: 内置丰富、便捷的生成函数 (`G.int`, `G.permutation`, `G.matrix`, `G.even`, `G.tree`, `G.graph` 等)，满足 99% 的基础数据需求。
* **智能格式化**: 你只需返回结构化的数据（如 `[[n, m], grid]`），Genesis 会自动处理空格和换行，生成符合要求的 `.in` 文件。**无论 `grid` 是数字矩阵还是字符串数组，它都能正确处理！**
* **多语言支持**: 原生支持 **C++, Go, Rust, Java, Python, Node.js** 等多种语言。只需提供源文件，Genesis 会自动处理编译和执行。
* **自动编译与缓存**: 自动探测所需编译器（`g++`, `go`, `rustc` 等），并对标程和解法进行编译。基于文件内容和编译参数的智能缓存机制，源码不变则无需重复编译，极大提升效率。
* **高性能**: 利用 Node.js 的异步特性和多核心 CPU，`Maker` 可并行生成所有测试用例，`Checker` 可高速执行对拍。
* **CLI 工具**: 提供便捷的命令行工具，支持项目初始化、数据生成、对拍验证和清理等操作。
* **跨平台**: 在 Windows (MSYS2/MinGW)、macOS 和 Linux 上均可无缝工作。

## 🚀 快速上手 (Maker 篇)

### CLI 工具

Genesis 提供了便捷的命令行工具，支持以下操作：

```bash
# 初始化一个 C++ 项目 (默认)
genesis init

# 初始化一个 Go 语言项目
genesis init --lang go

# 生成数据
genesis make

# 运行对拍
genesis check

# 清理生成的文件
genesis clean
```

### 1\. 安装

确保你已经安装了 [Node.js](https://nodejs.org/) (v16+) 和 [Bun](https://bun.sh/) (或 `tsx` 用于执行 TypeScript)。

在你的项目目录下，将 Genesis 添加到开发依赖：

```bash
bun add genesis-kit --dev
# 或者使用 npm / yarn / pnpm
# npm install genesis-kit --save-dev
```

### 2\. 编写你的第一个 `make.ts`

以 Go 语言为例，假设你的项目结构如下：

```
.
├── std.go         # 你的 Go 标程
└── make.ts        # 你的数据生成脚本
```

现在，编写 `make.ts` 来生成 A+B Problem 的数据：

```typescript
// make.ts
import { Maker, G } from 'genesis-kit';

// 即使标程是 Go, 数据生成脚本的语法也完全一样
Maker
  .configure({
    solution: 'std.go' // 告诉 Maker 你的标程是哪个文件
  })
  // Case 1: 小数据
  .case('Small Numbers', () => {
    const a = G.int(1, 100);
    const b = G.int(1, 100);
    return [[a, b]]; // -> 会被格式化为 "a b"
  })

  // Case 2-6: 批量生成 5 个随机中等数据
  .cases(5, () => {
    const a = G.int(1000, 100000);
    const b = G.int(1000, 100000);
    return [[a, b]];
  })

  // Case 7: 极限数据
  .case('Max Numbers', () => {
    const a = 1_000_000_000;
    const b = 1_000_000_000;
    return [[a, b]];
  })

  // 启动生成流程!
  .generate();
```

### 3\. 运行

打开终端，执行：

```bash
bun make.ts
# 或者
tsx make.ts
```

**发生了什么？** Genesis 会自动识别出 `std.go` 是一个 Go 程序，找到并调用 `go` 编译器进行编译，然后并行执行 7 个 `case`，最后将输入 (`.in`) 和输出 (`.out`) 保存到 `data/` 目录中。

## 📚 API 参考

Genesis 提供了两大核心工具：`Maker` (用于批量生成数据) 和 `Checker` (用于对拍验证)。

-----

### `Checker` (对拍器) API

`Checker` 是一个自动化的“对拍”工具。它使用同一个数据生成器，分别运行“标准答案”(std) 和“待测解法”(target)，并高保真地对比它们的输出，直到找到第一个错误 (WA / TLE / RE) 为止。

#### 快速上手：`check.ts`

让我们用 `Checker` 来对拍一个 Python 程序。

**准备文件：**

1. `std.py` (A+B, **正确**)
2. `my_buggy.py` (A+B, **有 bug**, 未处理大数)

**编写 `check.ts`:**

```typescript
// check.ts
import { Checker, G } from 'genesis-kit';

Checker
  // 1. 配置
  .configure({
    std: 'std.py',          // (必需) 标程，必须正确
    target: 'my_buggy.py',  // (必需) 你要测试的程序
    
    // (可选) 对比模式
    // 'normalized' (默认): 模拟 OJ 裁决 (忽略行尾空格、忽略空行)
    // 'exact': 严格字节对比
    compareMode: 'normalized'
  })

  // 2. 定义数据生成器
  .gen(() => {
    // 90% 的几率生成 int 安全范围内的数
    if (Math.random() < 0.9) {
      return [[G.int(1e9), G.int(1e9)]];
    }
    // 10% 的几率生成 HACK 数据 (会导致 int 溢出)
    return [[G.int(1.5e9, 2e9), G.int(1.5e9, 2e9)]];
  })

  // 3. (可选) 设置超时
  .timeout(2000) // 仅对 target 生效，单位毫秒

  // 4. 运行
  .run(10000); // 运行 10000 次，或在第一次出错时停止
```

#### `.run()` 流程

当 `.run(N)` 启动时, `Checker` 会：

1. **准备执行**：自动为 `std` 和 `target` 准备执行环境。如果是 C++, Go, Rust 等编译型语言，则会自动编译并缓存。
2. **循环**：开始一个**串行**循环，最多 `N` 次。
3. **生成**：在**每次**循环中，调用 `.gen()` 里的函数生成一组新数据。
4. **执行**：将生成的数据作为 `stdin`，分别运行 `std` 和 `target` 程序。
5. **裁决**：
      * **TLE / RE**：如果 `target` 超时或崩溃 (RE)，立即停止。
      * **WA (Wrong Answer)**：调用高保真对比器 (Diff) 比较 `std` 和 `target` 的 `stdout`。
6. **报告**：
      * **PASSED**：在控制台更新计数，继续下一次循环。
      * **FAILED (WA/TLE/RE)**：**立即停止**，并在控制台打印详细的失败报告（包括输入、标程输出、你的输出）。
      * **保存现场**：自动将导致失败的数据保存到：
          * `_checker_fail.in`
          * `_checker_std.out`
          * `_checker_my.out`

-----

### `Maker` (数据生成器) API

`Maker` 是 `Genesis` 的批量数据生成工具。整个流程的核心是定义一系列的测试用例（Test Cases），然后启动生成。

#### **定义测试点: `.case()` 与 `.cases()`**

这是 `Genesis` 最核心的两个方法，用于定义你想要生成的测试数据。

##### **`.case()`: 创建一个独立的测试点**

每次调用 `.case()` 都会向生成队列中添加**一个**测试任务。最终，这会生成**一组**对应的输入/输出文件（例如 `1.in` 和 `1.out`）。

你提供的生成器函数 `generator` 的返回值，构成了这**一个** `.in` 文件的**全部内容**。

```typescript
// 语法
.case(label: string, generator: () => any) // 带标签，用于在日志中区分
.case(generator: () => any)                // 匿名

// 示例
Maker
  .case('Sample 1', () => { /* ... */ }) // -> 将生成 1.in / 1.out
  .case('Edge Case', () => { /* ... */ }) // -> 将生成 2.in / 2.out
```

##### **`.cases()`: 批量创建多个相似的测试点**

`.cases(N, generator)` 是一个便捷的 API，它等同于将同一个 `generator` 调用 `N` 次的 `.case()`。

这会向队列中添加 **N 个**独立的测试任务，最终生成 **N 组**文件（例如从 `3.in`/`3.out` 一直到 `7.in`/`7.out`）。

生成器函数 `generator` 会被**独立执行 N 次**，每次的执行结果都将用于创建一个全新的 `.in` 文件，确保了数据的随机性和多样性。

```typescript
// 语法
.cases(count: number, generator: () => any)

// 示例
Maker
  .case('Sample', () => { /* ... */ })       // -> 生成 1.in / 1.out
  .cases(5, () => {
    // 这个函数会被独立执行 5 次
    const a = G.int(1, 100);
    const b = G.int(1, 100);
    return [[a, b]];
  })                                       // -> 依次生成 2.in/out, 3.in/out, 4.in/out, 5.in/out, 6.in/out
```

-----

#### **配置与启动**

##### **`.configure(config: GenesisConfig)`**

在调用链的**任意位置**（通常是开头）使用，用于对 `Genesis` 的默认行为进行配置。这是一个可选步骤。

```typescript
Maker.configure({
  solution: 'main.go',    // 指定标程文件名
  outputDir: 'testdata',  // 指定输出目录 (默认: 'data')
  compiler: 'g++-12',     // 为编译型语言手动指定编译器 (默认: 自动探测)
  startFrom: 1,           // 文件编号起始值 (默认: 1)
});
```

##### **`.generate(): Promise<void>`**

**必须在 `Maker` 链式调用的末尾调用**。它会启动整个自动化流程：编译、生成、运行标程、保存文件。

-----

### `G` (Generator) API

`G` 对象提供了一系列开箱即用的数据生成函数。

#### 数字 (Numbers)

| 函数                  | 描述                                           | 示例                                  |
| --------------------- | ---------------------------------------------- | ------------------------------------- |
| `G.int(min, max)`       | 生成 `[min, max]` 内的随机整数。                 | `G.int(1, 10)` -\> `7`                 |
| `G.ints(count, min, max)` | 生成 `count` 个 `[min, max]` 内的整数数组。      | `G.ints(3, 1, 10)` -\> `[2, 9, 4]`     |
| `G.even(min, max)`      | 生成 `[min, max]` 内的随机偶数。                 | `G.even(1, 10)` -\> `6`                |
| `G.odd(min, max)`       | 生成 `[min, max]` 内的随机奇数。                 | `G.odd(1, 10)` -\> `3`                 |
| `G.float(min, max, prec)` | 生成 `[min, max]` 内带 `prec` 位小数的浮点数。 | `G.float(0, 1, 2)` -\> `0.42`          |

#### 字符串 (Strings)

| 函数                     | 描述                               | 示例                                     |
| ------------------------ | ---------------------------------- | ---------------------------------------- |
| `G.string(len, charset)`   | 生成指定长度和字符集的字符串。       | `G.string(5, 'abc')` -\> `"bacaa"`        |
| `G.word(min, max)`         | 生成 `[min, max]` 长度的小写单词。 | `G.word(3, 5)` -\> `"hello"`              |
| `G.words(count, min, max)` | 生成 `count` 个随机单词数组。        | `G.words(2, 3, 5)` -\> `["world", "cup"]` |

#### 数组与结构 (Arrays & Structures)

| 函数                          | 描述                                               | 示例                                       |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------ |
| `G.array(count, fn)`          | 生成 `count` 个元素的数组，元素由 `fn(i)` 生成。     | `G.array(3, i => i*i)` -\> `[0, 1, 4]`      |
| `G.matrix(r, c, fn)`        | 生成 `r`x`c` 矩阵，单元格由 `fn(i, j)` 生成。      | `G.matrix(2,2,() => 0)` -\> `[[0,0],[0,0]]` |
| `G.permutation(n, oneBased?)` | 生成 `n` 的全排列 (默认从 1 开始)。                | `G.permutation(3)` -\> `[2, 1, 3]`          |
| `G.shuffle(arr)`              | 随机打乱数组（返回新数组）。                         | `G.shuffle([1,2,3])` -\> `[3, 1, 2]`        |
| `G.sample(arr, k)`            | 从数组中不重复地抽取 `k` 个元素。                  | `G.sample(['a','b','c'], 2)` -\> `['c', 'a']` |

#### 树与图 (Trees & Graphs)

| 函数                          | 描述                                               | 示例                                       |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------ |
| `G.tree(n, options?)`         | 生成 `n` 个顶点的树结构。支持路径、星形、随机等类型。 | `G.tree(5)` -\> `[[1,2],[2,3],[3,4],[4,5]]` |
| `G.graph(n, m, options?)`     | 生成 `n` 个顶点、`m` 条边的图。支持连通性、权重、方向等配置。 | `G.graph(5, 7, {connected: true})` -\> 边列表 |

#### 日期 (Dates)

| 函数                  | 描述                             | 示例                                          |
| --------------------- | -------------------------------- | --------------------------------------------- |
| `G.isLeap(year)`      | 判断是否为闰年。                   | `G.isLeap(2000)` -\> `true`                    |
| `G.date(options)`     | 生成格式化的随机日期字符串。       | `G.date({format: 'YYYY/MM/DD'})` -\> `"2025/10/14"` |

## 🧠 智能格式化：所见即所得

我们坚信，出题人应该专注于**数据逻辑**，而不是**输出格式**。因此，`Maker` 和 `Checker` 的 `generator` 函数返回值 API 被设计得极其直观，遵循"所见即所得"的哲学。

**你只需要返回一个数组，数组的每个元素代表 `.in` 文件的一行**。

### 核心规则（无歧义版）

```
return [元素1, 元素2, ..., 元素N]
       ↓       ↓           ↓
       行1     行2         行N
```

每个元素的转换规则：

| 元素类型 | 转换规则 | 示例 | 输出行 |
|---------|----------|------|--------|
| 单值 (`number`, `string`, `boolean`) | 直接转字符串 | `42` | `42` |
| 一维数组 | 空格拼接 | `[1, 2, 3]` | `1 2 3` |
| 二维数组 | 展开为多行 | `[[1,2], [3,4]]` | `1 2`<br>`3 4` |

### 示例

```typescript
// 场景 1：基础 A+B 输入
return [
  [a, b]       // → "1 2" (一行两个数)
]

// 场景 2：带大小的矩阵
return [
  [n, m],      // → "3 4" (矩阵维度)
  grid         // grid = [[0,1,0,1], [1,0,1,0], [0,0,1,1]] → 展开为 3 行
]
// 输出:
// 3 4
// 0 1 0 1
// 1 0 1 0
// 0 0 1 1

// 场景 3：字符网格
return [
  [n, m],      // → "3 4"
  '.##.',      // 字符串直接作为一行
  '#..#',
  '####'
]
// 输出:
// 3 4
// .##.
// #..#
// ####

// 场景 4：多个独立数据
return [1, 2, 3]  // → 三行，每行一个数
// 输出:
// 1
// 2
// 3

// 场景 5：一行多个数
return [[1, 2, 3]]  // → 一行三个数
// 输出:
// 1 2 3
```

这个强大而简单的模型覆盖了绝大多数竞赛题目的输入格式，让你能够以最自然的方式思考和编写代码。

## 🤝 贡献

欢迎提交 PR 和 Issue！如果你有新的生成器函数建议，或者发现了任何 Bug，请不要犹豫，在 GitHub 上告诉我们。

## 📜 开源许可

本项目基于 [MIT License](https://www.google.com/search?q=./LICENSE) 开源。
