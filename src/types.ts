export type OjProfile = 'auto' | 'linux' | 'windows' | 'none';

export interface DebugOptions {
  separator?: string;
  printDims?: boolean;
  printType?: boolean;
  printStats?: boolean;
  truncate?: number;
  colors?: boolean;
}

export type WeightOption = boolean | [min: number, max: number];

export type GraphType = 'simple' | 'tree' | 'dag' | 'bipartite' | 'wheel' | 'complete';

export interface GraphOptions {
  type?: GraphType;
  directed?: boolean;
  weighted?: WeightOption;
  connected?: boolean;
  noSelfLoops?: boolean;
  oneBased?: boolean;
  negativeCycle?: boolean;
}

export type TreeType = 'random' | 'path' | 'star';

export interface TreeOptions {
  type?: TreeType;
  weighted?: WeightOption;
  oneBased?: boolean;
}

export type BinaryTreeType = 'random' | 'complete' | 'skewed';

export interface BinaryTreeOptions {
  type?: BinaryTreeType;
  oneBased?: boolean;
}
