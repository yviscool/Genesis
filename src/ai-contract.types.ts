export type AiContractGeneratedBlock = {
  name: string;
  declarationLines: readonly string[];
};

export type AiContractGeneratedMethod = {
  name: string;
  signature: string;
  declarationLines: readonly string[];
};

export type AiContractGeneratedData = {
  headerDeclarations: readonly AiContractGeneratedBlock[];
  datasetDeclarations: readonly AiContractGeneratedBlock[];
  fmtMethods: readonly AiContractGeneratedMethod[];
  generatorMethods: readonly AiContractGeneratedMethod[];
  baseMethods: readonly AiContractGeneratedMethod[];
  charsetProperties: readonly string[];
};
