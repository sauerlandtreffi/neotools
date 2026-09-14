import { z } from 'zod';
import { defineTool, neoFileFromBytes, MIME } from '@neotools/engine';
import { parseJpeg, parsePng } from '@neotools/parsers';
import { IMAGE_ACCEPT, IMAGE_LICENSES } from './common.js';
import { attachProvenance, createProvenance } from '@neotools/engine';

const options = z.object({});

const PNG_OK = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'sRGB', 'iCCP', 'cHRM', 'pHYs', 'tEXt', 'iTXt', 'zTXt']);

export const imageHiddenLayerCheck = defineTool({
  id: 'image-hidden-layer-check',
  pack: 'image',
  category: 'images',
  title: { de: 'Hidden-Layer-Check (Bild)', en: 'Hidden layer check (image)' },
  description: {
    de: 'PNG-Zusatzchunks, JPEG-Anhang/Polyglot. Tiefer: forensics-hidden-data.',
    en: 'PNG extra chunks, JPEG trailer/polyglot. Deeper: forensics-hidden-data.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: [MIME.json] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['hidden layer', 'polyglot'] },
  async run(ctx, files) {
    const findings: unknown[] = [];
    for (const file of files) {
      ctx.progress(0.4, file.name);
      const bytes = await file.bytes();
      const png = parsePng(bytes);
      if (png) {
        const extra = png.chunks.filter((c) => !PNG_OK.has(c.type)).map((c) => c.type);
        findings.push({ file: file.name, kind: 'png', extraChunks: extra, suspicious: extra.length > 0 });
      }
      const jpeg = parseJpeg(bytes);
      if (jpeg) {
        const trailer = jpeg.eoiOffset >= 0 ? Math.max(0, bytes.length - (jpeg.eoiOffset + 2)) : 0;
        findings.push({
          file: file.name,
          kind: 'jpeg',
          afterEoi: trailer > 2 ? trailer : 0,
          suspicious: trailer > 64 || String.fromCharCode(...bytes.slice(-128)).includes('PK\x03\x04'),
        });
      }
      if (!png && !jpeg) findings.push({ file: file.name, kind: 'other', suspicious: false });
    }
    return {
      outputs: [neoFileFromBytes('hidden-layer.json', new TextEncoder().encode(JSON.stringify({ findings }, null, 2)), MIME.json)],
      warnings: [],
      report: attachProvenance({ findings }, await createProvenance('image-hidden-layer-check', {}, files)),
    };
  },
});
