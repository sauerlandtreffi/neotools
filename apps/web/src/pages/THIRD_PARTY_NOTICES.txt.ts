import type { APIRoute } from 'astro';
import { collectLicenses } from '@neotools/engine';
import { registry } from '../lib/registry';
import { thirdPartyNotices } from '../lib/licenses-view';

export const GET: APIRoute = () => {
  return new Response(thirdPartyNotices(collectLicenses(registry)), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
