import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { ARCHIVE_CATEGORY, ARCHIVE_LICENSES } from '../licenses.js';
import { detectArchiveKind, inspectZip, readTar, readTarGz } from '../zip-tar.js';

const options = z.object({});

export const archiveTest = defineTool({
  id: 'archive-test',
  pack: 'archive',
  category: ARCHIVE_CATEGORY,
  title: { de: 'Archiv prüfen', en: 'Test archive' },
  description: {
    de: 'Integrität: CRC/Lesen, truncated erkennen, Reparaturvorschlag (kein Auto-Repair).',
    en: 'Integrity: CRC/read, detect truncated, suggest repair (no auto-repair).',
  },
  inputs: { accept: ['*/*'], multiple: false, min: 1 },
  outputs: { mime: [MIME.json, MIME.md] },
  options,
  licenses: ARCHIVE_LICENSES,
  seo: { keywords: ['zip test', 'crc'] },
  async run(_ctx, files) {
    const file = files[0]!;
    const bytes = await file.bytes();
    const kind = detectArchiveKind(bytes, file.name);
    let truncated = false;
    let ok = true;
    const notes: string[] = [];
    try {
      if (kind === 'zip') {
        const info = inspectZip(bytes);
        truncated = info.truncated;
        ok = !truncated;
        notes.push(...info.warnings);
      } else if (kind === 'tar') void readTar(bytes);
      else if (kind === 'tgz') void readTarGz(bytes);
      else {
        ok = false;
        notes.push('Format nicht nativ testbar.');
      }
    } catch (err) {
      ok = false;
      truncated = true;
      notes.push(err instanceof Error ? err.message : String(err));
    }
    if (truncated) notes.push('Reparaturvorschlag: Archiv mit einem Desktop-Werkzeug neu packen; kein Auto-Repair hier.');
    const payload = { kind, ok, truncated, notes };
    return {
      outputs: [
        neoFileFromBytes('archive-test.json', new TextEncoder().encode(JSON.stringify(payload, null, 2)), MIME.json),
        neoFileFromBytes('archive-test.md', new TextEncoder().encode(`# Test\n\n${ok ? 'ok' : 'fehler'}\n\n${notes.join('\n')}\n`), MIME.md),
      ],
      warnings: notes,
      report: attachProvenance(payload, await createProvenance('archive-test', {}, files)),
    };
  },
});
