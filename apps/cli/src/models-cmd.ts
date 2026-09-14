import { allRegisteredModels, registeredModelsForTool } from '@neotools/models';
import '@neotools/tools-image-ai';
import '@neotools/tools-speech';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function runModelsFetch(tool: string | undefined, all: boolean): Promise<number> {
  const script = fileURLToPath(new URL('../../../packages/models/scripts/fetch-models.mjs', import.meta.url));
  const args = all || !tool ? ['--all'] : ['--tool', tool];
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

export function listModelCatalog(tool?: string) {
  return tool ? registeredModelsForTool(tool) : allRegisteredModels();
}
