import type { APIRoute } from 'astro';
import { collectLicenses } from '@neotools/engine';
import { registry } from '../lib/registry';

export const GET: APIRoute = () => {
  const items = collectLicenses(registry);
  return new Response(JSON.stringify(items, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
