import { eqAt, fourcc, readU16LE, readU32BE } from '../util/bytes.js';
import {
  looksLikeHtml,
  looksLikeJson,
  looksLikeSvg,
  looksLikeXml,
  shebang,
} from '../util/text.js';
import { listZipEntries } from '../parsers/zip.js';

export type FormatGroup =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'archive'
  | 'executable'
  | 'script'
  | 'font'
  | 'other';

export interface FormatDef {
  id: string;
  mime: string;
  extensions: readonly string[];
  group: FormatGroup;
  label: { de: string; en: string };
}

export interface FormatHit extends FormatDef {
  offset: number;
  brand?: string;
  subtype?: string;
  note?: string;
  confidence: number;
}

type PrefixSig = FormatDef & {
  kind: 'prefix';
  magic: readonly number[] | string;
  offset?: number;
  and?: ReadonlyArray<{ offset: number; magic: readonly number[] | string }>;
};

const P = (
  id: string,
  mime: string,
  extensions: readonly string[],
  group: FormatGroup,
  de: string,
  en: string,
  magic: readonly number[] | string,
  extra?: { offset?: number; and?: PrefixSig['and'] },
): PrefixSig => ({
  kind: 'prefix',
  id,
  mime,
  extensions,
  group,
  label: { de, en },
  magic,
  offset: extra?.offset,
  and: extra?.and,
});

/** Prefix / offset magic table. Brand- and container-specific formats are added via custom detectors. */
export const PREFIX_SIGNATURES: readonly PrefixSig[] = [
  P('jpeg', 'image/jpeg', ['.jpg', '.jpeg', '.jpe', '.jfif'], 'image', 'JPEG-Bild', 'JPEG image', [0xff, 0xd8, 0xff]),
  P('jpeg-2000', 'image/jp2', ['.jp2', '.j2k', '.jpf'], 'image', 'JPEG 2000', 'JPEG 2000', [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20]),
  P('jxl-codestream', 'image/jxl', ['.jxl'], 'image', 'JPEG XL (Codestream)', 'JPEG XL (codestream)', [0xff, 0x0a]),
  P('jxl', 'image/jxl', ['.jxl'], 'image', 'JPEG XL', 'JPEG XL', [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20]),
  P('png', 'image/png', ['.png'], 'image', 'PNG-Bild', 'PNG image', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  P('gif87', 'image/gif', ['.gif'], 'image', 'GIF 87a', 'GIF 87a', 'GIF87a'),
  P('gif89', 'image/gif', ['.gif'], 'image', 'GIF 89a', 'GIF 89a', 'GIF89a'),
  P('bmp', 'image/bmp', ['.bmp', '.dib'], 'image', 'Windows-Bitmap', 'Windows bitmap', [0x42, 0x4d]),
  P('tiff-le', 'image/tiff', ['.tif', '.tiff'], 'image', 'TIFF (Little-Endian)', 'TIFF (little-endian)', [0x49, 0x49, 0x2a, 0x00]),
  P('tiff-be', 'image/tiff', ['.tif', '.tiff'], 'image', 'TIFF (Big-Endian)', 'TIFF (big-endian)', [0x4d, 0x4d, 0x00, 0x2a]),
  P('ico', 'image/x-icon', ['.ico'], 'image', 'Windows-Icon', 'Windows icon', [0x00, 0x00, 0x01, 0x00]),
  P('cur', 'image/x-win-bitmap', ['.cur'], 'image', 'Windows-Cursor', 'Windows cursor', [0x00, 0x00, 0x02, 0x00]),
  P('psd', 'image/vnd.adobe.photoshop', ['.psd'], 'image', 'Photoshop PSD', 'Photoshop PSD', '8BPS'),
  P('jpeg-xr', 'image/vnd.ms-photo', ['.jxr', '.wdp', '.hdp'], 'image', 'JPEG XR', 'JPEG XR', [0x49, 0x49, 0xbc]),
  P('exr', 'image/x-exr', ['.exr'], 'image', 'OpenEXR', 'OpenEXR', [0x76, 0x2f, 0x31, 0x01]),
  P('dds', 'image/vnd-ms.dds', ['.dds'], 'image', 'DirectDraw Surface', 'DirectDraw Surface', 'DDS '),
  P('icns', 'image/icns', ['.icns'], 'image', 'Apple Icon', 'Apple icon', 'icns'),
  P('pcx', 'image/vnd.zbrush.pcx', ['.pcx'], 'image', 'PCX-Bild', 'PCX image', [0x0a]),
  P('xcf', 'image/x-xcf', ['.xcf'], 'image', 'GIMP XCF', 'GIMP XCF', 'gimp xcf'),
  P('fits', 'image/fits', ['.fits', '.fit'], 'image', 'FITS', 'FITS', 'SIMPLE  ='),
  P('pbm-ascii', 'image/x-portable-bitmap', ['.pbm'], 'image', 'PBM (ASCII)', 'PBM (ASCII)', 'P1'),
  P('pgm-ascii', 'image/x-portable-graymap', ['.pgm'], 'image', 'PGM (ASCII)', 'PGM (ASCII)', 'P2'),
  P('ppm-ascii', 'image/x-portable-pixmap', ['.ppm'], 'image', 'PPM (ASCII)', 'PPM (ASCII)', 'P3'),
  P('pbm', 'image/x-portable-bitmap', ['.pbm'], 'image', 'PBM (binär)', 'PBM (binary)', 'P4'),
  P('pgm', 'image/x-portable-graymap', ['.pgm'], 'image', 'PGM (binär)', 'PGM (binary)', 'P5'),
  P('ppm', 'image/x-portable-pixmap', ['.ppm'], 'image', 'PPM (binär)', 'PPM (binary)', 'P6'),
  P('webp', 'image/webp', ['.webp'], 'image', 'WebP', 'WebP', 'RIFF', { and: [{ offset: 8, magic: 'WEBP' }] }),
  P('qoi', 'image/qoi', ['.qoi'], 'image', 'Quite OK Image', 'Quite OK Image', 'qoif'),

  P('matroska', 'video/x-matroska', ['.mkv', '.mka', '.mks'], 'video', 'Matroska', 'Matroska', [0x1a, 0x45, 0xdf, 0xa3]),
  P('avi', 'video/x-msvideo', ['.avi'], 'video', 'AVI', 'AVI', 'RIFF', { and: [{ offset: 8, magic: 'AVI ' }] }),
  P('mpeg-ps', 'video/mpeg', ['.mpg', '.mpeg', '.vob'], 'video', 'MPEG Program Stream', 'MPEG program stream', [0x00, 0x00, 0x01, 0xba]),
  P('flv', 'video/x-flv', ['.flv'], 'video', 'Flash Video', 'Flash Video', 'FLV'),
  P('asf', 'video/x-ms-asf', ['.asf', '.wmv', '.wma'], 'video', 'ASF / WMV / WMA', 'ASF / WMV / WMA', [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11]),

  P('wav', 'audio/wav', ['.wav'], 'audio', 'WAVE', 'WAVE', 'RIFF', { and: [{ offset: 8, magic: 'WAVE' }] }),
  P('aiff', 'audio/aiff', ['.aiff', '.aif'], 'audio', 'AIFF', 'AIFF', 'FORM', { and: [{ offset: 8, magic: 'AIFF' }] }),
  P('aifc', 'audio/aiff', ['.aifc'], 'audio', 'AIFF-C', 'AIFF-C', 'FORM', { and: [{ offset: 8, magic: 'AIFC' }] }),
  P('flac', 'audio/flac', ['.flac'], 'audio', 'FLAC', 'FLAC', 'fLaC'),
  P('ogg', 'audio/ogg', ['.ogg', '.oga', '.ogv', '.opus'], 'audio', 'Ogg', 'Ogg', 'OggS'),
  P('midi', 'audio/midi', ['.mid', '.midi'], 'audio', 'MIDI', 'MIDI', 'MThd'),
  P('amr', 'audio/amr', ['.amr'], 'audio', 'AMR', 'AMR', '#AMR'),
  P('au', 'audio/basic', ['.au', '.snd'], 'audio', 'Sun AU', 'Sun AU', '.snd'),
  P('caf', 'audio/x-caf', ['.caf'], 'audio', 'Core Audio Format', 'Core Audio Format', 'caff'),
  P('ac3', 'audio/ac3', ['.ac3'], 'audio', 'ATSC A/52 (AC-3)', 'ATSC A/52 (AC-3)', [0x0b, 0x77]),
  P('dts', 'audio/vnd.dts', ['.dts'], 'audio', 'DTS', 'DTS', [0x7f, 0xfe, 0x80, 0x01]),

  P('pdf', 'application/pdf', ['.pdf'], 'document', 'PDF', 'PDF', '%PDF-'),
  P('rtf', 'application/rtf', ['.rtf'], 'document', 'Rich Text', 'Rich Text', '{\\rtf'),
  P('ole-cf', 'application/x-cfb', ['.doc', '.xls', '.ppt', '.msg', '.msi'], 'document', 'OLE Compound File', 'OLE compound file', [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  P('postscript', 'application/postscript', ['.ps', '.eps'], 'document', 'PostScript', 'PostScript', '%!PS'),

  P('zip', 'application/zip', ['.zip'], 'archive', 'ZIP-Archiv', 'ZIP archive', [0x50, 0x4b, 0x03, 0x04]),
  P('zip-empty', 'application/zip', ['.zip'], 'archive', 'ZIP (leer)', 'ZIP (empty)', [0x50, 0x4b, 0x05, 0x06]),
  P('zip-spanned', 'application/zip', ['.zip'], 'archive', 'ZIP (Span)', 'ZIP (spanned)', [0x50, 0x4b, 0x07, 0x08]),
  P('gzip', 'application/gzip', ['.gz', '.tgz'], 'archive', 'gzip', 'gzip', [0x1f, 0x8b]),
  P('bzip2', 'application/x-bzip2', ['.bz2'], 'archive', 'bzip2', 'bzip2', 'BZh'),
  P('xz', 'application/x-xz', ['.xz'], 'archive', 'XZ', 'XZ', [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]),
  P('7z', 'application/x-7z-compressed', ['.7z'], 'archive', '7-Zip', '7-Zip', [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
  P('rar', 'application/vnd.rar', ['.rar'], 'archive', 'RAR 1.5–4', 'RAR 1.5–4', 'Rar!\x1a\x07\x00'),
  P('rar5', 'application/vnd.rar', ['.rar'], 'archive', 'RAR 5', 'RAR 5', [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]),
  P('zstd', 'application/zstd', ['.zst'], 'archive', 'Zstandard', 'Zstandard', [0x28, 0xb5, 0x2f, 0xfd]),
  P('lz4', 'application/x-lz4', ['.lz4'], 'archive', 'LZ4', 'LZ4', [0x04, 0x22, 0x4d, 0x18]),
  P('cab', 'application/vnd.ms-cab-compressed', ['.cab'], 'archive', 'Microsoft Cabinet', 'Microsoft Cabinet', 'MSCF'),
  P('wim', 'application/x-ms-wim', ['.wim', '.swm'], 'archive', 'Windows Imaging', 'Windows Imaging', 'MSWIM'),
  P('ar', 'application/x-archive', ['.a', '.lib'], 'archive', 'Unix ar', 'Unix ar', '!<arch>\n'),
  P('cpio', 'application/x-cpio', ['.cpio'], 'archive', 'cpio (binär)', 'cpio (binary)', [0xc7, 0x71]),
  P('lzip', 'application/x-lzip', ['.lz'], 'archive', 'lzip', 'lzip', 'LZIP'),
  P('compress', 'application/x-compress', ['.Z'], 'archive', 'compress (.Z)', 'compress (.Z)', [0x1f, 0x9d]),
  P('lzma', 'application/x-lzma', ['.lzma'], 'archive', 'LZMA', 'LZMA', [0x5d, 0x00, 0x00]),

  P('pe', 'application/vnd.microsoft.portable-executable', ['.exe', '.dll', '.sys', '.scr'], 'executable', 'PE / MZ (Windows)', 'PE / MZ (Windows)', [0x4d, 0x5a]),
  P('elf', 'application/x-elf', ['.so', '.o', '.elf'], 'executable', 'ELF', 'ELF', [0x7f, 0x45, 0x4c, 0x46]),
  P('macho-32be', 'application/x-mach-binary', ['.o', '.dylib'], 'executable', 'Mach-O 32 (BE)', 'Mach-O 32 (BE)', [0xfe, 0xed, 0xfa, 0xce]),
  P('macho-32le', 'application/x-mach-binary', ['.o', '.dylib'], 'executable', 'Mach-O 32 (LE)', 'Mach-O 32 (LE)', [0xce, 0xfa, 0xed, 0xfe]),
  P('macho-64be', 'application/x-mach-binary', ['.o', '.dylib'], 'executable', 'Mach-O 64 (BE)', 'Mach-O 64 (BE)', [0xfe, 0xed, 0xfa, 0xcf]),
  P('macho-64le', 'application/x-mach-binary', ['.o', '.dylib'], 'executable', 'Mach-O 64 (LE)', 'Mach-O 64 (LE)', [0xcf, 0xfa, 0xed, 0xfe]),
  P('macho-fat', 'application/x-mach-binary', ['.o', '.dylib'], 'executable', 'Mach-O Fat / Universal', 'Mach-O fat / universal', [0xca, 0xfe, 0xba, 0xbe]),
  P('wasm', 'application/wasm', ['.wasm'], 'executable', 'WebAssembly', 'WebAssembly', [0x00, 0x61, 0x73, 0x6d]),
  P('class', 'application/java-vm', ['.class'], 'executable', 'Java Class', 'Java class', [0xca, 0xfe, 0xba, 0xbe]),
  P('dex', 'application/vnd.android.dex', ['.dex'], 'executable', 'Dalvik DEX', 'Dalvik DEX', 'dex\n'),
  P('swf', 'application/x-shockwave-flash', ['.swf'], 'executable', 'Shockwave Flash', 'Shockwave Flash', 'FWS'),
  P('swf-zlib', 'application/x-shockwave-flash', ['.swf'], 'executable', 'Shockwave Flash (zlib)', 'Shockwave Flash (zlib)', 'CWS'),
  P('swf-lzma', 'application/x-shockwave-flash', ['.swf'], 'executable', 'Shockwave Flash (LZMA)', 'Shockwave Flash (LZMA)', 'ZWS'),
  P('dalvik-odex', 'application/vnd.android.odex', ['.odex'], 'executable', 'Android ODEX', 'Android ODEX', 'dey\n'),

  P('ttf', 'font/ttf', ['.ttf'], 'font', 'TrueType', 'TrueType', [0x00, 0x01, 0x00, 0x00]),
  P('otf', 'font/otf', ['.otf'], 'font', 'OpenType', 'OpenType', 'OTTO'),
  P('ttc', 'font/collection', ['.ttc'], 'font', 'TrueType Collection', 'TrueType Collection', 'ttcf'),
  P('woff', 'font/woff', ['.woff'], 'font', 'WOFF', 'WOFF', 'wOFF'),
  P('woff2', 'font/woff2', ['.woff2'], 'font', 'WOFF2', 'WOFF2', 'wOF2'),
  P('eot', 'application/vnd.ms-fontobject', ['.eot'], 'font', 'Embedded OpenType', 'Embedded OpenType', [0x00, 0x00, 0x01, 0x00]),

  P('sqlite', 'application/vnd.sqlite3', ['.sqlite', '.db', '.sqlite3'], 'other', 'SQLite 3', 'SQLite 3', 'SQLite format 3\0'),
  P('pgp', 'application/pgp-encrypted', ['.asc', '.pgp', '.gpg'], 'other', 'PGP-Nachricht', 'PGP message', '-----BEGIN PGP'),
  P('pem', 'application/x-pem-file', ['.pem', '.crt', '.key'], 'other', 'PEM / X.509', 'PEM / X.509', '-----BEGIN '),
  P('glb', 'model/gltf-binary', ['.glb'], 'other', 'glTF Binary', 'glTF Binary', 'glTF'),
  P('blend', 'application/x-blender', ['.blend'], 'other', 'Blender', 'Blender', 'BLENDER'),
  P('hdf5', 'application/x-hdf5', ['.h5', '.hdf5'], 'other', 'HDF5', 'HDF5', [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a]),
  P('parquet', 'application/vnd.apache.parquet', ['.parquet'], 'other', 'Apache Parquet', 'Apache Parquet', 'PAR1'),
  P('arrow', 'application/vnd.apache.arrow.file', ['.arrow'], 'other', 'Apache Arrow', 'Apache Arrow', 'ARROW1'),
  P('crx', 'application/x-chrome-extension', ['.crx'], 'other', 'Chrome Extension', 'Chrome extension', 'Cr24'),
  P('lnk', 'application/x-ms-shortcut', ['.lnk'], 'other', 'Windows-Verknüpfung', 'Windows shortcut', [0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00]),
  P('torrent', 'application/x-bittorrent', ['.torrent'], 'other', 'BitTorrent', 'BitTorrent', 'd8:announce'),
  P('ics', 'text/calendar', ['.ics'], 'other', 'iCalendar', 'iCalendar', 'BEGIN:VCALENDAR'),
  P('vcf', 'text/vcard', ['.vcf', '.vcard'], 'other', 'vCard', 'vCard', 'BEGIN:VCARD'),
  P('dicom', 'application/dicom', ['.dcm'], 'other', 'DICOM', 'DICOM', 'DICM', { offset: 128 }),
];

const ISO_BRANDS: Record<string, FormatDef> = {
  isom: { id: 'mp4', mime: 'video/mp4', extensions: ['.mp4', '.m4v'], group: 'video', label: { de: 'MP4 (ISO-BMFF)', en: 'MP4 (ISO-BMFF)' } },
  iso2: { id: 'mp4', mime: 'video/mp4', extensions: ['.mp4'], group: 'video', label: { de: 'MP4 (ISO-BMFF)', en: 'MP4 (ISO-BMFF)' } },
  iso5: { id: 'mp4', mime: 'video/mp4', extensions: ['.mp4'], group: 'video', label: { de: 'MP4 (ISO-BMFF)', en: 'MP4 (ISO-BMFF)' } },
  iso6: { id: 'mp4', mime: 'video/mp4', extensions: ['.mp4'], group: 'video', label: { de: 'MP4 (ISO-BMFF)', en: 'MP4 (ISO-BMFF)' } },
  mp41: { id: 'mp4', mime: 'video/mp4', extensions: ['.mp4'], group: 'video', label: { de: 'MP4 (mp41)', en: 'MP4 (mp41)' } },
  mp42: { id: 'mp4', mime: 'video/mp4', extensions: ['.mp4'], group: 'video', label: { de: 'MP4 (mp42)', en: 'MP4 (mp42)' } },
  avc1: { id: 'mp4', mime: 'video/mp4', extensions: ['.mp4'], group: 'video', label: { de: 'MP4 (avc1)', en: 'MP4 (avc1)' } },
  dash: { id: 'mp4', mime: 'video/mp4', extensions: ['.mp4'], group: 'video', label: { de: 'MP4 (DASH)', en: 'MP4 (DASH)' } },
  qt: { id: 'mov', mime: 'video/quicktime', extensions: ['.mov', '.qt'], group: 'video', label: { de: 'QuickTime', en: 'QuickTime' } },
  '3gp': { id: '3gp', mime: 'video/3gpp', extensions: ['.3gp'], group: 'video', label: { de: '3GPP', en: '3GPP' } },
  '3g2': { id: '3g2', mime: 'video/3gpp2', extensions: ['.3g2'], group: 'video', label: { de: '3GPP2', en: '3GPP2' } },
  M4A: { id: 'm4a', mime: 'audio/mp4', extensions: ['.m4a'], group: 'audio', label: { de: 'M4A / MPEG-4 Audio', en: 'M4A / MPEG-4 audio' } },
  M4B: { id: 'm4b', mime: 'audio/mp4', extensions: ['.m4b'], group: 'audio', label: { de: 'M4B Hörbuch', en: 'M4B audiobook' } },
  M4V: { id: 'm4v', mime: 'video/x-m4v', extensions: ['.m4v'], group: 'video', label: { de: 'iTunes M4V', en: 'iTunes M4V' } },
  heic: { id: 'heic', mime: 'image/heic', extensions: ['.heic'], group: 'image', label: { de: 'HEIC', en: 'HEIC' } },
  heix: { id: 'heic', mime: 'image/heic', extensions: ['.heic'], group: 'image', label: { de: 'HEIC', en: 'HEIC' } },
  hevc: { id: 'heic', mime: 'image/heic', extensions: ['.heic'], group: 'image', label: { de: 'HEIC', en: 'HEIC' } },
  hevx: { id: 'heic', mime: 'image/heic', extensions: ['.heic'], group: 'image', label: { de: 'HEIC', en: 'HEIC' } },
  mif1: { id: 'heif', mime: 'image/heif', extensions: ['.heif'], group: 'image', label: { de: 'HEIF', en: 'HEIF' } },
  msf1: { id: 'heif', mime: 'image/heif', extensions: ['.heif'], group: 'image', label: { de: 'HEIF-Sequenz', en: 'HEIF sequence' } },
  heif: { id: 'heif', mime: 'image/heif', extensions: ['.heif'], group: 'image', label: { de: 'HEIF', en: 'HEIF' } },
  avif: { id: 'avif', mime: 'image/avif', extensions: ['.avif'], group: 'image', label: { de: 'AVIF', en: 'AVIF' } },
  avis: { id: 'avif', mime: 'image/avif', extensions: ['.avif'], group: 'image', label: { de: 'AVIF-Sequenz', en: 'AVIF sequence' } },
  crx: { id: 'cr3', mime: 'image/x-canon-cr3', extensions: ['.cr3'], group: 'image', label: { de: 'Canon CR3', en: 'Canon CR3' } },
  jpeg: { id: 'motion-jpeg', mime: 'video/mj2', extensions: ['.mj2'], group: 'video', label: { de: 'Motion JPEG 2000', en: 'Motion JPEG 2000' } },
};

const OOXML: Record<string, FormatDef> = {
  word: {
    id: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['.docx', '.docm'],
    group: 'document',
    label: { de: 'Word (OOXML)', en: 'Word (OOXML)' },
  },
  xl: {
    id: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['.xlsx', '.xlsm'],
    group: 'document',
    label: { de: 'Excel (OOXML)', en: 'Excel (OOXML)' },
  },
  ppt: {
    id: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extensions: ['.pptx', '.pptm'],
    group: 'document',
    label: { de: 'PowerPoint (OOXML)', en: 'PowerPoint (OOXML)' },
  },
};

function hit(def: FormatDef, offset: number, extra?: Partial<FormatHit>): FormatHit {
  return { ...def, offset, confidence: extra?.confidence ?? 0.95, ...extra };
}

function matchPrefix(bytes: Uint8Array, sig: PrefixSig, offset = 0): boolean {
  const at = offset + (sig.offset ?? 0);
  if (!eqAt(bytes, at, sig.magic)) return false;
  if (sig.and) {
    for (const extra of sig.and) {
      if (!eqAt(bytes, offset + extra.offset, extra.magic)) return false;
    }
  }
  return true;
}

export function matchPrefixAt(bytes: Uint8Array, from = 0): FormatHit[] {
  const hits: FormatHit[] = [];
  for (const sig of PREFIX_SIGNATURES) {
    if (matchPrefix(bytes, sig, from)) {
      hits.push(hit(sig, from + (sig.offset ?? 0)));
    }
  }
  return hits;
}

function parseFtyp(bytes: Uint8Array, offset = 0): { major: string; brands: string[] } | undefined {
  if (offset + 16 > bytes.length) return undefined;
  if (fourcc(bytes, offset + 4) !== 'ftyp') return undefined;
  const size = readU32BE(bytes, offset);
  if (size < 16 || offset + Math.min(size, 256) > bytes.length + 256) {
    // still try major brand
  }
  const major = fourcc(bytes, offset + 8);
  const brands = [major];
  const end = size > 0 && size < 1024 ? Math.min(bytes.length, offset + size) : Math.min(bytes.length, offset + 64);
  for (let i = offset + 16; i + 4 <= end; i += 4) {
    const b = fourcc(bytes, i);
    if (b.trim()) brands.push(b);
  }
  return { major, brands };
}

export function detectIsoBmff(bytes: Uint8Array, offset = 0): FormatHit | undefined {
  const ftyp = parseFtyp(bytes, offset);
  if (!ftyp) return undefined;
  for (const brand of ftyp.brands) {
    const def = ISO_BRANDS[brand];
    if (def) return hit(def, offset, { brand: ftyp.major, subtype: ftyp.brands.join(','), note: `ftyp ${ftyp.major}` });
  }
  return hit(
    {
      id: 'iso-bmff',
      mime: 'application/mp4',
      extensions: ['.mp4'],
      group: 'video',
      label: { de: 'ISO-BMFF (unbekannte Brand)', en: 'ISO-BMFF (unknown brand)' },
    },
    offset,
    { brand: ftyp.major, subtype: ftyp.brands.join(','), confidence: 0.7 },
  );
}

export function detectMpegTs(bytes: Uint8Array, offset = 0): FormatHit | undefined {
  if (bytes[offset] !== 0x47) return undefined;
  const packet = 188;
  if (offset + packet < bytes.length && bytes[offset + packet] !== 0x47) return undefined;
  if (offset + packet * 2 < bytes.length && bytes[offset + packet * 2] !== 0x47) return undefined;
  return hit(
    {
      id: 'mpeg-ts',
      mime: 'video/mp2t',
      extensions: ['.ts', '.m2ts', '.mts'],
      group: 'video',
      label: { de: 'MPEG Transport Stream', en: 'MPEG transport stream' },
    },
    offset,
  );
}

export function detectMp3(bytes: Uint8Array, offset = 0): FormatHit | undefined {
  if (eqAt(bytes, offset, 'ID3')) {
    return hit(
      {
        id: 'mp3',
        mime: 'audio/mpeg',
        extensions: ['.mp3'],
        group: 'audio',
        label: { de: 'MP3 (ID3v2)', en: 'MP3 (ID3v2)' },
      },
      offset,
      { subtype: 'id3v2' },
    );
  }
  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  if (b0 === 0xff && b1 !== undefined && (b1 & 0xe0) === 0xe0) {
    return hit(
      {
        id: 'mp3',
        mime: 'audio/mpeg',
        extensions: ['.mp3'],
        group: 'audio',
        label: { de: 'MP3 (Frame-Sync)', en: 'MP3 (frame sync)' },
      },
      offset,
      { subtype: 'frame', confidence: 0.7 },
    );
  }
  return undefined;
}

export function detectTar(bytes: Uint8Array): FormatHit | undefined {
  if (bytes.length < 262) return undefined;
  if (eqAt(bytes, 257, 'ustar')) {
    return hit(
      {
        id: 'tar',
        mime: 'application/x-tar',
        extensions: ['.tar'],
        group: 'archive',
        label: { de: 'TAR', en: 'TAR' },
      },
      257,
    );
  }
  return undefined;
}

export function detectIso9660(bytes: Uint8Array): FormatHit | undefined {
  if (bytes.length > 32769 + 5 && eqAt(bytes, 32769, 'CD001')) {
    return hit(
      {
        id: 'iso9660',
        mime: 'application/x-iso9660-image',
        extensions: ['.iso'],
        group: 'archive',
        label: { de: 'ISO 9660', en: 'ISO 9660' },
      },
      32769,
    );
  }
  return undefined;
}

function zipSubtype(bytes: Uint8Array, offset: number): FormatHit {
  const zipDef: FormatDef = {
    id: 'zip',
    mime: 'application/zip',
    extensions: ['.zip'],
    group: 'archive',
    label: { de: 'ZIP-Archiv', en: 'ZIP archive' },
  };
  try {
    const slice = offset === 0 ? bytes : bytes.subarray(offset);
    const { entries } = listZipEntries(slice, 64);
    const names = entries.map((e) => e.name.replace(/\\/g, '/'));
    const has = (p: string) => names.some((n) => n === p || n.startsWith(p));
    const contentTypes = has('[Content_Types].xml');
    if (contentTypes && has('word/')) return hit(OOXML.word!, offset, { note: 'OOXML + [Content_Types].xml' });
    if (contentTypes && has('xl/')) return hit(OOXML.xl!, offset, { note: 'OOXML + [Content_Types].xml' });
    if (contentTypes && has('ppt/')) return hit(OOXML.ppt!, offset, { note: 'OOXML + [Content_Types].xml' });
    if (contentTypes) {
      return hit(
        {
          id: 'ooxml',
          mime: 'application/vnd.openxmlformats-officedocument',
          extensions: ['.docx', '.xlsx', '.pptx'],
          group: 'document',
          label: { de: 'OOXML (Office Open XML)', en: 'OOXML (Office Open XML)' },
        },
        offset,
        { note: '[Content_Types].xml' },
      );
    }
    if (has('mimetype')) {
      const mt = entries.find((e) => e.name === 'mimetype');
      if (mt && mt.method === 0 && mt.uncompressedSize < 128) {
        const start = offset + mt.localOffset + 30 + mt.name.length + mt.extraLength;
        const mime = new TextDecoder().decode(bytes.subarray(start, start + mt.uncompressedSize));
        if (mime.includes('epub')) {
          return hit(
            {
              id: 'epub',
              mime: 'application/epub+zip',
              extensions: ['.epub'],
              group: 'document',
              label: { de: 'EPUB', en: 'EPUB' },
            },
            offset,
            { note: mime },
          );
        }
        if (mime.includes('opendocument.text')) {
          return hit(
            {
              id: 'odt',
              mime: 'application/vnd.oasis.opendocument.text',
              extensions: ['.odt'],
              group: 'document',
              label: { de: 'OpenDocument Text', en: 'OpenDocument Text' },
            },
            offset,
          );
        }
        if (mime.includes('opendocument.spreadsheet')) {
          return hit(
            {
              id: 'ods',
              mime: 'application/vnd.oasis.opendocument.spreadsheet',
              extensions: ['.ods'],
              group: 'document',
              label: { de: 'OpenDocument Spreadsheet', en: 'OpenDocument Spreadsheet' },
            },
            offset,
          );
        }
        if (mime.includes('opendocument.presentation')) {
          return hit(
            {
              id: 'odp',
              mime: 'application/vnd.oasis.opendocument.presentation',
              extensions: ['.odp'],
              group: 'document',
              label: { de: 'OpenDocument Presentation', en: 'OpenDocument Presentation' },
            },
            offset,
          );
        }
      }
    }
    if (has('META-INF/MANIFEST.MF')) {
      return hit(
        {
          id: 'jar',
          mime: 'application/java-archive',
          extensions: ['.jar'],
          group: 'archive',
          label: { de: 'Java Archive', en: 'Java archive' },
        },
        offset,
      );
    }
    if (has('AndroidManifest.xml')) {
      return hit(
        {
          id: 'apk',
          mime: 'application/vnd.android.package-archive',
          extensions: ['.apk'],
          group: 'archive',
          label: { de: 'Android APK', en: 'Android APK' },
        },
        offset,
      );
    }
    return hit(zipDef, offset, { note: `${entries.length} entries` });
  } catch {
    return hit(zipDef, offset, { confidence: 0.8 });
  }
}

export function detectZipFamily(bytes: Uint8Array, offset = 0): FormatHit | undefined {
  if (eqAt(bytes, offset, [0x50, 0x4b, 0x03, 0x04]) || eqAt(bytes, offset, [0x50, 0x4b, 0x05, 0x06])) {
    return zipSubtype(bytes, offset);
  }
  return undefined;
}

export function detectTextual(bytes: Uint8Array): FormatHit | undefined {
  const bang = shebang(bytes);
  if (bang) {
    const lower = bang.toLowerCase();
    let id = 'shell';
    let mime = 'text/x-shellscript';
    let ext = ['.sh'];
    let de = 'Shell-Skript';
    let en = 'Shell script';
    if (lower.includes('python')) {
      id = 'python';
      mime = 'text/x-python';
      ext = ['.py'];
      de = 'Python-Skript';
      en = 'Python script';
    } else if (lower.includes('node') || lower.includes('env node')) {
      id = 'javascript';
      mime = 'text/javascript';
      ext = ['.js'];
      de = 'JavaScript';
      en = 'JavaScript';
    } else if (lower.includes('php')) {
      id = 'php';
      mime = 'text/x-php';
      ext = ['.php'];
      de = 'PHP';
      en = 'PHP';
    } else if (lower.includes('pwsh') || lower.includes('powershell')) {
      id = 'powershell';
      mime = 'text/x-powershell';
      ext = ['.ps1'];
      de = 'PowerShell';
      en = 'PowerShell';
    }
    return hit(
      { id, mime, extensions: ext, group: 'script', label: { de, en } },
      0,
      { note: bang, confidence: 0.9 },
    );
  }
  if (looksLikeSvg(bytes)) {
    return hit(
      { id: 'svg', mime: 'image/svg+xml', extensions: ['.svg'], group: 'image', label: { de: 'SVG', en: 'SVG' } },
      0,
      { confidence: 0.85 },
    );
  }
  if (looksLikeHtml(bytes)) {
    return hit(
      { id: 'html', mime: 'text/html', extensions: ['.html', '.htm'], group: 'script', label: { de: 'HTML', en: 'HTML' } },
      0,
      { confidence: 0.85 },
    );
  }
  if (looksLikeXml(bytes)) {
    return hit(
      { id: 'xml', mime: 'application/xml', extensions: ['.xml'], group: 'document', label: { de: 'XML', en: 'XML' } },
      0,
      { confidence: 0.75 },
    );
  }
  if (looksLikeJson(bytes)) {
    return hit(
      { id: 'json', mime: 'application/json', extensions: ['.json'], group: 'document', label: { de: 'JSON', en: 'JSON' } },
      0,
      { confidence: 0.7 },
    );
  }
  return undefined;
}

export function detectAt(bytes: Uint8Array, offset = 0): FormatHit[] {
  const hits: FormatHit[] = [];
  const iso = detectIsoBmff(bytes, offset);
  if (iso) hits.push(iso);
  const zip = detectZipFamily(bytes, offset);
  if (zip) hits.push(zip);
  const mp3 = detectMp3(bytes, offset);
  if (mp3) hits.push(mp3);
  const ts = detectMpegTs(bytes, offset);
  if (ts) hits.push(ts);
  if (offset === 0) {
    const tar = detectTar(bytes);
    if (tar) hits.push(tar);
    const iso9660 = detectIso9660(bytes);
    if (iso9660) hits.push(iso9660);
  }
  for (const h of matchPrefixAt(bytes, offset)) {
    if (h.id === 'zip' || h.id === 'zip-empty' || h.id === 'zip-spanned') {
      if (zip) continue;
    }
    if (h.id === 'class' && iso) continue;
    if (h.id === 'macho-fat' && h.offset === 0 && bytes[0] === 0xca && bytes[1] === 0xfe) {
      // Java class shares CA FE BA BE — distinguish by third byte BA vs Mach-O fat which is also CAFE BABE
      // Mach-O fat is CA FE BA BE as well. Prefer class if file is small-ish and has Java version at 6.
      if (bytes.length > 8 && readU16LE(bytes, 6) < 70) {
        // keep class
      }
    }
    if (!hits.some((x) => x.id === h.id && x.offset === h.offset)) hits.push(h);
  }
  if (offset === 0 && !hits.length) {
    const text = detectTextual(bytes);
    if (text) hits.push(text);
  }
  hits.sort((a, b) => b.confidence - a.confidence || a.offset - b.offset);
  return hits;
}

/** Distinct logical formats covered by the database (prefix + brands + containers + text). */
export const FORMAT_CATALOG: readonly FormatDef[] = (() => {
  const map = new Map<string, FormatDef>();
  const add = (d: FormatDef) => {
    if (!map.has(d.id)) map.set(d.id, d);
  };
  for (const s of PREFIX_SIGNATURES) add(s);
  for (const d of Object.values(ISO_BRANDS)) add(d);
  for (const d of Object.values(OOXML)) add(d);
  add({
    id: 'iso-bmff',
    mime: 'application/mp4',
    extensions: ['.mp4'],
    group: 'video',
    label: { de: 'ISO-BMFF', en: 'ISO-BMFF' },
  });
  add({
    id: 'mpeg-ts',
    mime: 'video/mp2t',
    extensions: ['.ts'],
    group: 'video',
    label: { de: 'MPEG-TS', en: 'MPEG-TS' },
  });
  add({
    id: 'mp3',
    mime: 'audio/mpeg',
    extensions: ['.mp3'],
    group: 'audio',
    label: { de: 'MP3', en: 'MP3' },
  });
  add({
    id: 'tar',
    mime: 'application/x-tar',
    extensions: ['.tar'],
    group: 'archive',
    label: { de: 'TAR', en: 'TAR' },
  });
  add({
    id: 'iso9660',
    mime: 'application/x-iso9660-image',
    extensions: ['.iso'],
    group: 'archive',
    label: { de: 'ISO 9660', en: 'ISO 9660' },
  });
  add({
    id: 'epub',
    mime: 'application/epub+zip',
    extensions: ['.epub'],
    group: 'document',
    label: { de: 'EPUB', en: 'EPUB' },
  });
  add({
    id: 'odt',
    mime: 'application/vnd.oasis.opendocument.text',
    extensions: ['.odt'],
    group: 'document',
    label: { de: 'ODT', en: 'ODT' },
  });
  add({
    id: 'ods',
    mime: 'application/vnd.oasis.opendocument.spreadsheet',
    extensions: ['.ods'],
    group: 'document',
    label: { de: 'ODS', en: 'ODS' },
  });
  add({
    id: 'odp',
    mime: 'application/vnd.oasis.opendocument.presentation',
    extensions: ['.odp'],
    group: 'document',
    label: { de: 'ODP', en: 'ODP' },
  });
  add({
    id: 'jar',
    mime: 'application/java-archive',
    extensions: ['.jar'],
    group: 'archive',
    label: { de: 'JAR', en: 'JAR' },
  });
  add({
    id: 'apk',
    mime: 'application/vnd.android.package-archive',
    extensions: ['.apk'],
    group: 'archive',
    label: { de: 'APK', en: 'APK' },
  });
  add({
    id: 'html',
    mime: 'text/html',
    extensions: ['.html'],
    group: 'script',
    label: { de: 'HTML', en: 'HTML' },
  });
  add({
    id: 'svg',
    mime: 'image/svg+xml',
    extensions: ['.svg'],
    group: 'image',
    label: { de: 'SVG', en: 'SVG' },
  });
  add({
    id: 'xml',
    mime: 'application/xml',
    extensions: ['.xml'],
    group: 'document',
    label: { de: 'XML', en: 'XML' },
  });
  add({
    id: 'json',
    mime: 'application/json',
    extensions: ['.json'],
    group: 'document',
    label: { de: 'JSON', en: 'JSON' },
  });
  add({
    id: 'python',
    mime: 'text/x-python',
    extensions: ['.py'],
    group: 'script',
    label: { de: 'Python', en: 'Python' },
  });
  add({
    id: 'javascript',
    mime: 'text/javascript',
    extensions: ['.js'],
    group: 'script',
    label: { de: 'JavaScript', en: 'JavaScript' },
  });
  add({
    id: 'php',
    mime: 'text/x-php',
    extensions: ['.php'],
    group: 'script',
    label: { de: 'PHP', en: 'PHP' },
  });
  add({
    id: 'shell',
    mime: 'text/x-shellscript',
    extensions: ['.sh'],
    group: 'script',
    label: { de: 'Shell', en: 'Shell' },
  });
  add({
    id: 'powershell',
    mime: 'text/x-powershell',
    extensions: ['.ps1'],
    group: 'script',
    label: { de: 'PowerShell', en: 'PowerShell' },
  });
  add({
    id: 'ooxml',
    mime: 'application/vnd.openxmlformats-officedocument',
    extensions: ['.docx'],
    group: 'document',
    label: { de: 'OOXML', en: 'OOXML' },
  });
  add({
    id: 'webm',
    mime: 'video/webm',
    extensions: ['.webm'],
    group: 'video',
    label: { de: 'WebM', en: 'WebM' },
  });
  return [...map.values()];
})();

export function formatCatalogCount(): number {
  return FORMAT_CATALOG.length;
}

export const EXT_MIME: Record<string, string> = (() => {
  const m: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.exe': 'application/vnd.microsoft.portable-executable',
    '.dll': 'application/vnd.microsoft.portable-executable',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.bin': 'application/octet-stream',
  };
  for (const f of FORMAT_CATALOG) {
    for (const ext of f.extensions) {
      if (!(ext in m)) m[ext] = f.mime;
    }
  }
  return m;
})();
