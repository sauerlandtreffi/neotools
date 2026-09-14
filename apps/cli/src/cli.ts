#!/usr/bin/env node
import { Command } from 'commander';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  createToolContext,
  decodePipelineHash,
  deserializePipeline,
  neoFileFromPath,
  runPipeline,
  runTool,
  writeNeoFile,
  type NeoFile,
  type Platform,
  type VerificationReport,
} from '@neotools/engine';
import { nodePlatformReady } from '@neotools/engine/platform/node';
import { createPdfRegistry } from '@neotools/tools-pdf';
import { registerForensicsTools } from '@neotools/tools-forensics';
import { registerImageAiTools } from '@neotools/tools-image-ai';
import { registerImageTools } from '@neotools/tools-image';
import { registerDachTools } from '@neotools/tools-dach';
import { addZodOptions, optionsFromFlags } from './flags.js';
import { batchOf, describeTool, hasBatchErrors, jsonResult, printTable } from './format.js';
import { listModelCatalog, runModelsFetch } from './models-cmd.js';

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_PARTIAL = 2;
export const EXIT_USAGE = 3;
export const EXIT_VERIFY = 4;

async function writeOutputs(outDir: string, files: NeoFile[]): Promise<string[]> {
  const { mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  await mkdir(outDir, { recursive: true });
  const paths: string[] = [];
  for (const file of files) {
    const dest = join(outDir, file.name);
    await writeNeoFile(file, dest);
    paths.push(dest);
  }
  return paths;
}

export async function runCli(
  argv: string[],
  io = { stdout: console.log.bind(console), stderr: console.error.bind(console) },
): Promise<number> {
  const registry = registerDachTools(registerImageTools(registerImageAiTools(registerForensicsTools(createPdfRegistry()))));
  let code = EXIT_OK;
  const program = new Command();
  program.exitOverride();
  program.name('neotools').description('Lokale PDF-Werkzeuge ohne Upload.').version('0.1.0');

  program
    .command('list')
    .description('Registrierte Tools anzeigen')
    .option('--json', 'JSON-Ausgabe')
    .action((opts: { json?: boolean }) => {
      const tools = registry.list().map((t) => ({
        id: t.id,
        pack: t.pack,
        category: t.category,
        title: t.title,
      }));
      if (opts.json) io.stdout(JSON.stringify(tools, null, 2));
      else for (const t of tools) io.stdout(`${t.id.padEnd(20)} ${t.title.de}`);
    });

  program
    .command('info')
    .argument('<toolId>')
    .option('--json', 'JSON-Ausgabe')
    .action((toolId: string, opts: { json?: boolean }) => {
      const tool = registry.get(toolId);
      if (!tool) {
        io.stderr(`Unbekanntes Tool: ${toolId}`);
        code = EXIT_USAGE;
        return;
      }
      if (opts.json) {
        io.stdout(
          JSON.stringify(
            {
              id: tool.id,
              title: tool.title,
              description: tool.description,
              inputs: tool.inputs,
              outputs: tool.outputs,
              licenses: tool.licenses,
            },
            null,
            2,
          ),
        );
      } else io.stdout(describeTool(tool));
    });

  const run = program
    .command('run')
    .argument('<toolId>')
    .argument('[files...]')
    .option('-o, --out <dir>', 'Ausgabeverzeichnis', 'out')
    .option('--json', 'JSON-Ausgabe');

  if (argv[0] === 'run' && argv[1]) {
    const tool = registry.get(argv[1]);
    if (tool) addZodOptions(run, tool.options);
  }

  run.action(async (toolId: string, files: string[], flags: Record<string, unknown>) => {
    const tool = registry.get(toolId);
    if (!tool) {
      io.stderr(`Unbekanntes Tool: ${toolId}`);
      code = EXIT_USAGE;
      return;
    }
    const fields = addZodOptions(new Command(), tool.options);
    const options = optionsFromFlags(fields, flags);
    let validated: unknown;
    try {
      validated = tool.options.parse(options);
    } catch (err) {
      io.stderr(err instanceof Error ? err.message : String(err));
      code = EXIT_USAGE;
      return;
    }
    if (!files.length) {
      io.stderr('Keine Eingabedateien.');
      code = EXIT_USAGE;
      return;
    }
    const neoFiles: NeoFile[] = [];
    for (const f of files) neoFiles.push(await neoFileFromPath(resolve(f)));
    const platform = await cliPlatform();
    const context = createToolContext({
      platform,
      progress: (v, m) => io.stderr(`${Math.round(v * 100)}% ${m ?? ''}`),
      log: (level, msg) => io.stderr(`[${level}] ${msg}`),
    });
    const result = await runTool(tool, context, neoFiles, validated);
    const outputs = await writeOutputs(String(flags.out ?? 'out'), result.outputs);
    if (flags.json) io.stdout(jsonResult(result, outputs));
    else {
      printTable(batchOf(result));
      for (const w of result.warnings) io.stderr(`warn: ${w}`);
      const verification = result.report?.['verification'] as VerificationReport | undefined;
      if (verification) {
        io.stdout(verification.passed ? 'verification: passed' : 'verification: failed');
        for (const check of verification.checks) {
          io.stdout(`  ${check.passed ? 'OK' : 'FAIL'} ${check.id}${check.detail ? ` — ${check.detail}` : ''}`);
        }
      }
      for (const p of outputs) io.stdout(p);
    }
    const verification = result.report?.['verification'] as VerificationReport | undefined;
    if (hasBatchErrors(result) && !result.outputs.length) code = EXIT_ERROR;
    else if (hasBatchErrors(result)) code = EXIT_PARTIAL;
    else if (verification && !verification.passed) code = EXIT_VERIFY;
  });

  program
    .command('pipeline')
    .argument('<config>')
    .argument('[files...]')
    .option('-o, --out <dir>', 'Ausgabeverzeichnis', 'out')
    .option('--json', 'JSON-Ausgabe')
    .action(async (config: string, files: string[], flags: { out?: string; json?: boolean }) => {
      let spec;
      try {
        if (config.startsWith('#') || config.startsWith('p=')) {
          spec = decodePipelineHash(config);
          if (!spec) throw new Error('Ungültiger Pipeline-Hash.');
        } else {
          spec = deserializePipeline(await readFile(resolve(config), 'utf8'));
        }
      } catch (err) {
        io.stderr(err instanceof Error ? err.message : String(err));
        code = EXIT_USAGE;
        return;
      }
      const neoFiles: NeoFile[] = [];
      for (const f of files) neoFiles.push(await neoFileFromPath(resolve(f)));
      const platform = await cliPlatform();
      const result = await runPipeline(
        registry,
        spec,
        neoFiles,
        createToolContext({
          platform,
          progress: (v, m) => io.stderr(`${Math.round(v * 100)}% ${m ?? ''}`),
        }),
      );
      const outputs = await writeOutputs(flags.out ?? 'out', result.outputs);
      if (flags.json) io.stdout(jsonResult(result, outputs));
      else outputs.forEach((p) => io.stdout(p));
      if (hasBatchErrors(result)) code = EXIT_PARTIAL;
    });

  const models = program.command('models').description('Lokale ONNX-/Transformers-Modelle (kein CDN)');
  models
    .command('fetch')
    .argument('[tool]', 'Tool-ID')
    .option('--all', 'Alle Modelle der Registry')
    .action(async (tool: string | undefined, flags: { all?: boolean }) => {
      if (!flags.all && !tool) {
        io.stderr('neotools models fetch <tool>  oder  --all');
        code = EXIT_USAGE;
        return;
      }
      code = await runModelsFetch(tool, Boolean(flags.all));
    });
  models.command('list').argument('[tool]').action((tool?: string) => {
    for (const m of listModelCatalog(tool)) {
      io.stdout(`${m.id.padEnd(22)} ${(m.sizeBytes / 1e6).toFixed(1)} MB  ${m.license}  ${m.tools.join(',')}`);
    }
  });

  try {
    await program.parseAsync(argv, { from: 'user' });
    return code;
  } catch (err) {
    const commanderCode = (err as { exitCode?: number }).exitCode;
    if (typeof commanderCode === 'number') {
      if (commanderCode === 0) return code;
      io.stderr(err instanceof Error ? err.message : String(err));
      return commanderCode === 1 ? EXIT_USAGE : EXIT_ERROR;
    }
    io.stderr(err instanceof Error ? err.message : String(err));
    return EXIT_ERROR;
  }
}

async function cliPlatform(): Promise<Platform> {
  return nodePlatformReady();
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
if (invoked && fileURLToPath(import.meta.url) === invoked) {
  runCli(process.argv.slice(2)).then((status) => {
    process.exitCode = status;
  });
}
