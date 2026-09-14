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
