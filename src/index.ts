// src/index.ts

import { GenesisMaker } from './maker';
import { GenesisChecker } from './checker';

// =============================================================================
// --- 通用 Proxy 工厂 ---
// =============================================================================

/**
 * 创建一个自动实例化的 Proxy。
 * 每次访问属性时都会创建新实例，实现"隐式工厂"模式。
 * 这使得 `Maker.case(...)` 等链式调用无需显式 `new` 即可使用。
 */
function createAutoProxy<T extends object>(Ctor: new () => T): T {
  return new Proxy({} as T, {
    get(_, prop) {
      const instance = new Ctor();
      const value = (instance as any)[prop];
      return typeof value === 'function' ? value.bind(instance) : value;
    },
  });
}

// =============================================================================
// --- 导出 ---
// =============================================================================

// Maker
export const Maker = createAutoProxy(GenesisMaker);
export { GenesisMaker };
export function createMaker(): GenesisMaker {
  return new GenesisMaker();
}

// Checker
export const Checker = createAutoProxy(GenesisChecker);
export { GenesisChecker };
export function createChecker(): GenesisChecker {
  return new GenesisChecker();
}

// 其他
export { G } from './generator/index';
export type { GenesisConfig, CheckerConfig, CompareMode, WeightOption } from './types';