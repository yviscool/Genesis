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

export { fmt, createFormatDocument, isFormatDocument, isFormatNode, normalizeFormat, renderFormatDocument } from './format';
export type {
  FormatAtom,
  FormatDocument,
  FormatGrid,
  FormatLine,
  FormatNode,
  FormatRaw,
  FormatTable,
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
  validateDataset,
  validateDatasetFromFile,
} from './dataset-runner';
export type {
  DatasetCaseRecord,
  DatasetErrorPhase,
  DatasetErrorRecord,
  DatasetFileRecord,
  ExpandedDatasetCase,
  DatasetManifest,
  DatasetReplayInfo,
  DatasetReplaySelector,
  DatasetRunOptions,
  DatasetRunResult,
  DatasetValidationSummary,
} from './dataset-runner';
