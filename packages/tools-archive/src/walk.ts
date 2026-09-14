import { neoFileFromBytes, type NeoFile } from '@neotools/engine';

export async function filesFromRootPath(rootPath: string): Promise<NeoFile[]> {
  if (!rootPath) return [];
  const { readdir, readFile, stat } = await import('node:fs/promises');
  const { join, relative } = await import('node:path');
  const out: NeoFile[] = [];
  const walk = async (dir: string): Promise<void> => {
    const ents = await readdir(dir, { withFileTypes: true });
    for (const ent of ents) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile()) {
        const buf = await readFile(full);
        const rel = relative(rootPath, full).replace(/\\/g, '/');
        out.push(neoFileFromBytes(rel, new Uint8Array(buf)));
      }
    }
  };
  const st = await stat(rootPath);
  if (st.isFile()) {
    const buf = await readFile(rootPath);
    out.push(neoFileFromBytes(rootPath.split(/[\\/]/).pop() ?? 'file', new Uint8Array(buf)));
    return out;
  }
  await walk(rootPath);
  return out;
}

export async function gatherFiles(files: NeoFile[], rootPath: string): Promise<NeoFile[]> {
  if (!rootPath) return [...files];
  try {
    return [...files, ...(await filesFromRootPath(rootPath))];
  } catch {
    return [...files];
  }
}
