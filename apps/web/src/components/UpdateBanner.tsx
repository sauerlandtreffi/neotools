import { useEffect, useState } from 'preact/hooks';
import { t, type Locale } from '../lib/i18n';

export default function UpdateBanner({ locale }: { locale: Locale }) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onController = () => {
      // keep silent after skip
    };
    navigator.serviceWorker.addEventListener('controllerchange', onController);
    void navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) {
        void navigator.serviceWorker.register('/sw.js');
        return;
      }
      const watch = (sw: ServiceWorker | null) => {
        if (sw && sw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(sw);
      };
      watch(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => watch(reg.waiting));
      });
      void reg.update();
    });
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onController);
  }, []);

  if (!waiting) return null;
  return (
    <div
      class="fixed bottom-4 right-4 z-40 rounded-lg border px-4 py-3 shadow-lg"
      style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
      role="status"
    >
      <p class="text-sm">{t(locale, 'newVersion')}</p>
      <button
        type="button"
        class="mt-2 rounded-md px-3 py-1 text-sm"
        style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
        onClick={() => {
          waiting.postMessage({ type: 'SKIP_WAITING' });
          location.reload();
        }}
      >
        {t(locale, 'refresh')}
      </button>
    </div>
  );
}
