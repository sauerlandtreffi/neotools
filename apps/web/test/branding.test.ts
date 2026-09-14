import { describe, expect, it } from 'vitest';
import { isHiddenTool, loadBranding } from '../src/lib/branding';
import { listPublicTools } from '../src/lib/visible-tools';
import { registry } from '../src/lib/registry';

describe('branding hiddenTools', () => {
  it('hides listed ids from the public catalog', () => {
    const sample = registry.list()[0];
    expect(sample).toBeTruthy();
    const hidden = [sample!.id];
    expect(isHiddenTool(sample!.id, { ...loadBranding(), hiddenTools: hidden })).toBe(true);
    expect(listPublicTools(hidden).some((tool) => tool.id === sample!.id)).toBe(false);
    expect(listPublicTools([]).some((tool) => tool.id === sample!.id)).toBe(true);
  });

  it('reads optional branding fields with defaults', () => {
    const branding = loadBranding();
    expect(Array.isArray(branding.hiddenTools)).toBe(true);
    expect(branding.defaultLocale === 'de' || branding.defaultLocale === 'en').toBe(true);
    expect(Array.isArray(branding.footerLinks)).toBe(true);
  });
});
