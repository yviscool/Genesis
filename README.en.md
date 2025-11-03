# Genesis: A Test Data Generator for Competitive Programming

**Genesis** is an incredibly simple and easy-to-use test data generation tool tailored for algorithm contest organizers, contestants, and coaches. It automates tedious processes like compilation, data generation, file I/O, and solution checking, allowing you to focus on the **design of the data itself**, rather than the implementation details.

## ✨ Core Features

*   **Declarative API**: Intuitively define data generation and checking with chained calls like `.case()` and `.run()`, making your code structure highly consistent with your logic.
*   **Built-in Checker**: Automatically runs the standard and target solutions, performs high-fidelity output comparison (Diff), and quickly pinpoints `WA`/`TLE`.
*   **Powerful Data Generator (`G`)**: Comes with a rich set of convenient generation functions (`G.int`, `G.permutation`, `G.matrix`, `G.even`, etc.) that cover 99% of basic data needs.
*   **Intelligent Formatting**: You only need to return structured data (e.g., `[[n, m], grid]`), and Genesis will automatically handle spaces and newlines to generate compliant `.in` files. **It correctly handles both numeric matrices and string arrays for `grid`!**
*   **Automatic Compilation & Caching**: Auto-detects C++ compilers (`g++` / `clang++`) and compiles your standard and tested solutions. An intelligent caching mechanism based on file content and compilation parameters avoids redundant compilations, significantly boosting efficiency.
*   **High Performance**: Leverages Node.js's asynchronous nature and multi-core CPUs, allowing `Maker` to generate all test cases in parallel and `Checker` to perform high-speed solution checking.
*   **Cross-Platform**: Works seamlessly on Windows (MSYS2/MinGW), macOS, and Linux.

## 🚀 Quick Start (Maker)

`Maker` is used for batch generating `.in` / `.out` files.

### 1. Installation

Ensure you have [Node.js](https://nodejs.org/) (v16+) and [Bun](https://bun.sh/) (or `tsx` for running TypeScript) installed.

In your project directory, add Genesis as a development dependency:

```bash
bun add genesis-kit --dev
# Or using npm / yarn / pnpm
# npm install genesis-kit --save-dev
```

### 2. Write Your First `make.ts`

Assume your project structure is as follows:

```
.
├── std.cpp        # Your C++ standard solution
└── make.ts        # Your data generation script
```

Now, write `make.ts` to generate data for the A+B Problem:

```typescript
// make.ts
import { Maker, G } from 'genesis-kit';

Maker
  // Case 1: Small numbers
  .case('Small Numbers', () => {
    const a = G.int(1, 100);
    const b = G.int(1, 100);
    return [[a, b]]; // -> will be formatted as "a b"
  })

  // Cases 2-6: Batch generate 5 random medium-sized data sets
  .cases(5, () => {
    const a = G.int(1000, 100000);
    const b = G.int(1000, 100000);
    return [[a, b]];
  })

  // Case 7: Edge case with large numbers
  .case('Max Numbers', () => {
    const a = 1_000_000_000;
    const b = 1_000_000_000;
    return [[a, b]];
  })

  // Start the generation process!
  .generate();
```

### 3. Run It

Open your terminal and execute:

```bash
bun make.ts
# Or
tsx make.ts
```

**What just happened?** Genesis automatically found and compiled `std.cpp`, then executed the 7 `case`s in parallel, and finally saved the input (`.in`) and output (`.out`) files to the `data/` directory.

## 📚 API Reference

Genesis provides two core tools: `Maker` (for batch data generation) and `Checker` (for solution verification).

-----

### `Checker` API

`Checker` is an automated "solution checking" tool. It uses the same data generator to run both a "standard solution" (std) and a "target solution" (target), and compares their outputs with high fidelity until the first error (WA / TLE / RE) is found.

#### Quick Start: `check.ts`

Let's use `Checker` to catch a common `int` overflow error.

**Prepare the files:**

1.  `std.cpp` (A+B, using `long long`, **correct**)
2.  `my_buggy.cpp` (A+B, using `int`, **buggy**)

**Write `check.ts`:**

```typescript
// check.ts
import { Checker, G } from 'genesis-kit';

Checker
  // 1. Configure
  .configure({
    std: 'std.cpp',          // (Required) Standard solution, must be correct
    target: 'my_buggy.cpp',  // (Required) The program you want to test
    
    // (Optional) Comparison mode
    // 'normalized' (default): Simulates OJ judging (ignores trailing spaces, blank lines)
    // 'exact': Strict byte-for-byte comparison
    compareMode: 'normalized'
  })

  // 2. Define the data generator
  .gen(() => {
    // 90% chance to generate numbers within the safe range of int
    if (Math.random() < 0.9) {
      return [[G.int(1e9), G.int(1e9)]];
    }
    // 10% chance to generate HACK data (which will cause int overflow)
    return [[G.int(1.5e9, 2e9), G.int(1.5e9, 2e9)]];
  })

  // 3. (Optional) Set a timeout
  .timeout(1000) // Applies only to the target, in milliseconds

  // 4. Run
  .run(10000); // Run 10,000 times, or stop at the first error
```

#### `.run()` Flow

When `.run(N)` is initiated, `Checker` will:

1.  **Compile**: Automatically compile `std` and `target` (and reuse `Maker`'s cache).
2.  **Loop**: Start a **serial** loop for a maximum of `N` iterations.
3.  **Generate**: In **each** iteration, call the function in `.gen()` to produce a new set of data.
4.  **Execute**: Run the `std` and `target` programs separately, feeding the generated data as `stdin`.
5.  **Judge**:
    *   **TLE / RE**: If `target` times out or crashes (RE), stop immediately.
    *   **WA (Wrong Answer)**: Call the high-fidelity differ to compare the `stdout` of `std` and `target`.
6.  **Report**:
    *   **PASSED**: Update the counter in the console and proceed to the next iteration.
    *   **FAILED (WA/TLE/RE)**: **Stop immediately** and print a detailed failure report to the console (including input, standard output, and your output).
    *   **Save Artifacts**: Automatically save the data that caused the failure to:
        *   `_checker_fail.in`
        *   `_checker_std.out`
        *   `_checker_my.out`

-----

### `Maker` API

`Maker` is Genesis's batch data generation tool. The core of the process is to define a series of test cases and then start the generation.

#### **Defining Test Cases: `.case()` & `.cases()`**

These are the two most central methods in Genesis, used to define the test data you want to generate.

##### **`.case()`: Create a Single, Independent Test Case**

Each call to `.case()` adds **one** test task to the generation queue. Ultimately, this will generate **one set** of corresponding input/output files (e.g., `1.in` and `1.out`).

The return value of the `generator` function you provide constitutes the **entire content** of that **one** `.in` file.

```typescript
// Syntax
.case(label: string, generator: () => any) // With a label, for distinction in logs
.case(generator: () => any)                // Anonymous

// Example
Maker
  .case('Sample 1', () => { /* ... */ }) // -> Will generate 1.in / 1.out
  .case('Edge Case', () => { /* ... */ }) // -> Will generate 2.in / 2.out
```

##### **`.cases()`: Batch Create Multiple Similar Test Cases**

`.cases(N, generator)` is a convenience API equivalent to calling `.case()` with the same `generator` `N` times.

This adds **N** independent test tasks to the queue, ultimately generating **N sets** of files (e.g., from `3.in`/`3.out` up to `7.in`/`7.out`).

The `generator` function will be **executed independently N times**, with the result of each execution used to create a brand new `.in` file, ensuring data randomness and diversity.

```typescript
// Syntax
.cases(count: number, generator: () => any)

// Example
Maker
  .case('Sample', () => { /* ... */ })       // -> Generates 1.in / 1.out
  .cases(5, () => {
    // This function will be executed independently 5 times
    const a = G.int(1, 100);
    const b = G.int(1, 100);
    return [[a, b]];
  })                                       // -> Sequentially generates 2.in/out, 3.in/out, ..., 6.in/out
```

-----

#### **Configuration and Execution**

##### **`.configure(config: GenesisConfig)`**

Use this at **any point** in the call chain (usually at the beginning) to configure the default behavior of Genesis. This is an optional step.

```typescript
Maker.configure({
  solution: 'main.cpp',   // Specify the standard solution filename (default: 'std.cpp')
  outputDir: 'testdata',  // Specify the output directory (default: 'data')
  compiler: 'g++-12',     // Manually specify the compiler (default: auto-detects g++ or clang++)
  startFrom: 1,           // Starting file number (default: 1)
});
```

##### **`.generate(): Promise<void>`**

**Must be called at the end of the `Maker` chain**. It kicks off the entire automated process: compiling, generating, running the standard solution, and saving files.

-----

### `G` (Generator) API

The `G` object provides a series of out-of-the-box data generation functions.

#### Numbers

| Function                  | Description                                           | Example                                  |
| --------------------- | ------------------------------------------------------- | ---------------------------------------- |
| `G.int(min, max)`       | Generates a random integer in `[min, max]`.
| `G.ints(count, min, max)` | Generates an array of `count` integers in `[min, max]`.
| `G.even(min, max)`      | Generates a random even number in `[min, max]`.
| `G.odd(min, max)`       | Generates a random odd number in `[min, max]`.
| `G.float(min, max, prec)` | Generates a float in `[min, max]` with `prec` decimal places.

#### Strings

| Function                     | Description                               | Example                                     |
| ------------------------ | ------------------------------------------- | ------------------------------------------- |
| `G.string(len, charset)`   | Generates a random string of a given length and charset.
| `G.word(min, max)`         | Generates a lowercase word of length `[min, max]`.
| `G.words(count, min, max)` | Generates an array of `count` random words.

#### Arrays & Structures

| Function                          | Description                                               | Example                                       |
| ----------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| `G.array(count, fn)`          | Generates an array of `count` elements, where each element is generated by `fn(i)`.
| `G.matrix(r, c, fn)`        | Generates an `r`x`c` matrix, where each cell is generated by `fn(i, j)`.
| `G.permutation(n, oneBased?)` | Generates a permutation of `n` (starts from 1 by default).
| `G.shuffle(arr)`              | Shuffles an array randomly (returns a new array).
| `G.sample(arr, k)`            | Samples `k` unique elements from an array.

#### Dates

| Function                  | Description                             | Example                                          |
| --------------------- | --------------------------------------- | ------------------------------------------------ |
| `G.isLeap(year)`      | Checks if a year is a leap year.
| `G.date(options)`     | Generates a formatted random date string.

## 🧠 Smart Formatting: What You See Is What You Get

We believe that problem setters should focus on **data logic**, not **output format**. Therefore, the return value API for the `generator` functions in `Maker` and `Checker` is designed to be extremely intuitive, following a "what you see is what you get" philosophy.

**You just need to return an array whose structure is the "blueprint" for the `.in` file you want.**

**Core Rules**:

1.  **1D Array or Single Value** (`[n, m]`, `100`) -> **Single Line** (elements separated by spaces).
2.  **2D Array/Matrix** (`[[1,0], [0,1]]`) -> **Multiple Lines** (each row is formatted automatically).
3.  **1D Array of Strings** (`['.##.', '..#.']`) -> **Multiple Lines** (each string is a separate line).

**Example: Both common Grid formats are now supported!**

```typescript
// --- Method 1: Return a numeric matrix directly (Recommended, more concise) ---
.case('Number Matrix', () => {
  const n = 3, m = 4;
  // G.matrix returns a numeric matrix, e.g., [[0,1,0,1], [1,...], ...]
  const grid = G.matrix(n, m, () => G.int(0, 1));

  // Return it directly! Genesis will intelligently format each row of the grid matrix.
  return [
    [n, m], // -> "3 4"
    grid    // -> "0 1 0 1\n1 1 0 0\n0 0 1 1"
  ];
})

// --- Method 2: Return an array of strings (Also supported) ---
.case('String Array', () => {
    const n = 2, m = 5;
    // Manually process each row of the grid into a string
    const grid = G.matrix(n, m, () => G.sample(['.', '#'], 1)[0])
                 .map(row => row.join('')); // grid -> ['.##.#', '#..##']

    return [
        [n, m], // -> "2 5"
        grid    // -> ".##.#\n#..##"
    ];
})
```

This powerful and simple model covers the input formats of the vast majority of competitive programming problems, allowing you to think and write code in the most natural way.

## 🤝 Contributing

PRs and Issues are welcome! If you have suggestions for new generator functions or have found any bugs, please don't hesitate to let us know on GitHub.

## 📜 License

This project is open-sourced under the [MIT License](./LICENSE).
