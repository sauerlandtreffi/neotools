import { z } from 'zod';
import { defineTool, neoFileFromBytes, MIME } from '@neotools/engine';
import { readImageMetadata } from '../meta/read.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES } from './common.js';
import { attachProvenance, createProvenance } from '@neotools/engine';

const options = z.object({
  format: z.enum(['gpx', 'kml', 'both']).default('both'),
});

export const imageGeotagExport = defineTool({
  id: 'image-geotag-export',
  pack: 'image',
  category: 'images',
  title: { de: 'Geotag → GPX/KML', en: 'Geotag → GPX/KML' },
  description: { de: 'EXIF-GPS einer Bildserie als GPX/KML.', en: 'EXIF GPS from an image series as GPX/KML.' },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['application/gpx+xml', 'application/vnd.google-earth.kml+xml', MIME.json] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['gpx', 'kml', 'exif gps'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const pts: Array<{ name: string; lat: number; lon: number }> = [];
    for (const file of files) {
      const meta = readImageMetadata(await file.bytes(), file.name);
      if (meta.gps?.lat != null && meta.gps.lon != null) pts.push({ name: file.name, lat: meta.gps.lat, lon: meta.gps.lon });
    }
    const outputs = [];
    if (parsed.format !== 'kml') {
      const gpx = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="NeoTools"><trk><name>EXIF</name><trkseg>${pts
        .map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"><name>${esc(p.name)}</name></trkpt>`)
        .join('')}</trkseg></trk></gpx>`;
      outputs.push(neoFileFromBytes('geotags.gpx', new TextEncoder().encode(gpx), 'application/gpx+xml'));
    }
    if (parsed.format !== 'gpx') {
      const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${pts
        .map((p) => `<Placemark><name>${esc(p.name)}</name><Point><coordinates>${p.lon},${p.lat},0</coordinates></Point></Placemark>`)
        .join('')}</Document></kml>`;
      outputs.push(neoFileFromBytes('geotags.kml', new TextEncoder().encode(kml), 'application/vnd.google-earth.kml+xml'));
    }
    outputs.push(neoFileFromBytes('geotags.json', new TextEncoder().encode(JSON.stringify({ points: pts }, null, 2)), MIME.json));
    return {
      outputs,
      warnings: pts.length ? [] : ['Keine EXIF-GPS-Punkte gefunden.'],
      report: attachProvenance({ points: pts.length }, await createProvenance('image-geotag-export', parsed, files)),
    };
  },
});

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
