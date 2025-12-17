// src/index.ts

import { GenesisMaker } from './maker';
import { GenesisChecker } from './checker';

// --- Maker 导出 ---

const makerHandler: ProxyHandler<any> = {
  get(target, prop) {
    const instance = new GenesisMaker();
    const method = (instance as any)[prop];
    if (typeof method === 'function') {
      return method.bind(instance);
    }
    return Reflect.get(instance, prop);
  },
};

export const Maker = new Proxy({}, makerHandler) as unknown as GenesisMaker;
export { GenesisMaker };
export function createMaker(): GenesisMaker {
    return new GenesisMaker();
}


// --- Checker 导出 ---

const checkerHandler: ProxyHandler<any> = {
  get(target, prop) {
    const instance = new GenesisChecker();
    const method = (instance as any)[prop];
    if (typeof method === 'function') {
      return method.bind(instance);
    }
    return Reflect.get(instance, prop);
  },
};

export const Checker = new Proxy({}, checkerHandler) as unknown as GenesisChecker;
export { GenesisChecker };
export function createChecker(): GenesisChecker {
    return new GenesisChecker();
}


// --- 其他导出 ---

export { G } from './generator';
export type { GenesisConfig, CheckerConfig, CompareMode } from './types';