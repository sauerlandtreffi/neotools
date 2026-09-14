import type { APIRoute } from 'astro';
import { workspaceToolsMeta } from '../lib/workspace/meta';

/**
 * Tool metadata for the program shell (view + Zod form fields + presets per
 * public tool). Served as a static asset so the `/` HTML stays small and the
 * shell is interactive before the catalogue arrives (pivot §11.1/4 performance).
 */
export const GET: APIRoute = () =>
  new Response(JSON.stringify(workspaceToolsMeta()), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
