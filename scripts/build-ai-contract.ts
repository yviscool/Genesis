import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildAiContractGeneratedData, renderAiContractGeneratedSource } from '../src/ai-contract-builder';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(__dirname, '..');

export async function writeAiContractArtifacts(projectRoot = defaultProjectRoot): Promise<void> {
  const generatedData = buildAiContractGeneratedData(projectRoot);
  const generatedFilePath = path.join(projectRoot, 'src', 'ai-contract.generated.ts');
  const snapshotFilePath = path.join(projectRoot, 'examples', 'ai-genesis-contract.d.ts');

  await fs.writeFile(generatedFilePath, renderAiContractGeneratedSource(generatedData), 'utf8');

  const aiContractModuleUrl = `${pathToFileURL(path.join(projectRoot, 'src', 'ai-contract.ts')).href}?t=${Date.now()}`;
  const aiContractModule = await import(aiContractModuleUrl);

  await fs.writeFile(snapshotFilePath, aiContractModule.renderAiGenesisContractDts(), 'utf8');

  console.log(`generated=${generatedFilePath}`);
  console.log(`snapshot=${snapshotFilePath}`);
}

if (import.meta.main) {
  writeAiContractArtifacts().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
