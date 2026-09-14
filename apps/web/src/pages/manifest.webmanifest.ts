import type { APIRoute } from 'astro';
import { branding } from '../lib/branding';
import { listPublicTools } from '../lib/visible-tools';

export const GET: APIRoute = () => {
  const shortcuts = listPublicTools()
    .slice(0, 4)
    .map((tool) => ({ name: tool.title.de, url: `/${tool.id}` }));
  const manifest = {
    id: '/',
    name: branding.name,
    short_name: branding.name.slice(0, 12),
    description: branding.tagline.de,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: branding.colors.primary,
    theme_color: branding.colors.primary,
    lang: branding.defaultLocale,
    icons: [{ src: branding.logo, sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
    file_handlers: [
      {
        action: '/open',
        accept: { 'application/pdf': ['.pdf'] },
      },
    ],
    share_target: {
      action: '/open',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        files: [{ name: 'files', accept: ['application/pdf', 'image/png', 'image/jpeg'] }],
      },
    },
    shortcuts,
    launch_handler: { client_mode: 'focus-existing' },
  };
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  });
};
