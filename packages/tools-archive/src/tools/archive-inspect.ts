import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { ARCHIVE_CATEGORY, ARCHIVE_LICENSES } from '../licenses.js';
import { detectArchiveKind, inspectZip, readTar, readTarGz } from '../zip-tar.js';
import { hasDoubleExtension, isExecutableName } from '../path-safe.js';

const options = z.object({});

export const archiveInspect = defineTool({
  id: 'archive-inspect',
  pack: 'archive',
  category: ARCHIVE_CATEGORY,
  title: { de: 'Archiv inspizieren', en: 'Inspect archive' },
  description: {
    de: 'Inhalt ohne volles Entpacken: Baum, Größen, Verdacht (Doppelendung, Executable, Zip-Bomb-Ratio).',
    en: 'List without full extract: tree, sizes, suspicion (double ext, executable, zip-bomb ratio).',
  },
  inputs: { accept: [MIME.zip, '*/*'], multiple: false, min: 1 },
  outputs: { mime: [MIME.json, MIME.md] },
  options,
  licenses: ARCHIVE_LICENSES,
  seo: { keywords: ['zip inspect', 'zip bomb'] },
  async run(ctx, files) {
    const file = files[0]!;
    const bytes = await file.bytes();
    const kind = detectArchiveKind(bytes, file.name);
    ctx.progress(0.4, kind);
    let entries = [];
    let warnings: string[] = [];
    if (kind === 'zip') {
      const info = inspectZip(bytes);
      entries = info.entries;
      warnings = info.warnings;
    } else {
      const filesMap = kind === 'tgz' ? readTarGz(bytes) : kind === 'tar' ? readTar(bytes) : {};
      entries = Object.entries(filesMap).map(([name, data]) => ({
        name,
        size: data.byteLength,
        directory: name.endsWith('/'),
        suspicious: [
          ...(isExecutableName(name) ? ['executable'] : []),
          ...(hasDoubleExtension(name) ? ['double-ext'] : []),
        ],
      }));
    }
    const report = { kind, entries, warnings };
    const md = ['# Archiv', '', `Format: ${kind}`, '', ...entries.map((e) => `- ${e.name} (${e.size} B) ${e.suspicious?.join(',') ?? ''}`)].join('\n');
    return {
      outputs: [
        neoFileFromBytes('archive-inspect.json', new TextEncoder().encode(JSON.stringify(report, null, 2)), MIME.json),
        neoFileFromBytes('archive-inspect.md', new TextEncoder().encode(md + '\n'), MIME.md),
      ],
      warnings,
      report: attachProvenance(report, await createProvenance('archive-inspect', {}, files)),
    };
  },
});
