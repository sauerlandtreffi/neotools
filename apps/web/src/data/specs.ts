import { z } from 'zod';

export const specLimitSchema = z.object({
  id: z.string(),
  kind: z.enum(['image', 'video', 'audio', 'file', 'document']),
  label: z.object({ de: z.string(), en: z.string() }),
  value: z.object({ de: z.string(), en: z.string() }),
});

export const platformSpecSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.object({ de: z.string(), en: z.string() }),
  summary: z.object({ de: z.string(), en: z.string() }),
  source: z.object({
    label: z.string(),
    url: z.string().url(),
    retrieved: z.string(),
  }),
  limits: z.array(specLimitSchema).min(1),
  relatedFormats: z.array(z.string()),
  relatedTools: z.array(z.string()),
  notes: z.object({ de: z.string(), en: z.string() }).optional(),
});

export type PlatformSpec = z.infer<typeof platformSpecSchema>;

export const PLATFORM_SPECS: PlatformSpec[] = [
  platformSpecSchema.parse({
    id: 'whatsapp',
    name: { de: 'WhatsApp', en: 'WhatsApp' },
    summary: {
      de: 'Chat-Medien werden serverseitig oft nachkomprimiert. Fotos bleiben praktischer unter ein paar Megabyte, Voice Notes sind Opus/Ogg.',
      en: 'Chat media is often recompressed server-side. Photos stay practical under a few megabytes; voice notes are Opus/Ogg.',
    },
    source: {
      label: 'WhatsApp Help / FAQ (Foto- und Videogrößen, Stand dokumentiert)',
      url: 'https://faq.whatsapp.com/',
      retrieved: '2026-09-01',
    },
    limits: [
      {
        id: 'image',
        kind: 'image',
        label: { de: 'Foto (typisch)', en: 'Photo (typical)' },
        value: { de: 'JPEG, oft auf ~1600 px Kante skaliert', en: 'JPEG, often scaled to a ~1600 px edge' },
      },
      {
        id: 'video',
        kind: 'video',
        label: { de: 'Video', en: 'Video' },
        value: { de: 'MP4/H.264, Status ~30 s, Datei oft < 16 MB vor Kompression', en: 'MP4/H.264, status ~30 s, files often < 16 MB before compression' },
      },
      {
        id: 'file',
        kind: 'file',
        label: { de: 'Dokument', en: 'Document' },
        value: { de: 'bis 2 GB (Dokument-Sendung), PDF üblich', en: 'up to 2 GB (document send), PDF common' },
      },
      {
        id: 'voice',
        kind: 'audio',
        label: { de: 'Voice Note', en: 'Voice note' },
        value: { de: 'Ogg/Opus', en: 'Ogg/Opus' },
      },
    ],
    relatedFormats: ['jpg', 'mp4', 'pdf', 'opus', 'ogg'],
    relatedTools: ['pdf-compress', 'pdf-to-images', 'images-to-pdf'],
  }),
  platformSpecSchema.parse({
    id: 'instagram',
    name: { de: 'Instagram', en: 'Instagram' },
    summary: {
      de: 'Feed 4:5 oder 1:1, Reels 9:16. Upload wird neu kodiert — lokale Vorbereitung spart Überraschungen bei Rändern.',
      en: 'Feed 4:5 or 1:1, Reels 9:16. Uploads are re-encoded — preparing locally avoids surprise crops.',
    },
    source: {
      label: 'Meta Business Help (Bild- und Videoempfehlungen)',
      url: 'https://www.facebook.com/help/instagram/1631821640426723',
      retrieved: '2026-09-01',
    },
    limits: [
      {
        id: 'feed',
        kind: 'image',
        label: { de: 'Feed-Bild', en: 'Feed image' },
        value: { de: 'JPEG/PNG, 1080 px Breite, 4:5 bevorzugt', en: 'JPEG/PNG, 1080 px width, 4:5 preferred' },
      },
      {
        id: 'story',
        kind: 'video',
        label: { de: 'Story / Reel', en: 'Story / Reel' },
        value: { de: '9:16, 1080×1920, MP4/H.264, Reel bis 90–180 s je Konto', en: '9:16, 1080×1920, MP4/H.264, Reels 90–180 s depending on account' },
      },
    ],
    relatedFormats: ['jpg', 'png', 'mp4'],
    relatedTools: ['images-to-pdf', 'pdf-to-images'],
  }),
  platformSpecSchema.parse({
    id: 'tiktok',
    name: { de: 'TikTok', en: 'TikTok' },
    summary: {
      de: 'Primär 9:16, 1080×1920, 30–60 fps. Sehr lange Videos werden je nach Region gedeckelt.',
      en: 'Primarily 9:16, 1080×1920, 30–60 fps. Very long videos are capped by region.',
    },
    source: {
      label: 'TikTok Creative Center / Upload-Spezifikation',
      url: 'https://www.tiktok.com/creators/creator-portal/en-us/tiktok-content-strategy/tiktok-video-specifications/',
      retrieved: '2026-09-01',
    },
    limits: [
      {
        id: 'video',
        kind: 'video',
        label: { de: 'Video', en: 'Video' },
        value: { de: 'MP4 oder MOV, 9:16, oft max. 10 min / ~287 MB', en: 'MP4 or MOV, 9:16, often max 10 min / ~287 MB' },
      },
    ],
    relatedFormats: ['mp4', 'mov'],
    relatedTools: [],
    notes: {
      de: 'Video-Tools sind in Vorbereitung. Bis dahin nur Spezifikation, kein Encoder.',
      en: 'Video tools are in preparation. Until then this is specification only, no encoder.',
    },
  }),
  platformSpecSchema.parse({
    id: 'youtube',
    name: { de: 'YouTube', en: 'YouTube' },
    summary: {
      de: 'YouTube akzeptiert viele Container; empfohlen bleibt MP4 mit H.264/AAC oder VP9/AV1. Shorts: 9:16, bis 60 s (länger je Konto).',
      en: 'YouTube accepts many containers; MP4 with H.264/AAC or VP9/AV1 remains recommended. Shorts: 9:16, up to 60 s (longer on some accounts).',
    },
    source: {
      label: 'YouTube Help (empfohlene Upload-Einstellungen)',
      url: 'https://support.google.com/youtube/answer/1722171',
      retrieved: '2026-09-01',
    },
    limits: [
      {
        id: 'long',
        kind: 'video',
        label: { de: 'Standard-Upload', en: 'Standard upload' },
        value: { de: 'bis 256 GB bzw. 12 h, MP4 empfohlen', en: 'up to 256 GB or 12 h, MP4 recommended' },
      },
      {
        id: 'shorts',
        kind: 'video',
        label: { de: 'Shorts', en: 'Shorts' },
        value: { de: '9:16, typisch ≤ 60 s', en: '9:16, typically ≤ 60 s' },
      },
    ],
    relatedFormats: ['mp4', 'webm', 'mov'],
    relatedTools: [],
  }),
  platformSpecSchema.parse({
    id: 'x',
    name: { de: 'X (Twitter)', en: 'X (Twitter)' },
    summary: {
      de: 'Bilder werden stark komprimiert. Videos bleiben kurz; GIF-Uploads werden oft zu MP4.',
      en: 'Images are heavily compressed. Videos stay short; GIF uploads are often turned into MP4.',
    },
    source: {
      label: 'X Help (Medienlimits)',
      url: 'https://help.x.com/en/using-x/x-videos',
      retrieved: '2026-09-01',
    },
    limits: [
      {
        id: 'image',
        kind: 'image',
        label: { de: 'Bild', en: 'Image' },
        value: { de: 'JPEG/PNG/WebP/GIF, oft 5 MB (frei) / höher mit Abo', en: 'JPEG/PNG/WebP/GIF, often 5 MB (free) / higher with subscription' },
      },
      {
        id: 'video',
        kind: 'video',
        label: { de: 'Video', en: 'Video' },
        value: { de: 'MP4/MOV, Dauer und MB je Konto (typisch 2:20 / 512 MB)', en: 'MP4/MOV, duration and MB vary by account (typically 2:20 / 512 MB)' },
      },
    ],
    relatedFormats: ['jpg', 'png', 'webp', 'gif', 'mp4', 'mov'],
    relatedTools: ['pdf-to-images'],
  }),
  platformSpecSchema.parse({
    id: 'linkedin',
    name: { de: 'LinkedIn', en: 'LinkedIn' },
    summary: {
      de: 'Dokumente als PDF oder Karussell; Video 16:9 oder 1:1, Uploads werden transkodiert.',
      en: 'Documents as PDF or carousel; video 16:9 or 1:1, uploads are transcoded.',
    },
    source: {
      label: 'LinkedIn Help (Video- und Bildspezifikationen)',
      url: 'https://www.linkedin.com/help/linkedin/answer/a563502',
      retrieved: '2026-09-01',
    },
    limits: [
      {
        id: 'image',
        kind: 'image',
        label: { de: 'Beitragsbild', en: 'Post image' },
        value: { de: 'JPEG/PNG, 1200×627 üblich für Linkkarten', en: 'JPEG/PNG, 1200×627 common for link cards' },
      },
      {
        id: 'doc',
        kind: 'document',
        label: { de: 'Dokument', en: 'Document' },
        value: { de: 'PDF, oft ≤ 100 MB / 300 Seiten', en: 'PDF, often ≤ 100 MB / 300 pages' },
      },
      {
        id: 'video',
        kind: 'video',
        label: { de: 'Video', en: 'Video' },
        value: { de: 'MP4, typisch ≤ 15 min / 5 GB', en: 'MP4, typically ≤ 15 min / 5 GB' },
      },
    ],
    relatedFormats: ['pdf', 'jpg', 'png', 'mp4'],
    relatedTools: ['pdf-compress', 'images-to-pdf', 'pdf-to-images'],
  }),
  platformSpecSchema.parse({
    id: 'discord',
    name: { de: 'Discord', en: 'Discord' },
    summary: {
      de: 'Freie Konten haben einen kleinen Upload-Deckel; Nitro hebt ihn. Nitro-freie Kompression lohnt sich lokal.',
      en: 'Free accounts have a small upload cap; Nitro raises it. Compressing locally still helps without Nitro.',
    },
    source: {
      label: 'Discord Support (Dateigrößen-Limits)',
      url: 'https://support.discord.com/hc/en-us/articles/115002192071',
      retrieved: '2026-09-01',
    },
    limits: [
      {
        id: 'file',
        kind: 'file',
        label: { de: 'Upload frei / Nitro', en: 'Upload free / Nitro' },
        value: { de: '10 MB frei, 50–500 MB mit Nitro je Stufe', en: '10 MB free, 50–500 MB with Nitro depending on tier' },
      },
    ],
    relatedFormats: ['png', 'jpg', 'gif', 'mp4', 'pdf', 'zip'],
    relatedTools: ['pdf-compress', 'pdf-to-images'],
  }),
  platformSpecSchema.parse({
    id: 'email-25mb',
    name: { de: 'E-Mail (25 MB)', en: 'Email (25 MB)' },
    summary: {
      de: 'Viele Provider (Gmail, Outlook.com, viele Firmen-Relays) begrenzen die gesamte Nachricht auf etwa 25 MB inklusive MIME-Overhead. Große PDFs vorher teilen oder komprimieren.',
      en: 'Many providers (Gmail, Outlook.com, many corporate relays) cap the whole message at about 25 MB including MIME overhead. Split or compress large PDFs first.',
    },
    source: {
      label: 'Gmail Help (Anhanggröße) / übliche MTA-Praxis',
      url: 'https://support.google.com/mail/answer/6584',
      retrieved: '2026-09-01',
    },
    limits: [
      {
        id: 'message',
        kind: 'file',
        label: { de: 'Gesamtnachricht', en: 'Entire message' },
        value: { de: '≈ 25 MB inkl. Base64-Overhead (~33 % mehr als Rohdatei)', en: '≈ 25 MB including Base64 overhead (~33% more than the raw file)' },
      },
    ],
    relatedFormats: ['pdf', 'zip', 'jpg'],
    relatedTools: ['pdf-compress', 'pdf-split', 'pdf-merge'],
    notes: {
      de: '„Make it fit“ kommt später. Bis dahin: teilen, komprimieren, oder Link statt Anhang.',
      en: '“Make it fit” comes later. Until then: split, compress, or send a link instead of an attachment.',
    },
  }),
  platformSpecSchema.parse({
    id: 'bea-erv',
    name: { de: 'beA / ERV', en: 'beA / ERV' },
    summary: {
      de: 'Besonderes elektronisches Anwaltspostfach und elektronischer Rechtsverkehr: PDF-Version, Größe, keine aktiven Inhalte, eingebettete Schriften. Kein Versand aus NeoTools — nur Prüfung.',
      en: 'Special electronic lawyer mailbox and electronic legal communication: PDF version, size, no active content, embedded fonts. NeoTools does not send — it only checks.',
    },
    source: {
      label: 'BRAK / EGVP-Hinweise zu Dateianlagen (Regelwerk v1 im Tool dach-bea-erv)',
      url: 'https://www.brak.de/anwaltschaft/bea/',
      retrieved: '2026-09-01',
    },
    limits: [
      {
        id: 'size',
        kind: 'document',
        label: { de: 'Dateigröße', en: 'File size' },
        value: { de: 'je nach Weg oft 60–100 MB pro Nachricht, einzelne PDFs kleiner halten', en: 'often 60–100 MB per message depending on the path; keep individual PDFs smaller' },
      },
      {
        id: 'pdf',
        kind: 'document',
        label: { de: 'PDF-Regeln', en: 'PDF rules' },
        value: {
          de: 'kein JavaScript, keine Verschlüsselung, PDF 1.4–1.7 üblich, Schriften einbetten',
          en: 'no JavaScript, no encryption, PDF 1.4–1.7 common, embed fonts',
        },
      },
    ],
    relatedFormats: ['pdf', 'pdfa'],
    relatedTools: ['dach-bea-erv', 'pdf-sanitize', 'pdf-a', 'pdf-lock'],
    notes: {
      de: 'Verbindlich ist die aktuelle EGVP/beA-Doku der jeweiligen Stelle, nicht diese Seite.',
      en: 'The current EGVP/beA documentation of the relevant body is authoritative, not this page.',
    },
  }),
];

export function listPlatformSpecs(): PlatformSpec[] {
  return PLATFORM_SPECS;
}

export function getPlatformSpec(id: string): PlatformSpec | undefined {
  return PLATFORM_SPECS.find((spec) => spec.id === id);
}

export function validatePlatformSpecs(): PlatformSpec[] {
  return PLATFORM_SPECS.map((spec) => platformSpecSchema.parse(spec));
}
