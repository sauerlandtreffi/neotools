/** Hard platform size caps. Source + retrieval date per entry (mirrors apps/web/src/data/specs.ts). */

export type TargetKind = 'image' | 'video';

export interface PlatformSource {
  label: string;
  url: string;
  retrieved: string;
}

export interface PlatformTarget {
  id: string;
  platform: string;
  label: { de: string; en: string };
  kind: TargetKind;
  width: number;
  height: number;
  aspect: number;
  maxBytes?: number;
  maxDurationSec?: number;
  maxFps?: number;
  safeZoneInset: number;
  source: PlatformSource;
}

const META: Record<string, PlatformSource> = {
  instagram: {
    label: 'Meta Business Help (Bild- und Videoempfehlungen)',
    url: 'https://www.facebook.com/help/instagram/1631821640426723',
    retrieved: '2026-09-14',
  },
  youtube: {
    label: 'YouTube Help (empfohlene Upload-Einstellungen)',
    url: 'https://support.google.com/youtube/answer/1722171',
    retrieved: '2026-09-14',
  },
  x: {
    label: 'X Help (Medienlimits)',
    url: 'https://help.x.com/en/using-x/x-videos',
    retrieved: '2026-09-14',
  },
  linkedin: {
    label: 'LinkedIn Help (Video- und Bildspezifikationen)',
    url: 'https://www.linkedin.com/help/linkedin/answer/a563502',
    retrieved: '2026-09-14',
  },
  tiktok: {
    label: 'TikTok Creative Center / Upload-Spezifikation',
    url: 'https://www.tiktok.com/creators/creator-portal/en-us/tiktok-content-strategy/tiktok-video-specifications/',
    retrieved: '2026-09-14',
  },
  whatsapp: {
    label: 'WhatsApp Help / FAQ (Foto- und Videogrößen)',
    url: 'https://faq.whatsapp.com/',
    retrieved: '2026-09-14',
  },
  discord: {
    label: 'Discord Support (Dateigrößen-Limits)',
    url: 'https://support.discord.com/hc/en-us/articles/115002192071',
    retrieved: '2026-09-14',
  },
};

function t(
  id: string,
  platform: string,
  label: { de: string; en: string },
  kind: TargetKind,
  width: number,
  height: number,
  extra: Partial<PlatformTarget> = {},
): PlatformTarget {
  return {
    id,
    platform,
    label,
    kind,
    width,
    height,
    aspect: width / height,
    safeZoneInset: 0.07,
    source: META[platform] ?? META.instagram!,
    ...extra,
  };
}

export const PLATFORM_TARGETS: PlatformTarget[] = [
  t('ig-feed-45', 'instagram', { de: 'Instagram Feed 4:5', en: 'Instagram feed 4:5' }, 'image', 1080, 1350, {
    maxBytes: 8 * 1024 * 1024,
  }),
  t('ig-feed-11', 'instagram', { de: 'Instagram Feed 1:1', en: 'Instagram feed 1:1' }, 'image', 1080, 1080, {
    maxBytes: 8 * 1024 * 1024,
  }),
  t('ig-reel', 'instagram', { de: 'Instagram Reel 9:16', en: 'Instagram Reel 9:16' }, 'video', 1080, 1920, {
    maxDurationSec: 180,
    maxFps: 60,
    maxBytes: 100 * 1024 * 1024,
    safeZoneInset: 0.12,
  }),
  t('ig-story', 'instagram', { de: 'Instagram Story 9:16', en: 'Instagram Story 9:16' }, 'video', 1080, 1920, {
    maxDurationSec: 60,
    maxFps: 30,
    maxBytes: 30 * 1024 * 1024,
    safeZoneInset: 0.14,
  }),
  t('yt-169', 'youtube', { de: 'YouTube 16:9', en: 'YouTube 16:9' }, 'video', 1920, 1080, {
    maxDurationSec: 12 * 3600,
    maxFps: 60,
  }),
  t('yt-shorts', 'youtube', { de: 'YouTube Shorts 9:16', en: 'YouTube Shorts 9:16' }, 'video', 1080, 1920, {
    maxDurationSec: 60,
    maxFps: 60,
  }),
  t('x-image', 'x', { de: 'X Bild 16:9', en: 'X image 16:9' }, 'image', 1600, 900, {
    maxBytes: 5 * 1024 * 1024,
  }),
  t('x-video', 'x', { de: 'X Video', en: 'X video' }, 'video', 1280, 720, {
    maxDurationSec: 140,
    maxBytes: 512 * 1024 * 1024,
    maxFps: 60,
  }),
  t('li-image', 'linkedin', { de: 'LinkedIn Linkkarte', en: 'LinkedIn link card' }, 'image', 1200, 627, {
    maxBytes: 8 * 1024 * 1024,
  }),
  t('li-video', 'linkedin', { de: 'LinkedIn Video 16:9', en: 'LinkedIn video 16:9' }, 'video', 1920, 1080, {
    maxDurationSec: 15 * 60,
    maxBytes: 5 * 1024 * 1024 * 1024,
  }),
  t('tt-video', 'tiktok', { de: 'TikTok 9:16', en: 'TikTok 9:16' }, 'video', 1080, 1920, {
    maxDurationSec: 600,
    maxBytes: 287 * 1024 * 1024,
    maxFps: 60,
  }),
  t('wa-status', 'whatsapp', { de: 'WhatsApp Status 9:16', en: 'WhatsApp status 9:16' }, 'video', 1080, 1920, {
    maxDurationSec: 30,
    maxBytes: 16 * 1024 * 1024,
  }),
];

export const DEFAULT_PACK_IDS = ['ig-feed-45', 'ig-feed-11', 'ig-reel', 'ig-story', 'yt-169', 'x-image', 'x-video', 'li-image', 'li-video'] as const;

export function getTarget(id: string): PlatformTarget | undefined {
  return PLATFORM_TARGETS.find((t) => t.id === id);
}

export function targetsForPlatform(platform: string): PlatformTarget[] {
  return PLATFORM_TARGETS.filter((t) => t.platform === platform);
}

export function targetsByIds(ids: readonly string[]): PlatformTarget[] {
  return ids.map((id) => getTarget(id)).filter((t): t is PlatformTarget => Boolean(t));
}

export function ratioClose(a: number, b: number, tol = 0.04): boolean {
  if (!a || !b) return false;
  return Math.abs(a - b) / b <= tol;
}
