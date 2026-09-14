🇬🇧 English · [🇩🇪 Deutsch](./SECURITY.de.md)

# Security Policy

## Supported versions

| Version                        | Supported                                       |
| ------------------------------ | ----------------------------------------------- |
| `main` / latest `v*` tag       | yes — security fixes land here                  |
| older tags, desktop builds     | no — please switch to the current release       |

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities.

- E-mail the operator address configured in `branding.json` under `contact.email` (or `legal.email`).
  Operators of a self-hosted instance should additionally provide a `security@<your-domain>` mailbox
  there; in the Community build this field is a placeholder and must be set before launch.
- Alternatively: private report via the repository host named in `contact.github` (Security Advisory).
- Please include: affected component (Web/CLI/API/Desktop), version or commit, reproduction steps,
  impact. Do not send real personal files as examples.

**Response times:** acknowledgement within 3 working days, initial assessment within 7 days, fix or
workaround for critical/high findings within 30 days. On request we credit reporters in the changelog
(coordinated disclosure after the fix).

## Scope

- **Web** (`apps/web`): tool workers, pipeline import, service worker, CSP/COOP/COEP, branding rendering.
- **CLI** (`apps/cli`): file access, watch, pipelines, license check.
- **API** (`apps/api`): authentication, job isolation, upload limits, headers, CORS.
- **Desktop** (`apps/desktop`): Tauri capabilities, deep link, file associations, updater.
- **Packs** (`packages/tools-*`): in particular `pdf-redact`, `pdf-sanitize`, `forensics-verify`, archives
  (zip bombs, path traversal), license (`packages/license`).

Out of scope: vulnerabilities in third-party libraries without a NeoTools-specific vector (please report
upstream; we pull in updates), self-hosted instances with modified configuration, social engineering.

## Principle: local processing

All tools process files **locally** — in the browser (WASM/workers), in Node or in the desktop app. There are
no uploads, no tracking and no CDN runtime dependency; all WASM cores and models are served same-origin
under `/assets/…`. The only outbound connections are timestamp services explicitly entered by the user
(PAdES/RFC 3161). The network sweep in `docs/SECURITY-REVIEW.md` lists all runtime sources;
`apps/web/e2e/network-whitelist.spec.ts` verifies this in CI.

## Previous reviews

The adversarial security review for wave 5 (F1–F41, PDF redact/sanitize, license, API, archives, web,
desktop) is documented in [`docs/SECURITY-REVIEW.md`](./docs/SECURITY-REVIEW.md) — including the
deliberately documented limits (e.g. glyphs without ToUnicode, clock rollback < 24 h for licenses).
