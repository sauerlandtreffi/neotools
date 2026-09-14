import { useEffect, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { foreignTransferBytes, formatByteCount } from '../../lib/network-bytes';
import { w } from '../../lib/workspace/i18n';
import { workspace } from '../../lib/workspace/store';

/**
 * TrustBadge (FRONTEND-REDESIGN §2.1/§4.4): "Lokal · Netz 0 B". Counts bytes
 * transferred to foreign origins via PerformanceObserver — honest, prüfbar, no
 * marketing word. Turns rust when anything left the origin.
 */
export default function TrustBadge({ locale, compact = false }: { locale: Locale; compact?: boolean }) {
  const [bytes, setBytes] = useState(0);
  const policy = workspace.value.policyLabel;

  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return;
    const origin = location.origin;
    const tally = () => {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      setBytes(foreignTransferBytes(entries, origin));
    };
    tally();
    const obs = new PerformanceObserver(() => tally());
    try {
      obs.observe({ type: 'resource', buffered: true });
    } catch {
      // older engines
    }
    return () => obs.disconnect();
  }, []);

  const foreign = bytes > 0;
  const href = locale === 'de' ? '/no-upload' : '/en/no-upload';
  return (
    <a
      href={href}
      class="ws-trust"
      data-trust
      data-foreign={foreign}
      title={locale === 'de' ? 'Bytes an fremde Server — sollte 0 bleiben' : 'Bytes sent to foreign servers — should stay 0'}
    >
      <span class="dot" aria-hidden="true" />
      <span class="ws-trust-local">{w(locale, 'local')}</span>
      <span class="ws-trust-net tnum" data-net-bytes>
        {compact ? formatByteCount(bytes, locale) : `${locale === 'de' ? 'Netz' : 'Net'} ${formatByteCount(bytes, locale)}`}
      </span>
      {policy && !compact && (
        <span class="ws-trust-policy" title={locale === 'de' ? 'Team-Richtlinie aktiv' : 'Team policy active'}>
          · {policy}
        </span>
      )}
    </a>
  );
}
