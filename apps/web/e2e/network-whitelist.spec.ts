import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { isAllowedNetworkUrl } from './helpers';

/**
 * Network whitelist: every page the build emits must load without a single
 * request leaving the test origin. Foreign requests are *aborted* at the
 * context level (nothing leaves the machine) and recorded; any recorded
 * request fails the test.
 *
 * Page list is derived from `apps/web/dist` (see ensure-dist.mjs):
 *   - every `dist/**\/index.html` except `formats/*` and `convert/*`
 *     (static pages, tool pages, /en mirror, /vergleich/*, /guides/*)
 *   - a deterministic 10 % sample of `formats/*` and `convert/*` (both locales)
 */
const dist = resolve(fileURLToPath(new URL('../dist', import.meta.url)));

const SAMPLED_SECTIONS = new Set(['formats', 'convert']);

function collectPages(): { full: string[]; formats: string[]; convert: string[] } {
  const full: string[] = [];
  const sampled: Record<string, string[]> = { formats: [], convert: [] };
  const walk = (dir: string, urlPath: string, section: string | null) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '_astro' || entry.name === 'assets' || entry.name === 'tessdata') continue;
      const nextDir = join(dir, entry.name);
      const nextUrl = `${urlPath}/${entry.name}`;
      // section = first path segment after optional locale prefix
      const nextSection = section ?? (entry.name === 'en' ? null : entry.name);
      if (existsSync(join(nextDir, 'index.html'))) {
        if (nextSection && SAMPLED_SECTIONS.has(nextSection) && nextSection !== entry.name) {
          sampled[nextSection]!.push(nextUrl);
        } else {
          full.push(nextUrl);
        }
      }
      walk(nextDir, nextUrl, nextSection);
    }
  };
  if (existsSync(join(dist, 'index.html'))) full.push('/');
  walk(dist, '', null);
  return { full, formats: sampled.formats!, convert: sampled.convert! };
}

function sample(items: string[], ratio: number): string[] {
  if (!items.length) return [];
  const sorted = [...items].sort();
  const step = Math.max(1, Math.round(1 / ratio));
  return sorted.filter((_, i) => i % step === 0);
}

test.describe('network whitelist', () => {
  test.describe.configure({ timeout: 30 * 60_000 });

  test('all static + tool pages and a 10 % sample of /formats and /convert — no foreign origins', async ({ browser }) => {
    expect(existsSync(join(dist, 'index.html')), 'apps/web/dist fehlt — `node e2e/ensure-dist.mjs`').toBe(true);
    const pages = collectPages();
    const hrefs = [...new Set([...pages.full, ...sample(pages.formats, 0.1), ...sample(pages.convert, 0.1)])].sort();
    // sanity: tool pages (both locales), formats and convert really exist in the build
    expect(pages.full.length).toBeGreaterThan(200);
    expect(pages.full).toContain('/pdf-redact');
    expect(pages.full).toContain('/en/pdf-redact');
    expect(pages.full).toContain('/preise');
    expect(pages.full).toContain('/impressum');
    expect(pages.formats.length).toBeGreaterThan(10);
    expect(pages.convert.length).toBeGreaterThan(10);

    const context = await browser.newContext();
    const foreign: string[] = [];
    // Hard block: anything not local is aborted before it leaves the machine.
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (isAllowedNetworkUrl(url)) return route.continue();
      foreign.push(url);
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    const failures: string[] = [];
    for (const href of hrefs) {
      foreign.length = 0;
      const res = await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      if (!(res?.ok() ?? false)) failures.push(`${href}: status ${res?.status() ?? 'none'}`);
      await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(150);
      if (foreign.length) failures.push(`${href}: foreign ${[...new Set(foreign)].join(', ')}`);
    }
    await context.close();
    expect(failures, failures.join('\n')).toEqual([]);
    expect(hrefs.length).toBeGreaterThan(220);
  });

  test('a page that tries to phone home is caught by the guard', async ({ page }) => {
    const foreign: string[] = [];
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (isAllowedNetworkUrl(url)) return route.continue();
      foreign.push(url);
      return route.abort('blockedbyclient');
    });
    await page.goto('/');
    // simulate a tracker beacon injected into the page — CSP (connect-src 'self')
    // or the route guard must stop it; it must never succeed.
    const outcome = await page.evaluate(() =>
      fetch('https://tracker.invalid/collect', { mode: 'no-cors' })
        .then(() => 'sent')
        .catch(() => 'blocked'),
    );
    expect(outcome).toBe('blocked');
    // sendBeacon returns true as soon as it is *queued*; the CSP must still veto it
    const beaconBlocked = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const target = 'https://tracker.invalid/beacon';
          document.addEventListener('securitypolicyviolation', (e) => {
            if (e.blockedURI.startsWith('https://tracker.invalid')) resolve(true);
          });
          navigator.sendBeacon(target, 'x');
          setTimeout(() => resolve(false), 2000);
        }),
    );
    expect(beaconBlocked || foreign.some((u) => u.startsWith('https://tracker.invalid/beacon'))).toBe(true);
    // guard bookkeeping stays consistent: nothing foreign was allowed through
    expect(foreign.every((u) => !isAllowedNetworkUrl(u))).toBe(true);
    expect(isAllowedNetworkUrl('https://cdn.example/x.js')).toBe(false);
    expect(isAllowedNetworkUrl('http://127.0.0.1:4173/x')).toBe(true);
    expect(isAllowedNetworkUrl('blob:http://127.0.0.1:4173/abc')).toBe(true);
  });
});
