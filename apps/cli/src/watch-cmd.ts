import { mkdir, readFile, rename, copyFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { watch as chokidarWatch, type FSWatcher } from 'chokidar';
import {
  applyTeamPresets,
  createToolContext,
  deserializePipeline,
  neoFileFromPath,
  runPipeline,
  writeNeoFile,
  type Registry,
} from '@neotools/engine';
import { nodePlatformReady } from '@neotools/engine/platform/node';
import { hasFeature, verifyLicense } from '@neotools/license';
import { defaultJournalPath, fileHash, WatchJournal } from './watch-journal.js';

export interface WatchOptions {
  dir: string;
  pipeline: string;
  out: string;
  pattern?: string;
  moveProcessed?: string;
  poll?: string;
  fsEvents?: boolean;
  presets?: unknown;
  licenseToken?: string;
  licensePubkey?: string;
  once?: string[];
}

function matchPattern(name: string, pattern?: string): boolean {
  if (!pattern || pattern === '*' || pattern === '*.*') return true;
  if (pattern.startsWith('*.')) return name.toLowerCase().endsWith(pattern.slice(1).toLowerCase());
  return name.includes(pattern.replace(/^\*/, ''));
}

function pollMs(raw?: string): number | undefined {
  if (!raw) return undefined;
  const m = /^(\d+(?:\.\d+)?)(ms|s)?$/.exec(raw.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  return (m[2] ?? 's') === 'ms' ? n : n * 1000;
}

export async function processWatchPath(
  filePath: string,
  opts: {
    registry: Registry;
    spec: { steps: Array<{ toolId: string; options: unknown; whenMime?: string[] }> };
    outDir: string;
    errorDir: string;
    journal: WatchJournal;
    moveProcessed?: string;
    log: (m: string) => void;
  },
): Promise<'ok' | 'skipped' | 'error'> {
  const bytes = new Uint8Array(await readFile(filePath));
  const hash = fileHash(bytes);
  if (opts.journal.has(hash)) {
    opts.log(`skip ${filePath} (${hash.slice(0, 8)})`);
    return 'skipped';
  }
  try {
    const platform = await nodePlatformReady();
    const file = await neoFileFromPath(filePath);
    const result = await runPipeline(
      opts.registry,
      opts.spec,
      [file],
      createToolContext({ platform }),
    );
    await mkdir(opts.outDir, { recursive: true });
    for (const out of result.outputs) {
      await writeNeoFile(out, join(opts.outDir, out.name));
    }
    if (opts.moveProcessed) {
      await mkdir(opts.moveProcessed, { recursive: true });
      await rename(filePath, join(opts.moveProcessed, basename(filePath))).catch(async () => {
        await copyFile(filePath, join(opts.moveProcessed!, basename(filePath)));
      });
    }
    await opts.journal.record({
      hash,
      path: filePath,
      processedAt: new Date().toISOString(),
      status: 'ok',
    });
    opts.log(`ok ${filePath} → ${opts.outDir}`);
    return 'ok';
  } catch (err) {
    await mkdir(opts.errorDir, { recursive: true });
    try {
      await copyFile(filePath, join(opts.errorDir, basename(filePath)));
    } catch {
      // ignore
    }
    await opts.journal.record({
      hash,
      path: filePath,
      processedAt: new Date().toISOString(),
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
    opts.log(`error ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return 'error';
  }
}

export async function runWatch(
  registry: Registry,
  opts: WatchOptions,
  io: { stdout: (m: string) => void; stderr: (m: string) => void },
): Promise<number> {
  const license = await verifyLicense(
    opts.licenseToken ?? process.env.NEOTOOLS_LICENSE,
    opts.licensePubkey ?? process.env.NEOTOOLS_LICENSE_PUBKEY,
  );
  if (!hasFeature('watch', license)) {
    io.stderr(
      'Watch-Ordner-Automatik ist ein Pro/Enterprise-Feature. Community-Tools (run/pipeline) bleiben frei.',
    );
    return 3;
  }
  let active = registry;
  if (opts.presets) {
    try {
      active = applyTeamPresets(registry, opts.presets);
    } catch (err) {
      io.stderr(err instanceof Error ? err.message : String(err));
      return 3;
    }
  }
  const spec = deserializePipeline(await readFile(resolve(opts.pipeline), 'utf8'));
  const outDir = resolve(opts.out);
  const errorDir = join(outDir, 'errors');
  const journal = new WatchJournal(defaultJournalPath(outDir));
  await journal.load();

  const handle = async (filePath: string): Promise<'ok' | 'skipped' | 'error' | undefined> => {
    if (!matchPattern(basename(filePath), opts.pattern)) return undefined;
    return processWatchPath(filePath, {
      registry: active,
      spec,
      outDir,
      errorDir,
      journal,
      moveProcessed: opts.moveProcessed ? resolve(opts.moveProcessed) : undefined,
      log: io.stdout,
    });
  };

  if (opts.once?.length) {
    let code = 0;
    for (const p of opts.once) {
      const status = await handle(resolve(p));
      if (status === 'error') code = 1;
    }
    return code;
  }

  const interval = pollMs(opts.poll);
  const watcher: FSWatcher = chokidarWatch(resolve(opts.dir), {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
    usePolling: Boolean(interval) && !opts.fsEvents,
    interval: interval ?? 2000,
    persistent: true,
  });
  watcher.on('add', (p) => {
    void handle(p);
  });
  io.stdout(`watch ${opts.dir} → ${outDir}`);
  await new Promise<void>((resolveWait, reject) => {
    watcher.on('error', reject);
    process.once('SIGINT', () => {
      void watcher.close().then(() => resolveWait());
    });
  });
  return 0;
}
