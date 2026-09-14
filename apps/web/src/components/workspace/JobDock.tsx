import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { cancelJobs, jobs } from '../../lib/workspace/store';
import { I } from './Icons';

export default function JobDock({ locale }: { locale: Locale }) {
  const active = jobs.value.filter((j) => j.status === 'running' || j.status === 'queued');
  if (!active.length) return null;
  const ratio = active.reduce((n, j) => n + j.ratio, 0) / active.length;
  const current = active.find((j) => j.status === 'running') ?? active[0]!;
  return (
    <div class="ws-jobdock nt-slide-up" role="status" aria-live="polite" data-jobdock>
      <I.spinner size={16} />
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2 text-sm">
          <strong class="truncate">{current.label}</strong>
          {current.message && <span class="truncate" style={{ color: 'var(--muted)' }}>{current.message}</span>}
          {active.length > 1 && (
            <span class="mono text-xs" style={{ color: 'var(--faint)' }}>
              +{active.length - 1}
            </span>
          )}
        </div>
        <div class="ws-progress" aria-hidden="true">
          <div style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" onClick={() => void cancelJobs()}>
        {w(locale, 'cancel')}
      </button>
    </div>
  );
}
