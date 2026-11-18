export { defineDataset, isDataset } from './dataset';
export type {
  Dataset,
  DatasetCase,
  DatasetConfig,
  DatasetGenerateContext,
  DatasetGeneratedCase,
  DatasetStaticCase,
  DatasetValidationContext,
  DatasetValidationResult,
  DatasetValidationReturn,
} from './dataset';

export { checkConstraints, parseConstraintPath } from './constraints';
export type { DatasetConstraints, FieldConstraint } from './constraints';

export { fmt, createFormatDocument, isFormatDocument, isFormatNode, normalizeFormat, renderFormatDocument } from './format';
export type {
  FormatAtom,
  FormatDocument,
  FormatGrid,
  FormatLine,
  FormatNode,
  FormatRaw,
  FormatRowsOptions,
  FormatSeq,
  FormatTable,
  FormatTableOptions,
} from './format';

export { createGenerator, createSeededRng } from './generator/factory';
export type { DatasetGenerator, SeedInput } from './generator/factory';

export {
  expandDatasetCases,
  generateDataset,
  generateDatasetFromFile,
  loadDatasetFromFile,
  replayDataset,
  replayDatasetFromFile,
  resolveDatasetConfig,
  selectDatasetCases,
  validateDataset,
  validateDatasetFromFile,
} from './dataset-runner';
export type {
  DatasetCaseRecord,
  DatasetCaseSelector,
  DatasetCaseStatus,
  DatasetErrorPhase,
  DatasetErrorRecord,
  DatasetFileRecord,
  DatasetManifest,
  DatasetManifestSummary,
  DatasetReplayInfo,
  DatasetReplaySelector,
  DatasetRunOptions,
  DatasetRunResult,
  DatasetValidationSummary,
  ExpandedDatasetCase,
} from './dataset-runner';

export {
  MANIFEST_PATH_BASE,
  MANIFEST_VERSION,
  buildExecutionFingerprint,
  defaultManifestPath,
  describeFile,
  digestFile,
  readManifest,
  relativizePath,
  resolveManifestPath,
  sourceMatches,
  toPortablePath,
  writeManifest,
} from './manifest';
export type {
  FileDigest,
  LoadedManifest,
  ManifestBuildInput,
  ManifestBuildResult,
  ManifestExecutionRef,
  ManifestFileRef,
  ManifestReplayRef,
  ManifestSourceRef,
} from './manifest';

export { checkDataset, checkDatasetFromFile } from './check';
export type { DatasetCheckOptions, DatasetCheckReport, DriftCode, DriftIssue } from './check';

export {
  defaultLintAllowance,
  formatLintIssue,
  lintDatasetConfig,
  lintMakerSource,
} from './lint';
export type { LintAllowance, LintIssue, LintOptions, LintSeverity } from './lint';

export {
  AI_BASE_METHOD_SIGNATURES,
  AI_CHARSET_PROPERTIES,
  AI_FMT_METHOD_SIGNATURES,
  AI_GENERATOR_METHOD_SIGNATURES,
  analyzeProblemStatement,
  isAiFormatMethodName,
  isAiGeneratorMethodName,
  renderAiGenesisContractDts,
  renderAiGenesisContractMarkdown,
  resolveAiContractAllowance,
  selectAiContract,
} from './ai-contract';
export type { AiContractAllowance, AiContractSelection, AiProblemProfile } from './ai-contract';
