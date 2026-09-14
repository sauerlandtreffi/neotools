import type { ToolLicense } from '@neotools/engine';

export const ARCHIVE_LICENSES: ToolLicense[] = [
  { name: 'fflate', license: 'MIT', url: 'https://github.com/101arrowz/fflate' },
  { name: '@zip.js/zip.js', license: 'BSD-3-Clause', url: 'https://github.com/gildas-lormeau/zip.js' },
  { name: 'libarchive.js (dynamic)', license: 'MIT', url: 'https://github.com/nika-begiashvili/libarchivejs' },
  { name: '7z-wasm (dynamic, optional)', license: 'LGPL-2.1-or-later', url: 'https://github.com/use-strict/7z-wasm' },
];

export const ARCHIVE_CATEGORY = 'archive-pack';
