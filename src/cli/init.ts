import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { consola } from 'consola';
import { t } from '../i18n';

const CPP_STD = `#include <iostream>

int main() {
    long long a, b;
    std::cin >> a >> b;
    std::cout << a + b << std::endl;
    return 0;
}
`;

const CPP_BUGGY = `#include <iostream>

// A buggy solution that uses int, which may cause overflow.
int main() {
    int a, b;
    std::cin >> a >> b;
    std::cout << a + b << std::endl;
    return 0;
}
`;

const GO_STD = `package main

import "fmt"

func main() {
    var a, b int64
    fmt.Scan(&a, &b)
    fmt.Println(a + b)
}
`;

const GO_BUGGY = `package main

import "fmt"

// A buggy solution that uses int32, which may cause overflow.
func main() {
    var a, b int32
    fmt.Scan(&a, &b)
    fmt.Println(a + b)
}
`;

const RUST_STD = `use std::io;

fn main() {
    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    let mut iter = input.split_whitespace();
    let a: i64 = iter.next().unwrap().parse().unwrap();
    let b: i64 = iter.next().unwrap().parse().unwrap();
    println!("{}", a + b);
}
`;

const RUST_BUGGY = `use std::io;

// A buggy solution that uses i32, which may cause overflow.
fn main() {
    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    let mut iter = input.split_whitespace();
    let a: i32 = iter.next().unwrap().parse().unwrap();
    let b: i32 = iter.next().unwrap().parse().unwrap();
    println!("{}", a + b);
}
`;

const JAVA_STD = `import java.util.Scanner;

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

const JAVA_BUGGY = `import java.util.Scanner;

// A buggy solution that uses int, which may cause overflow.
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

const PYTHON_STD = `a, b = map(int, input().split())
print(a + b)
`;

const PYTHON_BUGGY = `a, b = map(int, input().split())
# A buggy solution that gives a wrong answer.
print(a + b + 1)
`;

const JS_STD = `const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  const [a, b] = line.split(' ').map(BigInt);
  console.log((a + b).toString());
  rl.close();
});
`;

const JS_BUGGY = `const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });

// A buggy solution that gives a wrong answer.
rl.on('line', (line) => {
  const [a, b] = line.split(' ').map(BigInt);
  console.log((a + b + 1n).toString());
  rl.close();
});
`;

const MAKE_TS = `import { Maker, G } from 'genesis-kit';

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

const CHECK_TS = (std: string, target: string) => `import { Checker, G } from 'genesis-kit';

Checker
  .configure({
    std: '${std}',
    target: '${target}',
  })
  .gen(() => {
    // 95% chance to generate numbers that fit in int
    if (Math.random() < 0.95) {
      return [[G.int(1, 1e9), G.int(1, 1e9)]];
    }
    // 5% chance to generate a HACK case that causes overflow
    return [[G.int(1.5e9, 2e9), G.int(1.5e9, 2e9)]];
  })
  .run(10000); // Run up to 10,000 times or until a bug is found
`;

const templates: { [lang: string]: { [file: string]: string } } = {
  cpp: { 'std.cpp': CPP_STD, 'my.cpp': CPP_BUGGY, 'check.ts': CHECK_TS('std.cpp', 'my.cpp') },
  go: { 'std.go': GO_STD, 'my.go': GO_BUGGY, 'check.ts': CHECK_TS('std.go', 'my.go') },
  rust: { 'std.rs': RUST_STD, 'my.rs': RUST_BUGGY, 'check.ts': CHECK_TS('std.rs', 'my.rs') },
  java: { 'Main.java': JAVA_STD, 'My.java': JAVA_BUGGY, 'check.ts': CHECK_TS('Main.java', 'My.java') },
  py: { 'std.py': PYTHON_STD, 'my.py': PYTHON_BUGGY, 'check.ts': CHECK_TS('std.py', 'my.py') },
  js: { 'std.js': JS_STD, 'my.js': JS_BUGGY, 'check.ts': CHECK_TS('std.js', 'my.js') },
};

export async function handleInit(directory?: string, options: { lang?: string, force?: boolean } = {}) {
  const targetDir = directory || '.';
  const lang = options.lang || 'cpp';
  const force = options.force || false;

  if (!templates[lang]) {
    consola.error(`Invalid language '${lang}'. Supported languages are: ${Object.keys(templates).join(', ')}`);
    process.exit(1);
  }

  consola.start(t('cli.init.initializing', path.resolve(targetDir)));

  try {
    if (!existsSync(targetDir)) {
      await fs.mkdir(targetDir, { recursive: true });
    }

    const files = await fs.readdir(targetDir);
    if (files.length > 0 && !force) {
      consola.warn(t('cli.init.notEmpty', targetDir));
      return;
    }

    const langTemplates = { ...templates[lang], 'make.ts': MAKE_TS };

    for (const [fileName, content] of Object.entries(langTemplates)) {
      const filePath = path.join(targetDir, fileName);
      await fs.writeFile(filePath, content.trim());
      consola.success(t('cli.init.created', path.relative(process.cwd(), filePath)));
    }

    consola.info(t('cli.init.success'));
    consola.log(
      t(
        'cli.init.nextSteps',
        targetDir,
      ),
    );
  } catch (error: any) {
    consola.error(t('cli.init.failed', error.message));
    process.exit(1);
  }
}

