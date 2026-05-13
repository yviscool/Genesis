export const CPP_STD = `#include <iostream>
using namespace std;

int main() {
    long long a, b;
    cin >> a >> b;
    cout << a + b << '\\n';
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

export const RUST_STD = `use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let mut it = input.split_whitespace();
    let a: i64 = it.next().unwrap().parse().unwrap();
    let b: i64 = it.next().unwrap().parse().unwrap();
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

export const PYTHON_STD = `a, b = map(int, input().split())
print(a + b)
`;

export const JS_STD = `const fs = require('node:fs');

const [a, b] = fs.readFileSync(0, 'utf8').trim().split(/\\s+/).map(BigInt);
console.log((a + b).toString());
`;

export const MAKE_TS = (solution: string) => `import { defineDataset, fmt } from 'genesis-kit';

type Input = {
  a: number;
  b: number;
};

export default defineDataset<Input>({
  solution: '${solution}',
  outputDir: 'data',
  seed: 20260505,

  format: ({ a, b }) => fmt.line(a, b),

  validate: ({ a, b }) => (
    Number.isInteger(a) && Number.isInteger(b)
      ? true
      : 'a and b must be integers'
  ),

  cases: [
    {
      name: 'sample',
      input: { a: 1, b: 2 },
    },
    {
      name: 'random-small',
      repeat: 5,
      generate: ({ g }) => ({
        a: g.int(1, 1000),
        b: g.int(1, 1000),
      }),
    },
    {
      name: 'large-boundary',
      input: { a: 1_000_000_000, b: 1_000_000_000 },
    },
  ],
});
`;

export const TEMPLATES: Record<string, Record<string, string>> = {
  cpp: { 'std.cpp': CPP_STD },
  go: { 'std.go': GO_STD },
  rust: { 'std.rs': RUST_STD },
  java: { 'Main.java': JAVA_STD },
  py: { 'std.py': PYTHON_STD },
  js: { 'std.js': JS_STD },
};
