import type { Locale } from '../lib/i18n';
import { t } from '../lib/i18n';

interface Check {
  id: string;
  passed: boolean;
  detail?: string;
}

interface Props {
  locale: Locale;
  report: Record<string, unknown> | null;
}

export default function VerificationBlock({ locale, report }: Props) {
  const verification = report?.verification as { passed?: boolean; checks?: Check[] } | undefined;
  if (!verification || !Array.isArray(verification.checks)) return null;
  const passed = Boolean(verification.passed);
  const bg = passed ? 'color-mix(in oklab, #1b7f4e 18%, var(--card))' : 'color-mix(in oklab, #c45c26 16%, var(--card))';
  const fg = passed ? '#1b7f4e' : '#c45c26';

  return (
    <section class="rounded-lg border p-4" style={{ borderColor: fg, background: bg }}>
      <h2 class="stamp mb-2" style={{ color: fg }}>
        {t(locale, 'verification')} · {passed ? t(locale, 'verifyPass') : t(locale, 'verifyFail')}
      </h2>
      <ul class="grid gap-1 text-sm">
        {verification.checks.map((c) => (
          <li key={c.id} class="flex gap-2">
            <span class="mono" style={{ color: c.passed ? '#1b7f4e' : '#c45c26' }}>
              {c.passed ? 'OK' : 'FAIL'}
            </span>
            <span>
              {c.id}
              {c.detail ? ` — ${c.detail}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
