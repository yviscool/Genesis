好的，这是为您精心编写的、反映了我们所有讨论成果的最终版 `README.md`。它包含了清晰的安装指南、完整的 API 参考、以及对核心“智能格式化”设计哲学的深入阐述，确保任何用户都能快速上手并充分利用 Genesis 的强大功能。

-----

# Genesis: 为算法竞赛而生的测试数据生成器

[](https://www.google.com/search?q=https://www.npmjs.com/package/genesis-kit)
[](https://www.google.com/search?q=https://github.com/yviscool/genesis/blob/main/LICENSE)

**Genesis** 是一个为算法竞赛出题人、选手和教练量身打造的、极其简单易用的测试数据生成工具。它将繁琐的编译、数据生成、文件 I/O 流程自动化，让你能专注于**数据本身的设计**，而非过程的实现。

告别手写 `freopen` 和复杂的 `bash` 脚本，用现代 TypeScript 语法，以声明式的方式优雅地创造高质量的测试数据。

## ✨ 核心特性

  * **声明式 API**: 使用链式调用 `.case()` 直观地定义每个测试点，代码结构与数据逻辑高度一致。
  * **强大的数据生成器 (`G`)**: 内置丰富、便捷的生成函数 (`G.int`, `G.permutation`, `G.matrix`, `G.even` 等)，满足 99% 的基础数据需求。
  * **智能格式化**: 你只需返回结构化的数据（如 `[[n, m], grid]`），Genesis 会自动处理空格和换行，生成符合要求的 `.in` 文件。**无论 `grid` 是数字矩阵还是字符串数组，它都能正确处理！**
  * **自动编译与缓存**: 自动探测 C++ 编译器（`g++` / `clang++`），并对标程进行编译。基于文件内容和编译参数的智能缓存机制，源码不变则无需重复编译，极大提升效率。
  * **高性能**: 利用 Node.js 的异步特性和多核心 CPU，并行生成所有测试用例，速度飞快。
  * **跨平台**: 在 Windows (MSYS2/MinGW)、macOS 和 Linux 上均可无缝工作。

## 🚀 快速上手

### 1\. 安装

确保你已经安装了 [Node.js](https://nodejs.org/) (v16+) 和 [Bun](https://bun.sh/) (或 `tsx` 用于执行 TypeScript)。

在你的项目目录下，将 Genesis 添加到开发依赖：

```bash
bun add genesis-kit --dev
# 或者使用 npm / yarn / pnpm
# npm install genesis-ac --save-dev
```

### 2\. 编写你的第一个 `make.ts`

假设你的项目结构如下：

```
.
├── std.cpp        # 你的 C++ 标程
└── make.ts        # 你的数据生成脚本
```

现在，编写 `make.ts` 来生成 A+B Problem 的数据：

```typescript
// make.ts
import { Maker, G } from 'genesis-kit';

Maker
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

**发生了什么？**

Genesis 会：

1.  找到并编译你的 `std.cpp` 文件。
2.  并行执行 7 个 `case` 的生成逻辑。
3.  将每个 `case` 的返回值（例如 `[[10, 20]]`）智能格式化为字符串（`"10 20"`）。
4.  将格式化后的字符串作为输入，运行编译好的标程。
5.  将输入和输出分别保存到 `data/` 目录下的 `1.in`, `1.out`, `2.in`, `2.out`, ...

你会在项目根目录看到一个 `data` 文件夹，包含了所有生成的测试数据，可以直接用于评测！

## 📚 API 参考

### `Maker` API

`Maker` 是 Genesis 的主入口，采用链式调用设计。

  * `.configure(config: GenesisConfig)`: (可选) 配置 Genesis 的行为。
    ```typescript
    Maker.configure({
      solution: 'main.cpp',   // 指定标程文件名
      outputDir: 'testdata',  // 指定输出目录
      compiler: 'g++-12',     // 指定编译器
    });
    ```
  * `.case(label: string, generator: () => any)`: 定义一个带标签的测试用例。
  * `.case(generator: () => any)`: 定义一个匿名测试用例。
  * `.cases(count: number, generator: () => any)`: 批量定义多个相似的测试用例。
  * `.generate(): Promise<void>`: **必须在链式调用的末尾调用**，它会启动整个生成流程。

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

#### 日期 (Dates)

| 函数                  | 描述                             | 示例                                          |
| --------------------- | -------------------------------- | --------------------------------------------- |
| `G.isLeap(year)`      | 判断是否为闰年。                   | `G.isLeap(2000)` -\> `true`                    |
| `G.date(options)`     | 生成格式化的随机日期字符串。       | `G.date({format: 'YYYY/MM/DD'})` -\> `"2025/10/14"` |

## 🧠 智能格式化：所见即所得

我们坚信，出题人应该专注于**数据逻辑**，而不是**输出格式**。因此，Genesis 的 `case` 函数返回值 API 被设计得极其直观，遵循“所见即所得”的哲学。

**你只需要返回一个数组，其结构就是你想要的 `.in` 文件的“蓝图”**。

**核心规则**:

1.  **一维数组或单个值** (`[n, m]`, `100`) -\> **单行** (元素间用空格隔开)。
2.  **二维数组/矩阵** (`[[1,0], [0,1]]`) -\> **多行** (自动格式化每一行)。
3.  **一维字符串数组** (`['.##.', '..#.']`) -\> **多行** (每个字符串为独立一行)。

**示例：两种最常用的 Grid 格式，现在都支持！**

```typescript
// --- 方式一: 直接返回数字矩阵 (推荐，更简洁) ---
.case('Number Matrix', () => {
  const n = 3, m = 4;
  // G.matrix 返回一个数字矩阵，例如 [[0,1,0,1], [1,...], ...]
  const grid = G.matrix(n, m, () => G.int(0, 1));

  // 直接返回！Genesis 会智能地将 grid 矩阵的每一行格式化。
  return [
    [n, m], // -> "3 4"
    grid    // -> "0 1 0 1\n1 1 0 0\n0 0 1 1"
  ];
})

// --- 方式二: 返回字符串数组 (同样支持) ---
.case('String Array', () => {
    const n = 2, m = 5;
    // 手动将 grid 的每一行处理成字符串
    const grid = G.matrix(n, m, () => G.sample(['.', '#'], 1)[0])
                 .map(row => row.join('')); // grid -> ['.##.#', '#..##']

    return [
        [n, m], // -> "2 5"
        grid    // -> ".##.#\n#..##"
    ];
})
```

这个强大而简单的模型覆盖了绝大多数竞赛题目的输入格式，让你能够以最自然的方式思考和编写代码。

## 🤝 贡献

欢迎提交 PR 和 Issue！如果你有新的生成器函数建议，或者发现了任何 Bug，请不要犹豫，在 GitHub 上告诉我们。

## 📜 开源许可

本项目基于 [MIT License](https://www.google.com/search?q=./LICENSE) 开源。