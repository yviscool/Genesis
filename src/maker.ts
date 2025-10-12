// src/maker.ts
import { consola } from 'consola';
import ora from 'ora';
import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type GenesisConfig, type Case } from './types';
import { formatData } from './formatter';

// 定义默认配置，这是我们的“约定”
const DEFAULTS: Required<GenesisConfig> = {
  solution: 'std.cpp', // 实际逻辑会查找多个
  outputDir: 'data',
  startFrom: 1,
  compilerFlags: ['-O2', '-std=c++17'],
};

const SOLUTION_FALLBACKS = ['std.cpp', 'main.cpp', 'solution.cpp'];

class GenesisMaker {
  private config: Required<GenesisConfig>;
  private caseQueue: Case[] = [];

  constructor() {
    // 每个实例都从默认配置开始
    this.config = { ...DEFAULTS };
  }

  /**
   * 配置生成器实例。
   * @param userConfig 用户提供的配置对象
   */
  public configure(userConfig: GenesisConfig): this {
    this.config = { ...this.config, ...userConfig };
    return this;
  }

  /**
   * 添加一个带标签的单个测试用例。
   * @param label 标签
   * @param generator 生成器函数
   */
  public case(label: string, generator: () => any): this;
  /**
   * 添加一个匿名的单个测试用例。
   * @param generator 生成器函数
   */
  public case(generator: () => any): this;
  public case(...args: any[]): this {
    const [labelOrGenerator, generator] = args;
    if (typeof labelOrGenerator === 'function') {
      this.caseQueue.push({ generator: labelOrGenerator });
    } else {
      this.caseQueue.push({ label: labelOrGenerator, generator });
    }
    return this;
  }

  /**
   * 批量添加多个匿名的、相似的测试用例。
   * @param count 数量
   * @param generator 生成器函数
   */
  public cases(count: number, generator: () => any): this {
    for (let i = 0; i < count; i++) {
      this.caseQueue.push({ generator });
    }
    return this;
  }
  
  /**
   * 启动整个测试数据生成流程。
   */
  public async generate(): Promise<void> {
    consola.start('Genesis starting...');
    
    // 1. 编译解决方案
    const executablePath = await this.compileSolution();
    if (!executablePath) return; // 编译失败，日志已在内部打印

    // 2. 准备输出目录
    await fs.mkdir(this.config.outputDir, { recursive: true });

    // 3. 遍历队列，生成数据
    for (let i = 0; i < this.caseQueue.length; i++) {
      const caseItem = this.caseQueue[i];
      const caseNumber = this.config.startFrom + i;
      const caseName = caseItem.label ? `(#${caseNumber}: ${caseItem.label})` : `(#${caseNumber})`;
      const spinner = ora(`Generating case ${caseName}`).start();

      try {
        // 生成输入数据
        const rawInput = caseItem.generator();
        const formattedInput = formatData(rawInput);
        
        const inFile = path.join(this.config.outputDir, `${caseNumber}.in`);
        await fs.writeFile(inFile, formattedInput);
        
        // 执行 C++ 程序并获取输出
        const { stdout } = await execa(executablePath, { input: formattedInput });

        const outFile = path.join(this.config.outputDir, `${caseNumber}.out`);
        await fs.writeFile(outFile, stdout);

        spinner.succeed(`Generated case ${caseName}`);
      } catch (error: any) {
        spinner.fail(`Failed to generate case ${caseName}`);
        consola.error('Error details:', error.stderr || error.message);
        // 遇到错误时停止，以防产生大量错误数据
        consola.warn('Stopping generation due to an error.');
        return;
      }
    }
    
    consola.success(`✨ Generation complete! ${this.caseQueue.length} cases created in '${this.config.outputDir}/'.`);
  }

  private async findSolutionFile(): Promise<string | null> {
    const filesToTry = this.config.solution === DEFAULTS.solution 
      ? SOLUTION_FALLBACKS
      : [this.config.solution];
    
    for (const file of filesToTry) {
      try {
        await fs.access(file);
        return file;
      } catch {
        // 文件不存在，继续尝试下一个
      }
    }
    return null;
  }

  private async compileSolution(): Promise<string | null> {
    const sourceFile = await this.findSolutionFile();
    if (!sourceFile) {
        consola.error(`Solution file not found. Tried: ${
            this.config.solution === DEFAULTS.solution ? SOLUTION_FALLBACKS.join(', ') : this.config.solution
        }`);
        return null;
    }

    const executableName = path.parse(sourceFile).name;
    const spinner = ora(`Compiling solution: ${sourceFile}...`).start();
    
    try {
      const tempDir = '.genesis';
      await fs.mkdir(tempDir, { recursive: true });
      const executablePath = path.join(tempDir, executableName);

      await execa('g++', [sourceFile, '-o', executablePath, ...this.config.compilerFlags]);
      spinner.succeed(`Compiled solution: ${sourceFile}`);
      return executablePath;
    } catch (error: any) {
      spinner.fail(`Failed to compile ${sourceFile}`);
      // execa 的错误对象包含了 stderr
      consola.error('Compiler error:', error.stderr);
      return null;
    }
  }
}

// 这是暴露给用户的单例入口
// 每次调用 Maker.configure 都会返回一个新的实例，避免状态污染
export const Maker = {
  configure: (config: GenesisConfig) => new GenesisMaker().configure(config),
  case: (...args: any[]) => (new GenesisMaker() as any).case(...args),
  cases: (count: number, generator: () => any) => new GenesisMaker().cases(count, generator),
};