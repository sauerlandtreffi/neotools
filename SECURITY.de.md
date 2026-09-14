🇩🇪 Deutsch · [🇬🇧 English](./SECURITY.md)

# Sicherheitshinweise

## Unterstützte Versionen

| Version                     | Unterstützt                                   |
| --------------------------- | --------------------------------------------- |
| `main` / letztes `v*`-Tag   | ja — Sicherheitsfixes landen hier             |
| ältere Tags, Desktop-Builds | nein — bitte auf das aktuelle Release wechseln |

## Schwachstelle melden

Bitte **kein öffentliches Issue** für Sicherheitslücken.

- E-Mail an die in `branding.json` unter `contact.email` (bzw. `legal.email`) hinterlegte Adresse des
  Betreibers. Betreiber eines Self-Hosts sollten dort zusätzlich ein `security@<ihre-domain>`-Postfach
  angeben; im Community-Build ist das Feld ein Platzhalter und muss vor dem Launch gesetzt werden.
- Alternativ: private Meldung über den in `contact.github` genannten Repository-Host (Security Advisory).
- Bitte beilegen: betroffene Komponente (Web/CLI/API/Desktop), Version bzw. Commit, Reproduktion,
  Auswirkung. Keine echten personenbezogenen Dateien als Beispiel schicken.

**Reaktionszeit:** Eingangsbestätigung innerhalb von 3 Werktagen, erste Einschätzung innerhalb von
7 Tagen, Fix oder Workaround für kritische/hohe Findings innerhalb von 30 Tagen. Wir nennen Melder auf
Wunsch im Changelog (Coordinated Disclosure nach Fix).

## Scope

- **Web** (`apps/web`): Tool-Worker, Pipeline-Import, Service Worker, CSP/COOP/COEP, Branding-Rendering.
- **CLI** (`apps/cli`): Dateizugriff, Watch, Pipelines, Lizenzprüfung.
- **API** (`apps/api`): Authentifizierung, Job-Isolation, Upload-Limits, Header, CORS.
- **Desktop** (`apps/desktop`): Tauri-Capabilities, Deep-Link, Dateizuordnung, Updater.
- **Packs** (`packages/tools-*`): insbesondere `pdf-redact`, `pdf-sanitize`, `forensics-verify`, Archive
  (Zip-Bomb, Pfad-Traversal), Lizenz (`packages/license`).

Außerhalb des Scopes: Schwachstellen in Drittbibliotheken ohne NeoTools-spezifischen Vektor (bitte
upstream melden; wir ziehen Updates nach), Self-Hosts mit veränderter Konfiguration, Social Engineering.

## Grundsatz: lokale Verarbeitung

Alle Werkzeuge verarbeiten Dateien **lokal** — im Browser (WASM/Worker), in Node oder im Desktop. Es gibt
keine Uploads, kein Tracking und keine CDN-Laufzeitabhängigkeit; sämtliche WASM-Cores und Modelle werden
same-origin unter `/assets/…` ausgeliefert. Die einzigen ausgehenden Verbindungen sind ausdrücklich vom
Nutzer eingetragene Zeitstempel-Dienste (PAdES/RFC 3161). Der Netzwerk-Sweep in
`docs/SECURITY-REVIEW.md` listet alle Laufzeitquellen; `apps/web/e2e/network-whitelist.spec.ts` prüft das
in der CI.

## Bisherige Reviews

Der adversarial Security-Review zu Welle 5 (F1–F41, PDF-Redact/Sanitize, Lizenz, API, Archive, Web,
Desktop) ist in [`docs/SECURITY-REVIEW.md`](./docs/SECURITY-REVIEW.md) dokumentiert — inklusive der
bewusst dokumentierten Grenzen (z. B. Glyphen ohne ToUnicode, Uhr-Rückstellung < 24 h bei Lizenzen).
