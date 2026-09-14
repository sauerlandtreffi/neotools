import { z } from 'zod';
import { defineTool, neoFileFromBytes, MIME } from '@neotools/engine';
import { IMAGE_ACCEPT, IMAGE_LICENSES, stem } from './common.js';
import { attachProvenance, createProvenance } from '@neotools/engine';

const options = z.object({
  mode: z.enum(['split', 'write']).default('split'),
});

const VIDEO_ACCEPT = ['video/quicktime', 'video/mp4', '.mov', '.mp4'];

function findFtyp(bytes: Uint8Array): number {
  for (let i = 0; i < bytes.length - 8; i++) {
    if (bytes[i + 4] === 0x66 && bytes[i + 5] === 0x74 && bytes[i + 6] === 0x79 && bytes[i + 7] === 0x70) {
      return i;
    }
  }
  return -1;
}

function microOffset(xmp: string): number | undefined {
  const m = /MicroVideoOffset[^0-9]*(\d+)/.exec(xmp) || /Item:Length[^0-9]*(\d+)/.exec(xmp);
  return m ? Number(m[1]) : undefined;
}

export const imageLivePhoto = defineTool({
  id: 'image-live-photo',
  pack: 'image',
  category: 'images',
  title: { de: 'Live Photo / Motion Photo', en: 'Live Photo / Motion Photo' },
  description: {
    de: 'HEIC+MOV zerlegen oder Google-Motion-Photo (JPEG+MP4+XMP) lesen/schreiben.',
    en: 'Split HEIC+MOV or read/write Google Motion Photo (JPEG+MP4+XMP).',
  },
  inputs: { accept: [...IMAGE_ACCEPT, ...VIDEO_ACCEPT], multiple: true, min: 1 },
  outputs: { mime: ['image/jpeg', 'video/mp4', 'video/quicktime', 'application/json'] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['live photo', 'motion photo'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs = [];
    const report: Record<string, unknown> = { mode: parsed.mode };
    if (parsed.mode === 'write') {
      const still = files.find((f) => /^image\//.test(f.mime) || /\.(jpe?g|heic|png)$/i.test(f.name)) ?? files[0]!;
      const clip = files.find((f) => f !== still) ?? files[1];
      if (!clip) throw new Error('Schreiben braucht Still + Clip.');
      const jpeg = await still.bytes();
      const mp4 = await clip.bytes();
      const offset = jpeg.byteLength;
      const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:GCamera="http://ns.google.com/photos/1.0/camera/" GCamera:MicroVideo="1" GCamera:MicroVideoVersion="1" GCamera:MicroVideoOffset="${mp4.byteLength}" GCamera:MicroVideoPresentationTimestampUs="0"/></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
      const merged = new Uint8Array(jpeg.byteLength + mp4.byteLength);
      merged.set(jpeg, 0);
      merged.set(mp4, jpeg.byteLength);
      outputs.push(neoFileFromBytes(`${stem(still.name)}-motion.jpg`, merged, MIME.jpeg));
      outputs.push(neoFileFromBytes('motion-photo.json', new TextEncoder().encode(JSON.stringify({ offset, xmp }, null, 2)), MIME.json));
      report.offset = offset;
    } else {
      for (const file of files) {
        ctx.progress(0.4, file.name);
        const bytes = await file.bytes();
        const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, 256_000)));
        const off = microOffset(text);
        const ftyp = findFtyp(bytes);
        if (off && off < bytes.length) {
          const videoStart = bytes.length - off;
          outputs.push(neoFileFromBytes(`${stem(file.name)}-still.jpg`, bytes.subarray(0, videoStart), MIME.jpeg));
          outputs.push(neoFileFromBytes(`${stem(file.name)}-clip.mp4`, bytes.subarray(videoStart), 'video/mp4'));
          report.googleMotion = true;
        } else if (ftyp > 1000 && /^image\//.test(file.mime)) {
          outputs.push(neoFileFromBytes(`${stem(file.name)}-still.jpg`, bytes.subarray(0, ftyp), MIME.jpeg));
          outputs.push(neoFileFromBytes(`${stem(file.name)}-clip.mp4`, bytes.subarray(ftyp), 'video/mp4'));
          report.ftypOffset = ftyp;
        } else {
          outputs.push(neoFileFromBytes(file.name, bytes, file.mime));
        }
      }
    }
    return {
      outputs,
      warnings: [],
      report: attachProvenance(report, await createProvenance('image-live-photo', parsed, files)),
    };
  },
});
