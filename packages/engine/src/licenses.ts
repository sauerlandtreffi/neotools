import type { Registry } from './registry.js';
import type { ToolLicense } from './types.js';

export const PLATFORM_LICENSES: ToolLicense[] = [
  { name: 'NeoTools (eigener Code)', license: 'MIT', url: 'https://opensource.org/licenses/MIT' },
  { name: 'Astro', license: 'MIT', url: 'https://github.com/withastro/astro' },
  { name: 'Preact', license: 'MIT', url: 'https://github.com/preactjs/preact' },
  { name: 'Tailwind CSS', license: 'MIT', url: 'https://github.com/tailwindlabs/tailwindcss' },
  { name: 'Zod', license: 'MIT', url: 'https://github.com/colinhacks/zod' },
  { name: 'Comlink', license: 'Apache-2.0', url: 'https://github.com/GoogleChromeLabs/comlink' },
  { name: 'fflate', license: 'MIT', url: 'https://github.com/101arrowz/fflate' },
  { name: 'qpdf-wasm (@jspawn/qpdf-wasm)', license: 'Apache-2.0', url: 'https://github.com/jsscheller/qpdf-wasm' },
  { name: '@cantoo/pdf-lib', license: 'MIT', url: 'https://github.com/cantoo-scribe/pdf-lib' },
  { name: '@jsquash/jpeg', license: 'Apache-2.0', url: 'https://github.com/jamsinclair/jSquash' },
  { name: '@jsquash/png', license: 'Apache-2.0', url: 'https://github.com/jamsinclair/jSquash' },
  { name: 'Tesseract.js', license: 'Apache-2.0', url: 'https://github.com/naptha/tesseract.js' },
  { name: '@noble/hashes', license: 'MIT', url: 'https://github.com/paulmillr/noble-hashes' },
  { name: 'ONNX Runtime', license: 'MIT', url: 'https://github.com/microsoft/onnxruntime' },
  { name: 'Transformers.js', license: 'Apache-2.0', url: 'https://github.com/huggingface/transformers.js' },
  { name: 'pkijs', license: 'BSD-3-Clause', url: 'https://github.com/PeculiarVentures/PKI.js' },
  { name: 'asn1js', license: 'BSD-3-Clause', url: 'https://github.com/PeculiarVentures/ASN1.js' },
  { name: 'diff', license: 'BSD-3-Clause', url: 'https://github.com/kpdecker/jsdiff' },
  { name: 'node-forge', license: 'BSD-3-Clause', url: 'https://github.com/digitalbazaar/forge' },
  { name: 'qrcode', license: 'MIT', url: 'https://github.com/soldair/node-qrcode' },
  { name: 'zxing-wasm', license: 'Apache-2.0', url: 'https://github.com/Sec-ant/zxing-wasm' },
  { name: 'marked', license: 'MIT', url: 'https://github.com/markedjs/marked' },
  { name: 'DOMPurify', license: 'MIT', url: 'https://github.com/cure53/DOMPurify' },
  { name: 'sRGB.icc (icc-profiles-free)', license: 'Zlib', url: 'https://sources.debian.org/src/icc-profiles-free/' },
  { name: '@jsquash/webp', license: 'Apache-2.0', url: 'https://github.com/jamsinclair/jSquash' },
  { name: '@jsquash/avif', license: 'Apache-2.0', url: 'https://github.com/jamsinclair/jSquash' },
  { name: '@jsquash/jxl', license: 'Apache-2.0', url: 'https://github.com/jamsinclair/jSquash' },
  { name: '@jsquash/oxipng', license: 'Apache-2.0', url: 'https://github.com/jamsinclair/jSquash' },
  { name: 'gifuct-js', license: 'MIT', url: 'https://github.com/matt-way/gifuct-js' },
  { name: 'gifenc', license: 'MIT', url: 'https://github.com/mattdesl/gifenc' },
  { name: 'upng-js', license: 'MIT', url: 'https://github.com/photopea/UPNG.js' },
  { name: 'utif', license: 'MIT', url: 'https://github.com/photopea/UTIF.js' },
  { name: 'heic-decode', license: 'MIT', url: 'https://github.com/catdad-experiments/heic-decode' },
  { name: 'libheif-js (dynamic)', license: 'LGPL-3.0-or-later', url: 'https://github.com/catdad-experiments/libheif-js' },
  { name: 'opentype.js', license: 'MIT', url: 'https://github.com/opentypejs/opentype.js' },
  { name: 'Source Sans 3', license: 'OFL-1.1', url: 'https://github.com/adobe-fonts/source-sans' },
  { name: '@pdf-lib/fontkit', license: 'MIT', url: 'https://github.com/Hopding/fontkit' },
  { name: 'OpenAI Whisper weights', license: 'MIT', url: 'https://github.com/openai/whisper' },
  { name: 'Distil-Whisper', license: 'MIT', url: 'https://github.com/huggingface/distil-whisper' },
  { name: 'OPUS-MT (Helsinki-NLP)', license: 'Apache-2.0', url: 'https://github.com/Helsinki-NLP/Opus-MT' },
  { name: 'mpg123-decoder', license: 'MIT', url: 'https://github.com/eshaz/mpg123-decoder' },
  { name: 'ogg-opus-decoder', license: 'MIT', url: 'https://github.com/eshaz/ogg-opus-decoder' },
  { name: '@wasm-audio-decoders/flac', license: 'MIT', url: 'https://github.com/eshaz/wasm-audio-decoders' },
  { name: 'all-MiniLM-L6-v2', license: 'Apache-2.0', url: 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2' },
  { name: 'DistilBART-CNN', license: 'Apache-2.0', url: 'https://huggingface.co/sshleifer/distilbart-cnn-6-6' },
  { name: 'pyannote.audio segmentation-3.0', license: 'MIT', url: 'https://github.com/pyannote/pyannote-audio' },
];

export function collectLicenses(registry: Registry, extra: ToolLicense[] = PLATFORM_LICENSES): ToolLicense[] {
  const map = new Map<string, ToolLicense>();
  for (const item of extra) {
    map.set(`${item.name}|${item.license}`, item);
  }
  for (const tool of registry.list()) {
    for (const lic of tool.licenses) {
      map.set(`${lic.name}|${lic.license}`, lic);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
