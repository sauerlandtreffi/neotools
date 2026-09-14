import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { applyTextWatermark } from '@neotools/tools-image';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap } from '../common.js';
import { encodeNamed, fillSolid } from '../raster.js';
import { encodeVideo, fileFromOutput, fontExtra, fontFileName, mp4Tail, probe, requireFfmpeg } from '../media.js';

const options = z.object({
  csvText: z.string().default('title,subtitle,seconds\nHello,World,2\n'),
  mode: z.enum(['clips', 'slate', 'countdown']).default('clips'),
  width: z.coerce.number().min(320).max(1920).default(1280),
  height: z.coerce.number().min(180).max(1080).default(720),
  color: z.string().default('#111827'),
});

interface Row {
  title: string;
  subtitle: string;
  seconds: number;
}

function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const start = /title/i.test(lines[0] ?? '') ? 1 : 0;
  const rows: Row[] = [];
  for (const line of lines.slice(start)) {
    const [title, subtitle, seconds] = line.split(',').map((s) => s.trim());
    if (!title) continue;
    rows.push({ title, subtitle: subtitle ?? '', seconds: Math.max(0.4, Number(seconds) || 2) });
  }
  return rows;
}

export const creatorIntroOutro = defineTool({
  id: 'creator-intro-outro',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Intro / Outro / Lower-Thirds', en: 'Intro / outro / lower-thirds' },
  description: {
    de: 'Titel/Lower-Thirds aus CSV → Clips, End-Slate, Countdown.',
    en: 'Titles/lower-thirds from CSV → clips, end slate, countdown.',
  },
  inputs: { accept: ['text/csv', 'text/plain', '.csv', '.txt', 'image/png', 'image/jpeg'], multiple: true, min: 0 },
  outputs: { mime: ['video/mp4', 'image/png'] },
  options,
  presets: [
    { id: 'slate', title: { de: 'End-Slate', en: 'End slate' }, options: { mode: 'slate' } },
    { id: 'countdown', title: { de: 'Countdown', en: 'Countdown' }, options: { mode: 'countdown' } },
  ],
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['intro', 'outro', 'lower third', 'countdown'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const csvFile = files.find((f) => /\.(csv|txt)$/i.test(f.name) || f.mime.startsWith('text/'));
    const csv = csvFile ? new TextDecoder().decode(await csvFile.bytes()) : parsed.csvText;
    let rows = parseCsv(csv);
    if (parsed.mode === 'countdown') {
      rows = [3, 2, 1].map((n) => ({ title: String(n), subtitle: '', seconds: 1 }));
    }
    if (parsed.mode === 'slate' && !rows.length) rows = [{ title: 'ENDE', subtitle: '', seconds: 3 }];
    await requireFfmpeg(ctx);
    const extra = await fontExtra();
    const outputs = [];
    for (let i = 0; i < rows.length; i++) {
      ctx.progress((i + 1) / rows.length, rows[i]!.title);
      const row = rows[i]!;
      const card = fillSolid(parsed.width, parsed.height, parsed.color);
      await applyTextWatermark(card.data, parsed.width, parsed.height, row.title, {
        position: 'center',
        opacity: 1,
        scale: 2,
        color: '#ffffff',
      });
      if (row.subtitle) {
        await applyTextWatermark(card.data, parsed.width, parsed.height, row.subtitle, {
          position: 's',
          opacity: 0.9,
          scale: 1,
          color: '#cbd5e1',
        });
      }
      const pngName = `card-${i + 1}.png`;
      const png = await encodeNamed({ width: parsed.width, height: parsed.height, data: card.data, meta: emptyMeta() }, 'png', pngName);
      extra[pngName] = await png.bytes();
      outputs.push(png);
      const name = `clip-${i + 1}.mp4`;
      const bytes = await encodeVideo(
        ctx,
        ['-loop', '1', '-i', pngName, '-t', String(row.seconds), '-vf', `scale=${parsed.width}:${parsed.height}`, ...mp4Tail(), name],
        [],
        name,
        extra,
        row.seconds,
      );
      outputs.push(fileFromOutput(name, bytes));
    }
    void fontFileName;
    const firstVid = outputs.find((o) => o.name.endsWith('.mp4'));
    return wrap('creator-intro-outro', files, outputs, parsed, {
      clips: rows.length,
      duration: firstVid ? (await probe(firstVid, ctx)).duration : 0,
    });
  },
});

function emptyMeta(): import('@neotools/tools-image').DecodedImage['meta'] {
  return {
    format: 'png',
    mime: 'image/png',
    orientation: 1,
    pages: 1,
    colorSpace: 'srgb',
    iccTagged: false,
    comments: [],
  };
}

void neoFileFromBytes;
