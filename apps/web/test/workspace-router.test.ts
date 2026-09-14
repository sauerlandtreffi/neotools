import { describe, expect, it } from 'vitest';
import { encodePipelineHash } from '@neotools/engine';
import { encodeOptionsParam } from '../src/lib/options-url';
import { buildWorkspaceQuery, parseWorkspaceQuery, workspacePath } from '../src/lib/workspace/router';

describe('workspace router', () => {
  it('parses composable deep links', () => {
    const o = encodeOptionsParam({ preset: 'heavy' });
    const q = parseWorkspaceQuery(`?session=s1abc&tool=pdf-redact&file=f9&preset=auto-de&o=${o}&pages=1-3,7&t=12-40.5&mode=batch&desktop=1`);
    expect(q).toMatchObject({
      session: 's1abc',
      tool: 'pdf-redact',
      file: 'f9',
      preset: 'auto-de',
      options: { preset: 'heavy' },
      mode: 'batch',
      desktop: true,
      handoff: false,
    });
    expect(q.selection.pages).toEqual([1, 2, 3, 7]);
    expect(q.selection.timeRange).toEqual({ startSec: 12, endSec: 40.5 });
  });

  it('rejects unsafe ids and unknown modes', () => {
    const q = parseWorkspaceQuery('?tool=<script>&session=../x&mode=evil&o=%%%');
    expect(q.tool).toBeUndefined();
    expect(q.session).toBeUndefined();
    expect(q.mode).toBe('edit');
    expect(q.options).toBeUndefined();
  });

  it('reads the legacy #p= pipeline hash', () => {
    const hash = encodePipelineHash({ steps: [{ toolId: 'pdf-sanitize', options: {} }] });
    const q = parseWorkspaceQuery('', hash);
    expect(q.pipeline?.steps[0]?.toolId).toBe('pdf-sanitize');
    expect(parseWorkspaceQuery('', '#p=!!!').pipeline).toBeUndefined();
  });

  it('builds minimal queries and locale paths', () => {
    expect(buildWorkspaceQuery({})).toBe('');
    expect(buildWorkspaceQuery({ session: 's1', tool: 'pdf-compress', mode: 'edit' })).toBe('?session=s1&tool=pdf-compress');
    expect(buildWorkspaceQuery({ mode: 'read' })).toBe('?mode=read');
    expect(workspacePath('de')).toBe('/app');
    expect(workspacePath('en')).toBe('/en/app');
  });
});
