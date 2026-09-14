import { dismissToast, toasts } from '../../lib/workspace/store';
import { I } from './Icons';

const COLOR: Record<string, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  err: 'var(--danger, var(--warn))',
  info: 'var(--info)',
};

export default function Toasts() {
  const list = toasts.value;
  if (!list.length) return null;
  return (
    <div class="ws-toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} class="ws-toast nt-slide-up" style={{ borderColor: COLOR[t.kind] }} data-kind={t.kind}>
          <span class="ws-toast-dot" style={{ background: COLOR[t.kind] }} />
          <span class="flex-1">{t.text}</span>
          <button type="button" class="btn btn-ghost btn-icon" aria-label="OK" onClick={() => dismissToast(t.id)}>
            <I.x size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
