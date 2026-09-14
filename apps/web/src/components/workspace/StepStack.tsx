import type { Locale } from '../../lib/i18n';
import { fmtBytes, w } from '../../lib/workspace/i18n';
import { activeFile, busy, canRedo, canUndo, jumpTo, pipelineShareHash, redo, setUi, toast, tools, undo, workspace } from '../../lib/workspace/store';
import { I } from './Icons';
import VerifySeal from './VerifySeal';

export default function StepStack({ locale, onClose }: { locale: Locale; onClose?: () => void }) {
  const file = activeFile.value;
  const s = workspace.value;
  if (!file) return null;
  const title = (id: string) => tools.value.find((t) => t.view.id === id)?.view.title[locale] ?? id;

  const share = async () => {
    const hash = pipelineShareHash();
    if (!hash) return;
    const url = `${location.origin}${locale === 'en' ? '/en/pipeline' : '/pipeline'}${hash}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('ok', w(locale, 'copied'));
    } catch {
      window.prompt('URL', url);
    }
  };

  const okSteps = file.revisions.filter((r) => r.status === 'ok').length;

  return (
    <section class="ws-stack" aria-label={w(locale, 'steps')} data-stepstack>
      <header class="ws-panel-head">
        <span class="stamp">{w(locale, 'steps')}</span>
        <span class="mono text-xs tnum" style={{ color: 'var(--faint)' }}>
          {okSteps}
        </span>
        <span class="ml-auto flex items-center gap-0.5">
          <button type="button" class="btn btn-ghost btn-icon" aria-label={w(locale, 'undo')} title="⌘Z" disabled={!canUndo.value || busy.value} data-undo onClick={() => void undo()}>
            <I.undo />
          </button>
          <button type="button" class="btn btn-ghost btn-icon" aria-label={w(locale, 'redo')} title="⇧⌘Z" disabled={!canRedo.value || busy.value} data-redo onClick={() => void redo()}>
            <I.redo />
          </button>
          {onClose && (
            <button type="button" class="btn btn-ghost btn-icon" aria-label={w(locale, 'close')} onClick={onClose}>
              <I.x />
            </button>
          )}
        </span>
      </header>
      <ol class="ws-stack-list" aria-label={w(locale, 'steps')}>
        <li>
          <button type="button" class="ws-step" data-current={file.head === -1} data-step="original" onClick={() => void jumpTo(-1)}>
            <span class="ws-step-idx mono">0</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm">{w(locale, 'original')}</span>
              <span class="block text-xs tnum" style={{ color: 'var(--muted)' }}>
                {fmtBytes(file.size)}
                {file.pages ? ` · ${file.pages} S.` : ''}
              </span>
            </span>
          </button>
        </li>
        {file.revisions.map((r, i) => (
          <li key={r.stepId}>
            <button
              type="button"
              class="ws-step"
              data-current={file.head === i}
              data-future={i > file.head}
              data-status={r.status}
              data-step={r.toolId}
              disabled={r.status === 'running'}
              onClick={() => r.status === 'ok' && void jumpTo(i)}
            >
              <span class="ws-step-idx mono">{i + 1}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm">
                  {title(r.toolId)}
                  {r.status === 'running' && <I.spinner size={12} class="ml-1 inline" />}
                  {r.status === 'error' && (
                    <span class="ml-1 text-xs" style={{ color: 'var(--warn-text)' }}>
                      {w(locale, 'error')}
                    </span>
                  )}
                </span>
                <span class="flex items-center gap-2 text-xs tnum" style={{ color: 'var(--muted)' }}>
                  {r.status === 'ok' && (r.outputSize !== undefined ? fmtBytes(r.outputSize) : w(locale, 'reportOnly'))}
                  {r.status === 'ok' && <VerifySeal locale={locale} verification={r.verification} />}
                  {!r.snapshot && r.status === 'ok' && (
                    <span title={locale === 'de' ? 'Snapshot verworfen — wird per Replay wiederhergestellt' : 'Snapshot dropped — restored via replay'} style={{ color: 'var(--faint)' }}>
                      ↻
                    </span>
                  )}
                </span>
                {r.error && (
                  <span class="block truncate text-xs" style={{ color: 'var(--warn-text)' }}>
                    {r.error}
                  </span>
                )}
              </span>
            </button>
            {r.status === 'ok' && r.outputRef && r.outputMime === 'application/pdf' && (
              <button
                type="button"
                class="btn btn-ghost btn-icon ws-step-diff"
                aria-label={w(locale, 'diff')}
                title={w(locale, 'diff')}
                data-diff={r.stepId}
                onClick={() => setUi({ diffStepId: s.diffStepId === r.stepId ? null : r.stepId })}
              >
                <I.diff size={14} />
              </button>
            )}
          </li>
        ))}
        {file.revisions.length === 0 && (
          <li class="px-3 py-2 text-xs" style={{ color: 'var(--muted)' }}>
            {w(locale, 'noSteps')}
          </li>
        )}
      </ol>
      {okSteps > 0 && (
        <footer class="ws-stack-foot">
          <button type="button" class="btn btn-ghost btn-sm" data-share-pipeline onClick={() => void share()}>
            <I.link size={13} /> {w(locale, 'sharePipeline')}
          </button>
          <button type="button" class="btn btn-ghost btn-sm" data-open-batch onClick={() => setUi({ batchOpen: true })}>
            <I.batch size={13} /> {w(locale, 'batch')}
          </button>
        </footer>
      )}
    </section>
  );
}
