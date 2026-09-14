import { collectLicenses, PLATFORM_LICENSES, type Registry, type ToolLicense } from '@neotools/engine';

export type LicenseFamily = 'permissive' | 'copyleft' | 'other';

export function licenseFamily(spdx: string): LicenseFamily {
  const upper = spdx.toUpperCase();
  if (/\bAGPL\b/.test(upper) || /\bLGPL\b/.test(upper) || /\bGPL\b/.test(upper)) return 'copyleft';
  if (/\bMIT\b/.test(upper) || /\bAPACHE\b/.test(upper) || /\bBSD\b/.test(upper) || /\bISC\b/.test(upper)) {
    return 'permissive';
  }
  return 'other';
}

export function licenseKey(item: ToolLicense): string {
  return `${item.name}|${item.license}`;
}

export function aggregateLicenses(registry: Registry, extra: ToolLicense[] = PLATFORM_LICENSES): ToolLicense[] {
  return collectLicenses(registry, extra);
}

export function groupLicenses(items: readonly ToolLicense[]): Record<LicenseFamily, ToolLicense[]> {
  const groups: Record<LicenseFamily, ToolLicense[]> = { permissive: [], copyleft: [], other: [] };
  for (const item of items) {
    groups[licenseFamily(item.license)].push(item);
  }
  return groups;
}

export function hasCopyleft(items: readonly ToolLicense[]): boolean {
  return items.some((item) => licenseFamily(item.license) === 'copyleft');
}

export function thirdPartyNotices(items: readonly ToolLicense[]): string {
  const lines = [
    'THIRD PARTY NOTICES',
    'NeoTools first-party code is MIT. The following runtime components are bundled.',
    '',
  ];
  for (const item of items) {
    lines.push(`${item.name}`);
    lines.push(`  License: ${item.license}`);
    lines.push(`  ${item.url}`);
    lines.push('');
  }
  lines.push(
    'Copyleft: LGPL/GPL components, if present, are used unmodified. Corresponding source is offered on request via the legal notice address.',
  );
  lines.push(
    'FFmpeg: official @ffmpeg/core is GPL-2.0-or-later (temporary, x264). Intended replacement is an LGPL-2.1-or-later WASM build without x264/x265 (packages/tools-media/scripts/build-ffmpeg-lgpl.sh). Source of the bundled core is offered on request via the legal notice address.',
  );
  return `${lines.join('\n')}\n`;
}
