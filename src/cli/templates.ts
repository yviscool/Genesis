// src/cli/templates.ts
// 语言模板：标程与故意包含 Bug 的解法

export const CPP_STD = `#include <iostream>

int main() {
    long long a, b;
    std::cin >> a >> b;
    std::cout << a + b << std::endl;
    return 0;
}
`;

export const CPP_BUGGY = `#include <iostream>

// 一个有 Bug 的解法，使用了 int 可能导致溢出。
int main() {
    int a, b;
    std::cin >> a >> b;
    std::cout << a + b << std::endl;
    return 0;
}
`;

export const GO_STD = `package main

import "fmt"

func main() {
    var a, b int64
    fmt.Scan(&a, &b)
    fmt.Println(a + b)
}
`;

export const GO_BUGGY = `package main

import "fmt"

// 一个有 Bug 的解法，使用了 int32 可能导致溢出。
func main() {
    var a, b int32
    fmt.Scan(&a, &b)
    fmt.Println(a + b)
}
`;

export const RUST_STD = `use std::io;

fn main() {
    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    let mut iter = input.split_whitespace();
    let a: i64 = iter.next().unwrap().parse().unwrap();
    let b: i64 = iter.next().unwrap().parse().unwrap();
    println!("{}", a + b);
}
`;

export const RUST_BUGGY = `use std::io;

// 一个有 Bug 的解法，使用了 i32 可能导致溢出。
fn main() {
    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    let mut iter = input.split_whitespace();
    let a: i32 = iter.next().unwrap().parse().unwrap();
    let b: i32 = iter.next().unwrap().parse().unwrap();
    println!("{}", a + b);
}
`;

export const JAVA_STD = `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        long a = sc.nextLong();
        long b = sc.nextLong();
        System.out.println(a + b);
        sc.close();
    }
}
`;

export const JAVA_BUGGY = `import java.util.Scanner;

// 一个有 Bug 的解法，使用了 int 可能导致溢出。
public class My {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        System.out.println(a + b);
        sc.close();
    }
}
`;

export const PYTHON_STD = `a, b = map(int, input().split())
print(a + b)
`;

export const PYTHON_BUGGY = `a, b = map(int, input().split())
# 一个有 Bug 的解法，会输出错误答案。
print(a + b + 1)
`;

export const JS_STD = `const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  const [a, b] = line.split(' ').map(BigInt);
  console.log((a + b).toString());
  rl.close();
});
`;

export const JS_BUGGY = `const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });

// 一个有 Bug 的解法，会输出错误答案。
rl.on('line', (line) => {
  const [a, b] = line.split(' ').map(BigInt);
  console.log((a + b + 1n).toString());
  rl.close();
});
`;

export const MAKE_TS = `import { Maker, G } from 'genesis-kit';

Maker
  .case('Sample', () => {
    return [[1, 2]];
  })
  .cases(5, () => {
    const a = G.int(1, 1000);
    const b = G.int(1, 1000);
    return [[a, b]];
  })
  .case('Large Numbers', () => {
    const a = G.int(1e9, 2e9);
    const b = G.int(1e9, 2e9);
    return [[a, b]];
  })
  .generate();
`;

export const CHECK_TS = (std: string, target: string) => `import { Checker, G } from 'genesis-kit';

Checker
  .configure({
    std: '${std}',
    target: '${target}',
  })
  .gen(() => {
    // 95% 的概率生成适合 int 的数字
    if (Math.random() < 0.95) {
      return [[G.int(1, 1e9), G.int(1, 1e9)]];
    }
    // 5% 的概率生成会导致溢出的 HACK 数据
    return [[G.int(1.5e9, 2e9), G.int(1.5e9, 2e9)]];
  })
  .run(10000); // 最多运行 10,000 次，或直到发现 Bug
`;

// 模板映射表
export const TEMPLATES: { [lang: string]: { [file: string]: string } } = {
    cpp: { 'std.cpp': CPP_STD, 'my.cpp': CPP_BUGGY, 'check.ts': CHECK_TS('std.cpp', 'my.cpp') },
    go: { 'std.go': GO_STD, 'my.go': GO_BUGGY, 'check.ts': CHECK_TS('std.go', 'my.go') },
    rust: { 'std.rs': RUST_STD, 'my.rs': RUST_BUGGY, 'check.ts': CHECK_TS('std.rs', 'my.rs') },
    java: { 'Main.java': JAVA_STD, 'My.java': JAVA_BUGGY, 'check.ts': CHECK_TS('Main.java', 'My.java') },
    py: { 'std.py': PYTHON_STD, 'my.py': PYTHON_BUGGY, 'check.ts': CHECK_TS('std.py', 'my.py') },
    js: { 'std.js': JS_STD, 'my.js': JS_BUGGY, 'check.ts': CHECK_TS('std.js', 'my.js') },
};
