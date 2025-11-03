// src/maker.ts

import { consola } from 'consola';
import ora from 'ora';
import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { type GenesisConfig, type Case } from './types';
import { formatData } from './formatter';
import { getExecutable } from './compilation';
import { t } from './i18n';

// =============================================================================
// --- Constants & Defaults ---
// =============================================================================

const DEFAULTS: Required<Omit<GenesisConfig, 'compiler' | 'compilerFlags'>> = {
  solution: 'std.cpp',
  outputDir: 'data',
  startFrom: 1,
};

const SOLUTION_FALLBACKS = ['std.cpp', 'main.cpp', 'solution.cpp'];

// =============================================================================
// --- Core Implementation Class ---
// =============================================================================

class GenesisMaker {
  private config: GenesisConfig & Required<Omit<GenesisConfig, 'compiler' | 'compilerFlags'>>;
  private caseQueue: Case[] = [];

  constructor() {
    this.config = { ...DEFAULTS };
  }

  // ---------------------------------------------------------------------------
  // --- Public API ---
  // ---------------------------------------------------------------------------

  /**
   * Configures the generator instance.
   * @param userConfig The user-provided configuration object.
   * @returns {this} The instance for chaining.
   */
  public configure(userConfig: GenesisConfig): this {
    this.config = { ...this.config, ...userConfig };
    return this;
  }

  /**
   * Adds a test case to the generation queue.
   * @param labelOrGenerator The label for the test case (optional) or the generator function.
   * @param generator The generator function for the test case.
   * @returns {this} The instance for chaining.
   */
  public case(label: string, generator: () => any): this;
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
   * Adds multiple anonymous, similar test cases in batch.
   * @param count The number of test cases to add.
   * @param generator The generator function to use for all test cases.
   * @returns {this} The instance for chaining.
   */
  public cases(count: number, generator: () => any): this {
    for (let i = 0; i < count; i++) {
      this.caseQueue.push({ generator });
    }
    return this;
  }

  /**
   * Starts the entire test data generation process.
   * This is the entry point for all operations, coordinating preprocessing, compilation, and parallel generation tasks.
   */
  public async generate(): Promise<void> {
    consola.start(t('maker.starting'));

    if (!await this.prepareEnvironment()) {
      consola.warn(t('maker.envPrepFailed'));
      return;
    }

    const sourceFile = await this.findSolutionFile();
    if (!sourceFile) {
      consola.error(t('maker.solutionNotFound', this.config.solution || SOLUTION_FALLBACKS.join(', ')));
      return;
    }

    const executablePath = await getExecutable(sourceFile, this.config);
    if (!executablePath) return;

    await this.runGenerationTasks(executablePath);
  }

  // ---------------------------------------------------------------------------
  // --- Core Flow Orchestrators ---
  // ---------------------------------------------------------------------------

  /**
   * Prepares the generation environment, including cleaning the output directory.
   * @returns {Promise<boolean>} True if the environment is ready, false otherwise.
   */
  private async prepareEnvironment(): Promise<boolean> {
    const cleanupOk = await this.cleanupOutputDirectory();
    if (!cleanupOk) return false;
    
    await fs.mkdir(this.config.outputDir, { recursive: true });

    return true;
  }

  /**
   * Executes all test case generation tasks in parallel.
   * @param executablePath The path to the compiled solution executable.
   */
  private async runGenerationTasks(executablePath: string): Promise<void> {
    const totalCases = this.caseQueue.length;
    if (totalCases === 0) {
      consola.info(t('maker.noCases'));
      return;
    }

    const concurrencyLimit = os.cpus().length;
    let completedCases = 0;
    const results: { name: string; success: boolean; error?: string }[] = [];
    const spinner = ora(t('maker.generatingCases', 0, totalCases)).start();

    const taskPool = this.caseQueue.map((caseItem, i) =>
      () => this.generateSingleCase(caseItem, this.config.startFrom + i, executablePath)
    );

    for (let i = 0; i < totalCases; i += concurrencyLimit) {
      const batchPromises = taskPool.slice(i, i + concurrencyLimit).map(task => task());
      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        results.push(result);
        completedCases++;
        spinner.text = t('maker.generatingCases', completedCases, totalCases);
      }
    }

    spinner.succeed(t('maker.allCasesProcessed'));
    this.reportResults(results);
  }

  /**
   * Summarizes and reports the generation results.
   * @param results An array of generation results for all test cases.
   */
  private reportResults(results: { name: string; success: boolean; error?: string }[]): void {
    const totalCases = results.length;
    let successCount = 0;

    for (const result of results) {
      if (result.success) {
        consola.success(t('maker.generatedCase', result.name));
        successCount++;
      } else {
        consola.error(t('maker.failedToGenerate', result.name));
        consola.error(t('maker.errorDetails', result.error));
      }
    }

    if (successCount === totalCases) {
      consola.success(t('maker.generationComplete', totalCases, this.config.outputDir));
    } else {
      consola.warn(t('maker.generationFinishedWithErrors', totalCases - successCount, successCount, totalCases));
    }
  }

  // ---------------------------------------------------------------------------
  // --- Filesystem & Utilities ---
  // ---------------------------------------------------------------------------

  /**
   * Atomic operation to generate a single test case, including input generation, solution execution, and output saving.
   * @param caseItem The case object, containing the generator and label.
   * @param caseNumber The current case number.
   * @param executablePath The path to the solution executable.
   * @returns {Promise<{ name: string; success: boolean; error?: string }>} The result of the operation.
   */
  private async generateSingleCase(caseItem: Case, caseNumber: number, executablePath: string): Promise<{ name: string; success: boolean; error?: string }> {
    const caseName = caseItem.label ? `(#${caseNumber}: ${caseItem.label})` : `(#${caseNumber})`;
    try {
      const rawInput = caseItem.generator();
      const formattedInput = formatData(rawInput);

      const inFile = path.join(this.config.outputDir, `${caseNumber}.in`);
      await fs.writeFile(inFile, formattedInput);

      const { stdout } = await execa(executablePath, { input: formattedInput });

      const outFile = path.join(this.config.outputDir, `${caseNumber}.out`);
      await fs.writeFile(outFile, stdout);

      return { name: caseName, success: true };
    } catch (error: any) {
      const errorMessage = error.stderr || error.message || 'An unknown error occurred.';
      return { name: caseName, success: false, error: errorMessage };
    }
  }

  /**
   * Automatically finds the solution source file in a specific order.
   * @returns {Promise<string | null>} The path to the found file, or null.
   */
  private async findSolutionFile(): Promise<string | null> {
    const filesToTry = this.config.solution === DEFAULTS.solution
      ? SOLUTION_FALLBACKS
      : [this.config.solution];

    for (const file of filesToTry) {
      try {
        await fs.access(file);
        return file;
      } catch { }
    }
    return null;
  }

  /**
   * Cleans the entire output directory, with strict safety checks to prevent accidental deletion.
   * @returns {Promise<boolean>} True on successful cleanup, false on failure due to safety checks or errors.
   */
  private async cleanupOutputDirectory(): Promise<boolean> {
    const dir = this.config.outputDir;

    const FORBIDDEN_NAMES = ['src', 'node_modules', '.git', '.', '..', '/'];
    if (FORBIDDEN_NAMES.includes(path.basename(dir))) {
      consola.error(t('maker.safetyCheckForbidden', dir));
      return false;
    }

    const absoluteOutputDir = path.resolve(dir);
    const projectRoot = process.cwd();

    if (absoluteOutputDir === projectRoot) {
      consola.error(t('maker.safetyCheckRoot', dir));
      return false;
    }

    if (!absoluteOutputDir.startsWith(projectRoot)) {
      consola.error(t('maker.safetyCheckOutside', dir));
      return false;
    }

    consola.info(t('maker.cleaningOutputDir', dir));
    try {
      await fs.rm(dir, { recursive: true, force: true });
      consola.success(t('maker.cleanedOutputDir', dir));
      return true;
    } catch (error: any) {
      consola.error(t('maker.failedToRemoveDir', dir, error));
      return false;
    }
  }
}

// =============================================================================
// --- Unified Entrypoint Proxy ---
// =============================================================================

const handler: ProxyHandler<any> = {
  /**
   * The `get` trap of the Proxy, implementing an "implicit factory" pattern.
   *
   * 1. When any property of `Maker` is accessed (e.g., `Maker.configure`), this function is triggered.
   * 2. It **immediately creates a new `GenesisMaker` instance**.
   * 3. It then gets the method of the same name from that instance (e.g., `instance.configure`) and returns it.
   * 4. Key point: Since methods like `configure` return `this` (the newly created `instance`),
   *    subsequent chained calls (e.g., `.case(...)`) are made on that `instance`,
   *    and **will not** trigger the Proxy's `get` trap again.
   *
   * This pattern allows for a clean API call (`Maker.case(...)`) while ensuring that each call chain
   * starts with a clean, isolated instance.
   */
  get(target, prop) {
    const instance = new GenesisMaker();
    const method = (instance as any)[prop];

    if (typeof method === 'function') {
      return method.bind(instance);
    }
    return Reflect.get(instance, prop);
  },
};

// 1. Export the GenesisMaker class itself
export { GenesisMaker };

// 2. (Optional) Provide a clear factory function as syntactic sugar
export function createMaker(): GenesisMaker {
    return new GenesisMaker();
}

// 3. (Recommended) Use a Proxy to provide a more flexible unified entry point
export const Maker = new Proxy({}, handler) as unknown as GenesisMaker;