import { useEffect, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { activeFile, currentPipeline, runBatch, setUi, toast, tools, workspace } from '../../lib/workspace/store';
import { currentName } from '../../lib/workspace/step-stack';
import { I } from './Icons';

export default function BatchOverlay({ locale }: { locale: Locale }) {
  const s = workspace.value;
  const active = activeFile.value;
  const spec = currentPipeline();
  const candidates = (s.session?.files ?? []).filter((f) => f.id !== active?.id && f.mime === active?.mime);
  const [picked, setPicked] = useState<string[]>([]);
  const [progress, setProgress] = useState<Record<string, 'wait' | 'run' | 'ok' | 'fail'>>({});
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!s.batchOpen) return;
    const pre = s.selectedFileIds.filter((id) => candidates.some((f) => f.id === id));
    setPicked(pre.length ? pre : candidates.map((f) => f.id));
    setProgress({});
  }, [s.batchOpen]);

  if (!s.batchOpen || !active) return null;
  const title = (id: string) => tools.value.find((t) => t.view.id === id)?.view.title[locale] ?? id;

  const run = async () => {
    if (!spec || !picked.length) return;
    setRunning(true);
    const prog: Record<string, 'wait' | 'run' | 'ok' | 'fail'> = {};
    for (const id of picked) prog[id] = 'run';
    setProgress({ ...prog });
    let ok = 0;
    let fail = 0;
    await runBatch(picked, (fileId, good) => {
      prog[fileId] = good ? 'ok' : 'fail';
      good ? ok++ : fail++;
      setProgress({ ...prog });
    });
    setRunning(false);
    toast(fail ? 'warn' : 'ok', w(locale, 'batchDone', { ok, fail }));
  };

  return (
    <div class="ws-modal-backdrop" onClick={() => !running && setUi({ batchOpen: false })}>
      <div class="ws-modal nt-pop" role="dialog" aria-modal="true" aria-label={w(locale, 'batchTitle')} data-batch-overlay onClick={(e) => e.stopPropagation()}>
        <header class="ws-panel-head">
          <span class="font-medium">{w(locale, 'batchTitle')}</span>
          <button type="button" class="btn btn-ghost btn-icon ml-auto" aria-label={w(locale, 'close')} disabled={running} onClick={() => setUi({ batchOpen: false })}>
            <I.x />
          </button>
        </header>
        <div class="grid gap-3 p-4">
          <p class="text-xs" style={{ color: 'var(--muted)' }}>
            {w(locale, 'batchHint')}
          </p>
          <ol class="flex flex-wrap gap-1">
            {(spec?.steps ?? []).map((st, i) => (
              <li key={i} class="chip" data-on>
                {i + 1}. {title(st.toolId)}
              </li>
            ))}
          </ol>
          {!spec && (
            <p class="text-xs" style={{ color: 'var(--warn-text)' }}>
              {w(locale, 'noSteps')}
            </p>
          )}
          <ul class="grid gap-1">
            {candidates.length === 0 && (
              <li class="text-xs" style={{ color: 'var(--muted)' }}>
                {locale === 'de' ? 'Keine weiteren passenden Dateien im Tray.' : 'No other matching files in the tray.'}
              </li>
            )}
            {candidates.map((f) => {
              const st = progress[f.id];
              return (
                <li key={f.id} class="ws-merge-row" data-on={picked.includes(f.id)}>
                  <input
                    type="checkbox"
                    checked={picked.includes(f.id)}
                    disabled={running}
                    aria-label={currentName(f)}
                    onChange={() => setPicked(picked.includes(f.id) ? picked.filter((x) => x !== f.id) : [...picked, f.id])}
                  />
                  <span class="min-w-0 flex-1 truncate text-sm">{currentName(f)}</span>
                  <span class="mono text-xs" data-batch-state={st ?? 'idle'} style={{ color: st === 'ok' ? 'var(--ok)' : st === 'fail' ? 'var(--warn-text)' : 'var(--faint)' }}>
                    {st === 'run' ? <I.spinner size={12} /> : st === 'ok' ? <I.check size={12} /> : st === 'fail' ? <I.warn size={12} /> : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <footer class="ws-options-foot">
          <button type="button" class="btn btn-primary w-full" disabled={!spec || !picked.length || running} data-batch-run onClick={() => void run()}>
            {running ? <I.spinner size={14} /> : <I.batch size={14} />} {w(locale, 'batchRun', { n: picked.length })}
          </button>
        </footer>
      </div>
    </div>
  );
}
