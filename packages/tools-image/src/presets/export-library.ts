export interface ExportItem {
  id: string;
  width: number;
  height: number;
  format: 'png' | 'jpeg' | 'webp' | 'avif' | 'ico';
  filename: string;
  quality?: number;
  background?: [number, number, number];
  overlayTitle?: boolean;
  safeZone?: boolean;
  bleedMm?: number;
  dpi?: number;
}

export interface ExportPreset {
  id: string;
  title: { de: string; en: string };
  items: ExportItem[];
  snippets?: Array<{ name: string; body: string }>;
}

const social = (id: string, w: number, h: number, filename: string): ExportItem => ({
  id,
  width: w,
  height: h,
  format: 'jpeg',
  filename,
  quality: 88,
});

export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: 'favicon',
    title: { de: 'Favicon-Pack', en: 'Favicon pack' },
    items: [
      { id: 'ico', width: 48, height: 48, format: 'ico', filename: 'favicon.ico' },
      { id: 'png192', width: 192, height: 192, format: 'png', filename: 'android-chrome-192x192.png' },
      { id: 'png512', width: 512, height: 512, format: 'png', filename: 'android-chrome-512x512.png' },
      { id: 'apple', width: 180, height: 180, format: 'png', filename: 'apple-touch-icon.png' },
    ],
    snippets: [
      {
        name: 'site.webmanifest',
        body: JSON.stringify(
          {
            name: 'App',
            short_name: 'App',
            icons: [
              { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
              { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
            ],
          },
          null,
          2,
        ),
      },
      {
        name: 'favicon.html',
        body: `<link rel="icon" href="/favicon.ico" sizes="any">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<link rel="manifest" href="/site.webmanifest">\n`,
      },
    ],
  },
  {
    id: 'appicon',
    title: { de: 'App-Icon-Set', en: 'App icon set' },
    items: [
      { id: 'ios180', width: 180, height: 180, format: 'png', filename: 'ios-180.png' },
      { id: 'ios120', width: 120, height: 120, format: 'png', filename: 'ios-120.png' },
      { id: 'android512', width: 512, height: 512, format: 'png', filename: 'android-512.png' },
      { id: 'maskable', width: 512, height: 512, format: 'png', filename: 'maskable-512.png' },
    ],
  },
  {
    id: 'og',
    title: { de: 'OG / Social-Card', en: 'OG / social card' },
    items: [{ id: 'og', width: 1200, height: 630, format: 'jpeg', filename: 'og-1200x630.jpg', quality: 85, overlayTitle: true }],
    snippets: [{ name: 'og.html', body: `<meta property="og:image" content="/og-1200x630.jpg">\n<meta name="twitter:card" content="summary_large_image">\n` }],
  },
  {
    id: 'web-1x2x',
    title: { de: 'Web-Pack 1×/2×', en: 'Web pack 1×/2×' },
    items: [
      { id: '1x-avif', width: 800, height: 450, format: 'avif', filename: 'hero-800.avif', quality: 70 },
      { id: '2x-avif', width: 1600, height: 900, format: 'avif', filename: 'hero-1600.avif', quality: 70 },
      { id: '1x-webp', width: 800, height: 450, format: 'webp', filename: 'hero-800.webp', quality: 78 },
      { id: '2x-webp', width: 1600, height: 900, format: 'webp', filename: 'hero-1600.webp', quality: 78 },
      { id: '1x-jpg', width: 800, height: 450, format: 'jpeg', filename: 'hero-800.jpg', quality: 82 },
      { id: '2x-jpg', width: 1600, height: 900, format: 'jpeg', filename: 'hero-1600.jpg', quality: 82 },
    ],
    snippets: [
      {
        name: 'picture.html',
        body: `<picture>\n  <source type="image/avif" srcset="hero-800.avif 1x, hero-1600.avif 2x">\n  <source type="image/webp" srcset="hero-800.webp 1x, hero-1600.webp 2x">\n  <img src="hero-800.jpg" srcset="hero-800.jpg 1x, hero-1600.jpg 2x" alt="">\n</picture>\n`,
      },
    ],
  },
  {
    id: 'print-300',
    title: { de: 'Print 300 dpi', en: 'Print 300 dpi' },
    items: [
      { id: 'a4', width: 2480, height: 3508, format: 'jpeg', filename: 'print-a4-300.jpg', quality: 92, dpi: 300, bleedMm: 3 },
      { id: 'a5', width: 1748, height: 2480, format: 'jpeg', filename: 'print-a5-300.jpg', quality: 92, dpi: 300, bleedMm: 3 },
      { id: '10x15', width: 1772, height: 1181, format: 'jpeg', filename: 'print-10x15-300.jpg', quality: 92, dpi: 300 },
    ],
  },
  {
    id: 'platform',
    title: { de: 'Platform-Pack', en: 'Platform pack' },
    items: [
      social('ig-11', 1080, 1080, 'instagram-1x1.jpg'),
      social('ig-45', 1080, 1350, 'instagram-4x5.jpg'),
      { id: 'reel', width: 1080, height: 1920, format: 'jpeg', filename: 'reel-story-9x16.jpg', quality: 88, safeZone: true },
      social('yt', 1280, 720, 'youtube-16x9.jpg'),
      social('x', 1600, 900, 'x-16x9.jpg'),
      social('li', 1200, 627, 'linkedin.jpg'),
    ],
  },
  {
    id: 'produktfoto',
    title: { de: 'Produktfoto-Pack', en: 'Product photo pack' },
    items: [
      { id: 'amazon', width: 1600, height: 1600, format: 'jpeg', filename: 'amazon-1600.jpg', quality: 90, background: [255, 255, 255] },
      { id: 'ebay', width: 1600, height: 1600, format: 'jpeg', filename: 'ebay-1600.jpg', quality: 90, background: [255, 255, 255] },
    ],
  },
  {
    id: 'sticker',
    title: { de: 'WhatsApp/Telegram-Sticker', en: 'WhatsApp/Telegram sticker' },
    items: [{ id: 'sticker', width: 512, height: 512, format: 'webp', filename: 'sticker-512.webp', quality: 75 }],
  },
];
