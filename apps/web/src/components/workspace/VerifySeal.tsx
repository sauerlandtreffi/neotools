import type { VerificationReport } from '@neotools/engine';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { I } from './Icons';

interface Props {
  locale: Locale;
  verification?: VerificationReport;
  /** compact: icon + label only */
  compact?: boolean;
}

/**
 * Fail-closed seal (FRONTEND-REDESIGN §2.8): green only when the verify hook
 * ran, passed and produced no warnings; otherwise amber (failed) or grey
 * (no verification at all). Never empty.
 */
export default function VerifySeal({ locale, verification, compact = true }: Props) {
  const state = !verification ? 'none' : verification.passed && !(verification.warnings?.length) ? 'ok' : 'fail';
  const color = state === 'ok' ? 'var(--ok)' : state === 'fail' ? 'var(--warn-text)' : 'var(--faint)';
  const label = state === 'ok' ? w(locale, 'verified') : state === 'fail' ? w(locale, 'verifyFailed') : w(locale, 'notVerified');
  const checks = verification?.checks ?? [];
  const detail =
    state === 'none'
      ? undefined
      : `${checks.filter((c) => c.passed).length}/${checks.length} ${w(locale, 'checks')}${
          verification?.warnings?.length ? ` · ${verification.warnings.length} ${w(locale, 'warnings')}` : ''
        }`;
  return (
    <span class="ws-seal" data-seal={state} style={{ color }} title={detail ? `${label} — ${detail}` : label}>
      {state === 'ok' ? <I.seal size={14} class="nt-seal" /> : state === 'fail' ? <I.warn size={14} /> : <I.seal size={14} style={{ opacity: 0.5 }} />}
      <span>{label}</span>
      {!compact && detail && <span style={{ color: 'var(--muted)' }}>· {detail}</span>}
    </span>
  );
}
