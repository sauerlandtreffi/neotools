import { useMemo, useState } from 'preact/hooks';
import { isSelectionKey, type FormField } from '@neotools/engine';
import type { Locale } from '../../lib/i18n';
import { fmtBytes, w } from '../../lib/workspace/i18n';
import { previewRedactJob } from '../../lib/workspace/pool';
import {
  activeFile,
  activeRef,
  applyPending,
  busy,
  pendingTool,
  readRef,
  setMarks,
  setPendingOptions,
  setPendingTool,
  setRedactMode,
  toast,
  workspace,
  type RedactMark,
  type RedactMode,
} from '../../lib/workspace/store';
import { currentName } from '../../lib/workspace/step-stack';
import ZodForm from '../ZodForm';
import { I } from './Icons';

const HIDDEN_BY_TOOL: Record<string, string[]> = {
  'pdf-redact': ['regions', 'mode'],
  'pdf-reorder': ['order', 'delete'],
  'pdf-compress': ['targetSizeMb'],
};

/** Estimated compression ratio per preset (used for the live "make it fit" hint before the real run). */
const RATIO: Record<string, number> = { light: 0.75, medium: 0.5, heavy: 0.3, scan: 0.35 };

let seq = 0;
function nid(): string {
  seq += 1;
  return `a${seq}`;
}

export default function OptionsPanel({ locale, onClose }: { locale: Locale; onClose?: () => void }) {
  const s = workspace.value;
  const meta = pendingTool.value;
  const file = activeFile.value;
  const [loadingHits, setLoadingHits] = useState(false);
  if (!meta || !file) return null;
  const v = meta.view;
  const locked = v.desktopOnly && !s.desktop;
  const hidden = new Set([...(HIDDEN_BY_TOOL[v.id] ?? [])]);
  const fields: FormField[] = meta.fields.filter((f) => !isSelectionKey(f.name) && !hidden.has(f.name));
  const isRedact = v.id === 'pdf-redact';
  const isCompress = v.id === 'pdf-compress';
  const selectedPages = s.selection.pages?.length ?? 0;
  const headSize = file.head < 0 ? file.size : file.revisions[file.head]?.outputSize ?? file.size;
  const marks = s.marks;

  const canApply = !locked && !busy.value && (!isRedact || marks.some((m) => m.selected) || s.pendingOptions.mode === 'auto');

  const loadAutoHits = async () => {
    const ref = activeRef.value;
    if (!ref) return;
    setLoadingHits(true);
    try {
      const bytes = await readRef(ref);
      if (!bytes) return;
      const res = await previewRedactJob({ name: currentName(file), mime: file.mime, data: bytes }, { ...s.pendingOptions, mode: 'auto' }).promise;
      const hits = res.hits as Array<{ page: number; x: number; y: number; w: number; h: number; pattern?: string; text?: string }>;
      const next: RedactMark[] = hits.map((h) => ({ id: nid(), page: h.page, x: h.x, y: h.y, w: h.w, h: h.h, source: 'auto', pattern: h.pattern, text: h.text, selected: true }));
      setMarks((prev) => [...prev.filter((m) => m.source !== 'auto'), ...next]);
      if (!next.length) toast('info', locale === 'de' ? 'Keine Auto-Treffer.' : 'No auto hits.');
      for (const warn of res.warnings) toast('warn', warn);
    } catch (err) {
      toast('err', err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingHits(false);
    }
  };

  const estimate = useMemo(() => {
    if (!isCompress) return null;
    const preset = String(s.pendingOptions.preset ?? 'medium');
    const target = Number(s.pendingOptions.targetSizeMb ?? 0);
    const est = headSize * (RATIO[preset] ?? 0.5);
    return { est, target };
  }, [isCompress, s.pendingOptions, headSize]);

  return (
    <section class="ws-options nt-fade-in" aria-label={w(locale, 'options')} data-options-panel data-tool={v.id}>
      <header class="ws-panel-head">
        <span class="min-w-0">
          <span class="block truncate font-medium">{v.title[locale]}</span>
          <span class="block truncate text-xs" style={{ color: 'var(--muted)' }}>
            {v.description[locale]}
          </span>
        </span>
        <button
          type="button"
          class="btn btn-ghost btn-icon ml-auto"
          aria-label={w(locale, 'close')}
          onClick={() => {
            setPendingTool(null);
            onClose?.();
          }}
        >
          <I.x />
        </button>
      </header>

      <div class="ws-options-body">
        {locked && (
          <p class="ws-note" data-desktop-only>
            <I.lock size={14} /> <strong>{w(locale, 'desktopOnly')}</strong> — {w(locale, 'desktopOnlyHint')}{' '}
            <a href={locale === 'de' ? '/#desktop' : '/en/#desktop'}>Desktop-App</a>
          </p>
        )}
        {v.destructive && !locked && (
          <p class="ws-note" style={{ color: 'var(--warn-text)' }}>
            <I.warn size={14} /> {w(locale, 'destructiveHint')}
          </p>
        )}
        {selectedPages > 0 && !isRedact && (
          <p class="ws-note" style={{ color: 'var(--accent-text)' }}>
            {w(locale, 'selectionPages', { n: selectedPages })}
          </p>
        )}

        {meta.presets.length > 0 && (
          <div class="flex flex-wrap gap-1" role="group" aria-label={w(locale, 'presets')}>
            {meta.presets.map((p) => {
              const on = Object.entries(p.options).every(([k, val]) => JSON.stringify(s.pendingOptions[k]) === JSON.stringify(val));
              return (
                <button key={p.id} type="button" class="chip" data-on={on} data-preset={p.id} onClick={() => setPendingOptions({ ...s.pendingOptions, ...p.options })}>
                  {p.title[locale]}
                </button>
              );
            })}
          </div>
        )}

        {isRedact && (
          <div class="grid gap-2" data-redact-controls>
            <div class="flex flex-wrap gap-1" role="group" aria-label={w(locale, 'marks')}>
              {(['text', 'rect', 'search'] as RedactMode[]).map((m) => (
                <button key={m} type="button" class="chip" data-on={s.redactMode === m} data-redact-mode={m} onClick={() => setRedactMode(m)}>
                  {w(locale, m === 'text' ? 'redactText' : m === 'rect' ? 'redactRect' : 'redactSearch')}
                </button>
              ))}
              <button type="button" class="chip ml-auto" disabled={loadingHits} data-redact-auto onClick={() => void loadAutoHits()}>
                {loadingHits ? <I.spinner size={12} /> : null} {w(locale, 'autoHits')}
              </button>
            </div>
            {s.redactMode === 'search' && (
              <p class="text-xs" style={{ color: 'var(--muted)' }}>
                {locale === 'de' ? 'Suchfeld oben im Dokument nutzen; Treffer per Enter markieren.' : 'Use the document search above; Enter marks a hit.'}
              </p>
            )}
            <ul class="ws-marks" aria-label={w(locale, 'marks')} data-marks>
              {marks.length === 0 && (
                <li class="text-xs" style={{ color: 'var(--muted)' }}>
                  {w(locale, 'noMarks')}
                </li>
              )}
              {marks.map((m) => (
                <li key={m.id} class="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={m.selected} onChange={() => setMarks((prev) => prev.map((x) => (x.id === m.id ? { ...x, selected: !x.selected } : x)))} />
                  <span class="mono" style={{ color: 'var(--faint)' }}>
                    p{m.page}
                  </span>
                  <span class="truncate">{m.pattern ?? m.source}{m.text ? ` “${m.text.slice(0, 24)}”` : ''}</span>
                  <button type="button" class="btn btn-ghost btn-icon ml-auto" aria-label={w(locale, 'remove')} onClick={() => setMarks((prev) => prev.filter((x) => x.id !== m.id))}>
                    <I.x size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isCompress && estimate && (
          <div class="grid gap-1" data-fit-slider>
            <label class="label flex items-center justify-between">
              <span>{w(locale, 'makeItFit')}</span>
              <span class="tnum text-xs" style={{ color: 'var(--muted)' }}>
                {w(locale, 'sizeNow')}: {fmtBytes(headSize)} → ≈ {fmtBytes(estimate.target ? Math.min(estimate.est, estimate.target * 1024 * 1024) : estimate.est)}
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.ceil(headSize / 1024 / 1024))}
              step={0.1}
              value={estimate.target || 0}
              aria-label={w(locale, 'targetSize')}
              onInput={(e) => {
                const val = Number((e.target as HTMLInputElement).value);
                setPendingOptions({ ...s.pendingOptions, targetSizeMb: val > 0 ? val : undefined });
              }}
            />
            <span class="text-xs tnum" style={{ color: 'var(--faint)' }}>
              {estimate.target ? `${w(locale, 'targetSize')}: ${estimate.target.toFixed(1)} MB` : locale === 'de' ? 'Ohne Zielgröße (Preset)' : 'No target (preset only)'}
            </span>
          </div>
        )}

        {fields.length > 0 && (
          <fieldset disabled={locked} class="min-w-0">
            <ZodForm fields={fields} values={s.pendingOptions} onChange={setPendingOptions} locked={meta.lockedKeys} />
          </fieldset>
        )}
      </div>

      <footer class="ws-options-foot">
        <button type="button" class="btn btn-primary w-full" disabled={!canApply} data-apply onClick={() => void applyPending()}>
          {busy.value ? <I.spinner size={14} /> : <I.check size={14} />}
          {busy.value ? w(locale, 'applying') : w(locale, 'apply')}
          <kbd class="ml-auto">⌘⏎</kbd>
        </button>
      </footer>
    </section>
  );
}
