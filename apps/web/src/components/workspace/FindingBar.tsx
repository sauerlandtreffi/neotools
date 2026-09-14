import type { Finding, Selection } from '@neotools/engine';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import {
  activeFile,
  dismissFinding,
  runStep,
  setMarks,
  setPage,
  setPendingTool,
  setSelection,
  tools,
  workspace,
  type RedactMark,
} from '../../lib/workspace/store';
import { I } from './Icons';

const SEV_COLOR: Record<Finding['severity'], string> = { high: 'var(--warn-text)', warn: 'var(--warn-text)', info: 'var(--info-text)' };

let seq = 0;
function nid(): string {
  seq += 1;
  return `fm${seq}`;
}

export default function FindingBar({ locale }: { locale: Locale }) {
  const file = activeFile.value;
  if (!file) return null;
  const findings = file.findings;
  const analyzing = file.analyzedAt === undefined;
  if (!analyzing && !findings.length) return null;
  const pii = findings.filter((f) => f.suggestedToolId === 'pdf-redact');
  const cleanable = findings.filter((f) => f.suggestedToolId === 'pdf-sanitize');

  const jump = (f: Finding) => {
    const sel = f.selection as Selection | undefined;
    const page = sel?.pages?.[0];
    if (page) setPage(page);
    if (sel?.regions?.length) {
      setSelection({ pages: sel.pages });
    }
  };

  const redactAll = () => {
    const marks: RedactMark[] = [];
    for (const f of pii) {
      const sel = f.selection as Selection | undefined;
      for (const r of sel?.regions ?? []) {
        marks.push({ id: nid(), page: r.page ?? 1, x: r.x, y: r.y, w: r.w, h: r.h, source: 'finding', pattern: f.kind, selected: true });
      }
    }
    setPendingTool('pdf-redact', { mode: 'manual' });
    setMarks(marks);
    const first = marks[0];
    if (first) setPage(first.page);
  };

  const cleanAll = async () => {
    const opts: Record<string, unknown> = {};
    for (const f of cleanable) Object.assign(opts, (f.suggestedOptions as Record<string, unknown> | undefined) ?? {});
    await runStep('pdf-sanitize', opts, { selection: {} });
  };

  const single = (f: Finding) => {
    if (f.suggestedToolId === 'pdf-redact') {
      const sel = f.selection as Selection | undefined;
      const marks: RedactMark[] = (sel?.regions ?? []).map((r) => ({
        id: nid(),
        page: r.page ?? 1,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        source: 'finding',
        pattern: f.kind,
        selected: true,
      }));
      setPendingTool('pdf-redact', { mode: 'manual' });
      setMarks(marks);
      if (marks[0]) setPage(marks[0].page);
      return;
    }
    if (f.suggestedToolId && tools.value.some((t) => t.view.id === f.suggestedToolId)) {
      setPendingTool(f.suggestedToolId, (f.suggestedOptions as Record<string, unknown> | undefined) ?? {});
    }
  };

  return (
    <div class="ws-findings nt-fade-in" role="region" aria-label={w(locale, 'findings')} data-findings>
      <span class="ws-findings-lead">
        {analyzing ? (
          <>
            <I.spinner size={14} /> {w(locale, 'analyzing')}
          </>
        ) : (
          <>
            <I.eye size={14} /> {w(locale, 'findingsLead')}
          </>
        )}
      </span>
      <ul class="ws-findings-list">
        {findings.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              class="chip"
              style={{ color: SEV_COLOR[f.severity] }}
              data-finding={f.kind}
              data-severity={f.severity}
              title={f.selection ? w(locale, 'jumpTo') : undefined}
              onClick={() => (f.selection ? jump(f) : single(f))}
            >
              {f.label[locale] ?? f.label.de}
            </button>
          </li>
        ))}
      </ul>
      <span class="ml-auto flex flex-wrap items-center gap-1">
        {pii.length > 0 && (
          <button type="button" class="btn btn-sm btn-primary" data-finding-action="redact" onClick={redactAll}>
            {w(locale, 'redactNow')}
          </button>
        )}
        {cleanable.length > 0 && (
          <button
            type="button"
            class={`btn btn-sm ${pii.length ? '' : 'btn-primary'}`}
            data-finding-action="sanitize"
            disabled={workspace.value.pendingToolId === 'pdf-sanitize'}
            onClick={() => void cleanAll()}
          >
            {w(locale, 'cleanNow')}
          </button>
        )}
        {findings.length > 0 && (
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            aria-label={w(locale, 'dismiss')}
            onClick={() => {
              for (const f of findings) void dismissFinding(file.id, f.id);
            }}
          >
            <I.x size={14} />
          </button>
        )}
      </span>
    </div>
  );
}
