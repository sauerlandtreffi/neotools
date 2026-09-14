import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { throwIfAborted, type ToolContext } from '@neotools/engine';
import { createProgressSink } from './progress.js';
import type { FfmpegRunRequest, FfmpegRunResult } from './types.js';

function injectProgress(args: string[]): string[] {
  if (args.includes('-progress')) return ['-y', '-hide_banner', '-nostats', ...args];
  return ['-y', '-hide_banner', '-nostats', '-progress', 'pipe:1', ...args];
}

export async function runNativeFfmpeg(ctx: ToolContext | undefined, req: FfmpegRunRequest): Promise<FfmpegRunResult> {
  const dir = await mkdtemp(join(tmpdir(), 'neotools-ff-'));
  try {
    for (const input of req.inputs) {
      await writeFile(join(dir, input.name), input.data);
    }
    if (req.cwdExtra) {
      for (const [name, data] of Object.entries(req.cwdExtra)) {
        await writeFile(join(dir, name), data);
      }
    }
    const args = injectProgress(req.args);
    const logChunks: string[] = [];
    const onProgress = createProgressSink(ctx, req.durationHint);
    await new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
      const abort = () => {
        child.kill('SIGKILL');
      };
      ctx?.signal.addEventListener('abort', abort, { once: true });
      child.stdout?.on('data', (buf: Buffer) => {
        const text = buf.toString('utf8');
        logChunks.push(text);
        onProgress(text);
      });
      child.stderr?.on('data', (buf: Buffer) => {
        const text = buf.toString('utf8');
        logChunks.push(text);
        onProgress(text);
      });
      child.on('error', (err) => {
        ctx?.signal.removeEventListener('abort', abort);
        reject(err);
      });
      child.on('close', (code) => {
        ctx?.signal.removeEventListener('abort', abort);
        if (ctx?.signal.aborted) {
          const err = new Error('Abgebrochen');
          err.name = 'AbortError';
          reject(err);
          return;
        }
        if (code !== 0 && req.outputs.length) {
          reject(new Error(`FFmpeg beendete mit Code ${code}.\n${logChunks.join('').slice(-4000)}`));
          return;
        }
        resolve();
      });
    });
    throwIfAborted(ctx?.signal ?? new AbortController().signal);
    const files: Record<string, Uint8Array> = {};
    const names = new Set(req.outputs);
    if (req.outputPrefix) {
      for (const name of await readdir(dir)) {
        if (name.startsWith(req.outputPrefix)) names.add(name);
      }
    }
    for (const name of names) {
      try {
        files[name] = new Uint8Array(await readFile(join(dir, name)));
      } catch {
        // missing optional output
      }
    }
    return { files, log: logChunks.join(''), backend: 'native' };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function runNativeFfprobe(data: Uint8Array, name: string): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), 'neotools-fp-'));
  const input = join(dir, name);
  try {
    await writeFile(input, data);
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    const { stdout } = await exec(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', '-show_chapters', input],
      { timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
    );
    return stdout;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
