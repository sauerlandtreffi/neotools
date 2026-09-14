export type { ExtensionAssessment } from '../../../../packages/tools-forensics/src/identify/fake-ext.ts';
import {
  assessExtension as assessForensics,
  type Assessable,
  type ExtensionAssessment,
} from '../../../../packages/tools-forensics/src/identify/fake-ext.ts';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|avif|svg)$/i;
const MARKUP = /<\s*(svg|html|script|iframe)\b/i;

function worse(
  a: ExtensionAssessment['severity'],
  b: ExtensionAssessment['severity'],
): ExtensionAssessment['severity'] {
  const order: ExtensionAssessment['severity'][] = ['ok', 'low', 'medium', 'high', 'critical'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

/** Magic-byte + markup check — renaming .html → .png must not hide the warning. */
export async function assessExtension(file: Assessable): Promise<ExtensionAssessment> {
  const result = await assessForensics(file);
  const bytes = 'bytes' in file && typeof file.bytes !== 'function' ? file.bytes : await (file as { bytes: () => Promise<Uint8Array> }).bytes();
  const name = file.name;
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 800));
  if (IMAGE_EXT.test(name) && MARKUP.test(head)) {
    result.severity = worse(result.severity, head.includes('<script') ? 'high' : 'medium');
    result.dangerous = result.severity === 'high' || result.severity === 'critical';
    result.mismatch = true;
    result.reasons.push({
      de: `Datei ${name} ist Markup/SVG, keine Rastergrafik — Umbenennung umgeht die Warnung nicht.`,
      en: `File ${name} is markup/SVG, not a raster image — renaming does not bypass the warning.`,
    });
  }
  return result;
}
