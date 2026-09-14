🇩🇪 Deutsch · [🇬🇧 English](./FRONTEND-REDESIGN.md)

# NeoTools Frontend-Redesign — Workspace-Konzept

**Status:** Konzept, verbindlich für UI-Arbeit ab Welle W0  
**Stand:** 2026-09-14  
**Geltungsbereich:** `apps/web` (Astro + Preact), Anbindung an `packages/engine`, Tauri-Desktop, PWA  
**Nicht-Ziele dieser Datei:** Code-Änderungen, Bundle-Builds, Pack-Implementierung. Parallel laufende Integrationsarbeit bleibt unberührt.

Verwandt: [ARCHITECTURE.de.md](./ARCHITECTURE.de.md) · [ROADMAP.de.md](./ROADMAP.de.md) · [BACKLOG.de.md](./BACKLOG.de.md)

---

## 0. Auftrag in einem Satz

Ein Dokument öffnen und **in einem Tab** nacheinander komprimieren, Seiten ordnen, schwärzen, sanitizen, OCR, signieren, exportieren — ohne Tool-Seiten-Wechsel, ohne erneutes Öffnen, mit Undo/Redo und sichtbarem Schrittstapel. Analog Bild, Audio/Video, Office.

Das ist kein Skin über die heutige Werkstatt-Galerie. Es ist ein zweites, dokumentzentriertes Produkt auf derselben Engine.

---

## 1. IST-Analyse

### 1.1 Was heute wirklich existiert

Die Architektur-Skizze (`ARCHITECTURE.md` §9) spricht von `/tools/<id>`. **Im Code liegen Tool-Seiten auf `/{id}` und `/en/{id}`** (`pages/[toolId].astro`). Canonical, Sitemap, PWA-Shortcuts, Compare-Links und Playwright-Smokes nutzen diese Pfade. Das Redesign darf sie nicht umbiegen.

| Fläche | Route (de / en) | Rolle | Interaktive Insel |
|---|---|---|---|
| Marketing + Werkstatt-Grid | `/`, `/en` | SEO-Einstieg, Pack-Teaser, ~186 sichtbare Tool-Karten | `HomeSearch` |
| Tool-Lauf | `/{id}`, `/en/{id}` | Eine Aufgabe, ein Formular, ein Download | `ToolApp` |
| PDF-Anzeige | `/reader` | pdf.js, Thumbs, Suche, Formulare, Annotationen | `Reader` |
| Mehrschritt | `/pipeline` | Schritte wählen, MIME-Check, Hash `#p=` | `PipelineBuilder` |
| Lokale Läufe | `/verlauf` / `/en/history` | IDB-Metadaten + OPFS-Blobs, Re-Download, Re-Run | `HistoryApp` |
| PWA/Share-Eingang | `/open` | MIME → Tool-Liste; PDF → Reader-Handoff | `OpenApp`, `ReaderLaunch` |
| Ordner-Automatik | `/watch` | Lizenz-Gate, Directory-Picker, Regeln | `WatchApp` |
| SEO-Korpus | `/formats/*`, `/convert/*`, `/spec/*`, `/guides/*`, `/vergleich/*` | Statisch, prerendered, hreflang | kaum Interaktion |
| Recht/Meta | `/impressum`, `/datenschutz`, `/lizenzen`, `/no-upload`, `/offline`, `/preise`, `/ueber` | Vertrauen, Compliance | Theme, Lizenz-Footer |

Globales Chrom: `layouts/Base.astro` — Header, Footer, `CommandPalette` (⌘K, **Seitensuche**), `ShortcutHelp` (`?`), `UpdateBanner`, `DesktopEvents`, Theme-Init, Service-Worker-Register. `main` ist `max-w-6xl`, außer Reader (`wide`).

**Kein `/app`, kein `/workspace`, kein dokumentweites Undo, kein warmer Worker-Pool.**

### 1.2 Informationsarchitektur (heute)

```
Landing / ⌘K / Suche
        │
        ├─► /{toolId}  ── Drop ── ZodForm ── [Ausführen] ── Download
        │         │                              │
        │         │                              ├─► /reader   (Handoff, nur PDF)
        │         │                              └─► /pipeline (1-Schritt-Hash)
        │         └─ ui.editor: redact | image-boxes | media-trim | doc-preview | transcript
        │
        ├─► /reader ── Werkzeug-Button ── location.assign(/{toolId}?from=reader)
        │                                    (Bytes via IndexedDB-Handoff, 1 Datei)
        ├─► /pipeline ── Dateien erneut wählen ── runPipeline
        ├─► /verlauf ── Re-Run ── zurück auf /{toolId}?rerun=
        └─► /open ── PDF→Reader, sonst Linkliste passender Tools
```

Das mentale Modell der UI ist **Werkzeug zuerst**. Die Datei ist Verbrauchsmaterial eines Laufs. Genau das Gegenteil der Nutzeranforderung.

### 1.3 Navigationswege und Zustandsverlust

| Weg | Was passiert | Was verloren geht |
|---|---|---|
| Karte „PDFs zusammenführen“ | Vollladung `/{id}`, leere DropZone | nichts (kein Dokument da) |
| Reader → `pdf-redact` | `putHandoff` + `location.assign` | Reader-Zoom, Seite, Suche, ungespeicherte Annotationen nur wenn vorher persistiert; **kein Rückweg als Session** |
| Redact-Ergebnis → Reader | `putHandoffResult` + `?result=1` | Markierungs-Undo, Optionszustand |
| Tool → „Als Pipeline speichern“ | Hash mit **einem** Schritt | Dateien nicht in der URL (richtig), aber auch nicht in einer Session |
| Verlauf → Re-Run | Options + optional Inputs aus OPFS | andere Dateien der Sitzung, Zwischenstände, Selektion |
| Pipeline-Bibliothek | Preset lädt Schritte | Dateien müssen neu gewählt werden |
| ⌘K | Navigation auf eine **andere URL** | gesamter Insel-State |

`ToolApp` hält Dateien als `WorkerFile[]` (`name`, `mime`, `data: Uint8Array`) im Preact-`useState`. Jeder Lauf macht `createToolWorker()` — **neuer Worker, kein Pool**, danach oft `terminate()`. Große Dateien liegen vollständig im RAM der Seite **und** werden erneut in den Worker transferiert.

„Undo“ auf der Tool-Seite heißt `setPhase('input')` — zurück zum Formular, **nicht** Schritt zurück im Dokument.

### 1.4 Reibungspunkte (nach Zielgruppe)

**Kanzlei / Steuerberater / Behörde**

- Akte: mergen → Bates → schwärzen → sanitizen → beA-Check → exportieren sind **fünf Seiten**, fünf Uploads oder Handoffs.
- Team-Presets (`applyTeamPresets`, `lockedKeys`, `requiredPipelines`) greifen, sind aber unsichtbar im Alltag: Schloss-Icon im Zod-Formular, sonst nichts.
- Verifikation ist eine Checkliste **nach** dem Lauf (`VerificationBlock`), nicht ein Siegel am Dokument.
- Reports als rohes `JSON.stringify` — für Sachbearbeitung unbrauchbar.
- Kein „diese Datei ist share-safe“ am Export, nur ein Banner-ähnlicher Block auf der Ergebnisphase.

**Creator / Privat**

- Bild: Crop auf `/image-crop`, Metadaten auf `/image-metadata`, Export-Pack woanders — Canvas geht verloren.
- Media: `MediaTrimEditor` ist ein `<video controls>` plus Zahlenfelder, keine Waveform, kein Scrub der In/Out-Marke auf der Timeline.
- „Make it fit“ ist im i18n-Dict explizit als später markiert (`makeFitLater`).
- Homepage-Grid mit 180+ Karten ist ein Katalog, kein Arbeitsplatz.

**Alle**

- Re-Parse: jedes Tool lädt Bytes neu; pdf.js im Reader **und** im RedactEditor **und** im Worker.
- Optionen als langes Zod-Formular **über** der Vorschau, nicht daneben.
- Mobile: Header mit 9+ Links bricht in Wrapping; Reader-Sidebar fest `14rem`; DropZone-Padding groß, Aktionsdichte klein.
- Datei > 500 MB: Warntext, kein Streaming-Pfad in der UI (OPFS-Schwelle aus der Architektur ist in `ToolApp` nicht verdrahtet).

### 1.5 Design-System-Stand

| Thema | Ist | Lücke |
|---|---|---|
| Tokens | `@theme` + `:root` / `:root.dark`: `--bg --fg --muted --card --line --accent --accent-fg`; Markenfarben `--brand-*` aus `branding.json` | keine Spacing-/Radius-/Motion-Skala, kein Semantik-Token für OK/Warn/Lock/Netz |
| Typo | `--font-sans` = **Iowan Old Style / Palatino** (Serife); Mono = IBM Plex / Cascadia | Serife trägt Fließtext gut, UI-Chrome (Tabellen, dichte Toolbars) schlecht; keine UI-Sans, keine Tabular-Nums |
| Farbe | Papier `#f3efe4`, Tinte `#10221c`, Mint, Rost | Charakterstark, aber „editorial brochure“, nicht „Arbeitsfläche“; Rost doppelt als Warnung und Akzent-Konflikt |
| Dark Mode | Klasse `dark` am `<html>`, `localStorage['neotools-theme']`, Inline-Init | `ThemeToggle` ist ein Textbutton „Darstellung“; kein `prefers-color-scheme` nach erster Wahl; Reader-Seiten invertieren per CSS-Filter |
| Komponenten | Ad-hoc Tailwind in Inseln; Reader hat eigenes `Reader.css` | keine AppShell, kein Toast-System, kein Drawer-Primitive, keine gemeinsame Toolbar |
| a11y | `focus-visible` 2px Accent; `.sr-only`; Dialog-Rollen an Palette/Shortcuts | keine Skip-Links; Palette ohne Pfeiltasten/aria-activedescendant; Progress ohne `aria-live`; Reader-Canvas ohne Seitenansage; BITV-Kontrast der Serife auf Mint ungemessen |
| Mobile | `viewport` gesetzt; Grids `sm:`/`md:` | Reader nicht viewport-gebrochen; Touch-Targets 32–36px; kein Bottom-Sheet |
| Motion | Hover `-translate-y-0.5` auf Karten | kein `prefers-reduced-motion`; keine definierten Dauern |

**Privacy-Chrome heute:** Header-Stamp „Lokal · kein Upload · kein Tracking“; `NetworkStatus` zählt **fremde** Resource-Transfers (PerformanceObserver), Link nach `/no-upload`. Das ist ehrlich — und zu klein, um als Produktversprechen zu tragen. Es sitzt nur **in** `ToolApp`, nicht global.

### 1.6 Ladezeit und Bundle

| Mechanik | Ist | Wirkung |
|---|---|---|
| Seitenmodell | Astro `output: 'static'`, Inseln `client:load` / `client:idle` | SEO-Seiten schnell; jede Tool-Seite hydriert `ToolApp` + Zod + DropZone |
| Registry im Bundler | `lib/registry.ts` registriert **alle** Packs zur Build-Zeit (Sitemap, Felder, FAQ) | `astro build` braucht `max-old-space-size=7168`; Tool-Seite selbst führt `run()` nicht im Main-Thread |
| Worker | `new Worker(tool-worker.ts)` **pro Lauf** | Kaltstart: Pack-`import()`, pdf.js-`loadPdfjs()` schon beim Worker-Boot; ffmpeg/ONNX/Tesseract erst bei Pack |
| WASM/Modelle | `/assets/*`, Cache Storage geplant, Confirm-Dialog `ModelConfirm` | gut; kein warmer Pool, kein Prefetch anhand Dateityp |
| Datei-I/O | `file.arrayBuffer()` sofort beim Drop | 200-MB-PDF = 200 MB im React-State + Kopie im Worker |
| History | Meta IndexedDB, Blobs OPFS (Fallback IDB), Default 200 MB / 24 h | gut als Rohbau für Session-Bin; heute **pro Job**, nicht pro Dokument-Session |
| Lazy UI-Editoren | `ui.editor` schaltet Redact/Image/Media/Doc/Transcript | Vorbild für Workspace-Modi; an Tool-ID gekoppelt, nicht an MIME |

`createToolWorker` ist **kein** Pool, obwohl `ARCHITECTURE.md` §3.1 einen Pool (2–4, Comlink, Cancel, OPFS-Pfad) festlegt. Die UI muss den Pool fordern; die Engine muss ihn liefern.

### 1.7 Was schon Workspace-nah ist (nicht wegwerfen)

- `Reader`: Shell, Thumb-Rail, Outline, Suche, Zoom, Tastatur, Desktop-Save, Dirty-Flag — **PDF-Canvas v0**.
- `RedactEditor`: Seiten-Thumbs, Canvas-Overlay, Mark-Undo, Auto-Hits, `previewRedact` im Worker — **erster echter Editor**.
- `PipelineSpec` + `validatePipeline` + `#p=` + Bibliotheks-Presets — **Schrittstapel-Datenmodell**.
- `runTool` + `verify` + `attachVerification` + `privacySensitive` — **Vertrauensanzeige**.
- `applyTeamPresets` / `locked` / `hiddenTools` / `requiredPipelines` — **Branding/Locks**.
- `HistoryStore` + OPFS — **Persistenzkern**.
- `inputs.accept` + `outputs.mime` + `whenMime` — **Kontextfilter roh**.
- `ui.editor` — **Hook, welcher Canvas-Typ**.
- Handoff, PWA `file_handlers`, Tauri `read_opened_file` / `neotools://` — **Datei rein, ohne Upload**.

Der Sprung ist: diese Teile **nicht** als getrennte Seiten orchestrieren, sondern als **eine Session um ein Dokument**.

---

## 2. Ziel-Konzept „Workspace“

### 2.1 Produktprinzipien (nicht verhandelbar)

1. **Dokument zuerst.** Die Datei bleibt sichtbar, während Werkzeuge an ihr arbeiten.
2. **Ein Tab, ein Stapel.** Jede Operation ist ein Pipeline-Schritt auf dem aktuellen Dokument (oder einer Selektion), nicht eine neue Seite.
3. **Nichts verlässt das Gerät.** Privacy ist Chrom, nicht Fußnote: Lokal-Indikator, Netz-Null, Verify-Siegel.
4. **SEO-Seiten bleiben Landungen.** `/{id}` erklärt, überzeugt, nimmt die Datei entgegen — und **öffnet den Workspace** mit vorgewähltem Werkzeug.
5. **Dieselbe Engine.** Kein zweites `run()`. UI mappt auf `defineTool` / `PipelineSpec` / `verify` / Presets.

### 2.2 Route und Name

| Öffentlich | Intern | Zweck |
|---|---|---|
| `/app` | Preact-SPA-Insel, `client:only` | Kanonische Arbeitsfläche |
| `/en/app` | gleiche Insel | Locale |
| `/workspace`, `/en/workspace` | **301/Alias** auf `/app` | merkbare URL, Docs, Desktop |
| Deep-Link | `/app?tool=pdf-redact&pages=1-3` | SEO-CTA, PWA-Shortcut, `neotools://app?tool=` |

`start_url` der PWA bleibt `/` (Marketing/SEO). Datei-Handler und Share-Target zeigen auf **`/app`** (heute `/open`). Desktop-Dateizuordnung `.pdf` öffnet `/app` mit der Datei, nicht nur den Reader-Modus.

Begründung `/app` statt nur `/workspace`: kurz, sprachneutral, taugt als PWA-Scope-Trennung (`/app` vs. restliche statische Site). Alias `/workspace` für Menschen und DACH-Copy.

### 2.3 Informationsarchitektur (Ziel)

```
Marketing / SEO / ⌘K-Seiten          Arbeitsfläche (kein SEO-Index)
───────────────────────────          ────────────────────────────
/  /formats  /convert  /guides       /app  = Session
/{pdf-redact}  (Landing)  ────────►    FileTray │ DocCanvas │ StepStack
/pipeline (Redirect/Embed) ───────►    ActionBar + ⌘K (Aktionen, nicht Seiten)
/reader   (Redirect/Embed) ───────►    OptionsPanel | Diff | ExportDrawer
/verlauf  = Session-Liste  ───────►    reopen sessionId
/open     301 → /app
```

Zwei Welten, eine Engine. Die Grenze ist bewusst: **prerendered Vertrauen** vs. **hydrierte Arbeit**.

### 2.4 Hauptansicht — Desktop

```
+------------------------------------------------------------------------------+
| [NT] NeoTools          ● LOKAL  ○ Netz 0 B     Akte Müller  v   [DE|EN] [☽] |
|  Dateien  Schritte  Verlauf          Suche in Datei…              ⌘K  Export |
+----------+-----------------------------------------------+-------------------+
| FILETRAY |  TOOLCHROME                                    | SCHRITTSTAPEL    |
| Session  |  PDF · 12 S. · 3,1 MB · nicht share-safe       | 1 compress  ✓    |
|          |  [Kompr][Ordnen][Schwärzen][Sanitizen][OCR]…   | 2 reorder   ✓    |
| v Antrag |                                                | 3 redact    ●    |
|   s.1-12 |  +--------+  +---------------------------+     | 4 sanitize  ·    |
|   ●s.3   |  |  1     |  |                           |     |                  |
|   s.4    |  | [thumb]|  |      DOKUMENT-CANVAS      |     | Undo  Redo       |
|          |  |  2     |  |      Seite 3 / 12         |     | Als Pipeline     |
| v Foto   |  |  3 ### |  |      [Schwärzung live]    |     |                  |
|   img    |  |  4     |  |                           |     | OPTIONEN         |
|          |  +--------+  +---------------------------+     | Muster ☑ IBAN    |
| + Datei  |                                                | ☑ Steuer-ID      |
|          |  FUNDE: 3 IBAN · 1 JS · 2 Anhänge   [Bereinigen]| Stärke  ████░    |
+----------+-----------------------------------------------+-------------------+
| Fortschritt: Schwärzen  ████████░░  72%   verifizieren…           [Abbrechen]|
+------------------------------------------------------------------------------+
```

`###` = aktive Seite. Funde-Leiste erscheint nach Auto-Analyse, nicht als Modal.

### 2.5 Hauptansicht — Mobile (≤ 768 px)

```
+---------------------------+
| ● LOKAL  Antrag.pdf   ☰   |
+---------------------------+
| [ <1  2  3● 4  5> ] thumbs|
|                           |
|      CANVAS / PLAYER      |
|                           |
+---------------------------+
| 3 IBAN  [Jetzt]           |
+---------------------------+
| (Kompr) (Rot) (Schwärz) → |   horizontale ActionBar
+---------------------------+
| [Dateien] [Schritte 3] [↓]|   Bottom-Nav: Tray | Stack | Export
+---------------------------+
```

Optionen und Schrittstapel sind **Sheets** (Höhe 50–90 %), nicht dauerhafte Spalten. Command-Palette = Vollbild-Suche. Drop auf das Fenster bleibt global.

### 2.6 Dateiablage (Session-Bin)

**Session** = eine lokale Arbeitseinheit (Standardname aus erster Datei + Datum). Mehrere Dateien, gemischte Typen.

| Schicht | Inhalt | Wo |
|---|---|---|
| Memory | Aktives Dokument-Handle, Thumb-Bitmaps, Selektion | Main + Worker |
| OPFS `/sessions/{id}/files/{fileId}` | Bytes, Zwischenstände, Undo-Snapshots | Quota-Warnung ab 80 % |
| IndexedDB `neotools-sessions` | Metadaten, Schritte, Funde, UI-Cursor | dauerhaft bis Nutzer löscht |
| History (bestehend) | Abgeschlossene Exporte / Jobs, Journal ohne PII | `/verlauf` listet Sessions **und** Alt-Jobs |

Regeln:

- Drop / Paste / File-Picker / PWA / Share / Tauri-Open **hängen an die offene Session**, ersetzen sie nicht still.
- PDF-Merge ist eine Aktion **auf mehreren Tray-Einträgen**, nicht ein Sonder-Upload.
- Schließen des Tabs: Session bleibt (OPFS). Banner beim nächsten `/app`: „Akte Müller · vor 12 min“.
- „Alles löschen“ wie im Verlauf: zwei Bestätigungen, dann OPFS+IDB der Session.
- Team-Preset `keepInputs: false` analog History-Settings: nach Export nur Output + Manifest.

Anbindung Ist: `HistoryStore` erweitern oder daneben `SessionStore` mit gleichem Blob-Backend (`opfsBlobStore` / `idbBlobStore`). Nicht zwei Quota-Welten.

### 2.7 Dokument-Canvas (vier Familien)

Die Familie folgt MIME → `workspaceFamily` (Engine-Feld, Fallback-Heuristik). Ein Canvas-Host, vier Adapter:

| Familie | Adapter | Kernflächen | Erste Tools |
|---|---|---|---|
| `pdf` | pdf.js + Overlay | Seiten, Text-Layer (unsichtbar für Suche), Boxen, Thumbs | compress, reorder, rotate, redact, sanitize, ocr, sign, lock, watermark, forms, pdf-a |
| `image` | Canvas 2D / WebGL lazy | Zoom, Boxen, Pipette, Vorher/Nachher-Wischer | crop, resize, compress, metadata, redact, doc-repair |
| `media` | `<video>`/`<audio>` + Waveform (WebAudio peaks, off-thread) | Timeline, In/Out, optionales Videocrop | convert, trim, fit, extract, normalize |
| `office` | HTML-Vorschau (mammoth / Sheet-Grid read-only) + PDF-Fallback | Struktur, keine Office-WYSIWYG-Lüge | metadata, to-pdf, sanitize-ish, erechnung |

Mehrere Dateien: Tray wählt den **Fokus**. Split-View nur für `pdf-compare` / `forensics-bytes-compare` (zwei Handles, ein Stapel „compare“).

### 2.8 Aktionsleiste und Command-Palette

Zwei Ebenen, eine Quelle: **Tool-Registry**.

**ActionBar** (sichtbar, 6–10 primäre Aktionen + Overflow „Mehr“):

- Filter: `inputs.accept` ∩ Fokus-MIME, nicht `hiddenTools`, Pack geladen oder lazy erlaubt.
- Rank: `tool.workspace?.priority` sonst Heuristik (PDF: compress, reorder, redact, sanitize, ocr, export).
- Disabled + Tooltip wenn Selektion fehlt (`requires: ['pages']` und nichts gewählt).
- Locks aus `getAppliedPresets().locked` als Schloss, nicht versteckt.

**Command-Palette (⌘K) im Workspace** — **kein Seitenwechsel**:

```
> schw
  Schwärzen                    pdf-redact      auf Selektion / Funde
  Schwärzungsmuster IBAN       preset
  Share-safe prüfen            forensics-share-safe
── Navigation (zweite Gruppe, Enter = verlassen) ──
  Hilfe Schwärzen              /guides/…
```

Gruppen: *Auf diesem Dokument* · *Auf Selektion* · *Pipeline* · *Session* · *Seiten (SEO)*. Erste drei führen `enqueueStep`. Letzte darf navigieren.

Die heutige globale Palette in `Base.astro` bleibt auf Marketing/SEO-Seiten. Im `/app` ersetzt die Workspace-Palette sie (eine Instanz, zwei Modi).

### 2.9 Nicht-destruktiver Schrittstapel

Jeder angewandte Befehl:

```
SessionFile.revision[n] = {
  stepId,
  toolId,
  options,          // Zod-parsed, Presets gemerged
  selection,        // pages | region | timeRange | fileIds
  inputHash,
  outputHash,       // nach Lauf
  outputRef,        // OPFS
  verification?,    // verify-Hook
  provenance,       // createProvenance
}
```

- **Anzeigen** ist immer `revision[head]`.
- **Undo/Redo** bewegt `head`; Bytes kommen aus Snapshot, nicht aus invertierter Op (zu riskant bei Lossy).
- Snapshot-Strategie: nach jedem Schritt Output in OPFS; optional **delta** später (Welle 3+). PDF < 32 MB: voller Snapshot akzeptabel.
- „Als Pipeline speichern“ serialisiert `steps[]` **ohne** Bytes → bestehendes `encodePipelineHash` / `.neopipeline.json`.
- Team `requiredPipelines` werden **angehängt, nicht heimlich vorgelagert**: sichtbare graue Pflichtschritte („Richtlinie: sanitize vor Versand“).

Das ist `PipelineSpec` plus Session-Bindung. `runPipeline` bleibt der Executor; die UI darf Zwischenschritte einzeln rufen (`runTool`), um Live-Vorschau zu halten.

### 2.10 Inline-Optionen

`ZodForm` wandert in `OptionsPanel` (Desktop rechts unter dem Stapel, Mobile Sheet).

Regeln:

- Felder, die die Selektion **sind** (`pages`, `regions`, `startSec`) werden **nicht** als leere Arrays angezeigt — sie kommen vom Canvas.
- `locked` Keys: read-only + Richtlinie-Quelle (`organization`).
- Preset-Chips oben (schon in `ToolApp`).
- Destructive Tools (`privacySensitive` oder `workspace.destructive`): Panel-Kopf in Rost, Verify-Hinweis **vor** Run.
- Live-Felder (`quality`, `dpi`, `crf`, `targetBytes`): Debounce 200 ms → `preview()` wenn Engine es kann, sonst Größen-Schätzung.

### 2.11 Live-Vorschau / Diff

| Modus | Wann | Darstellung |
|---|---|---|
| Overlay | Redact, Crop, Watermark | auf aktuellem Canvas, noch nicht committed |
| Wipe | Compress, Repair, Sanitize-Raster | Slider Vorher/Nachher derselben Seite |
| Report | Sanitize, forensics, beA, PDF/A | strukturierte Liste, kein Roh-JSON als primär |
| Verify | nach privacy-sensitivem Commit | Fundstelle × Status, Siegel |
| Waveform-Diff | Audio normalize / trim | Peak vorher/nachher |

`verify` bleibt fail-closed (`run-tool.ts`). UI darf **kein** grünes Siegel zeigen, wenn `sharedSafe !== true` oder `warnings.length > 0` (wie `VerificationBlock` heute).

### 2.12 Export-Drawer

Nicht „Download-Button unter einer Dateiliste“, sondern ein Drawer mit Pflichtfragen:

1. Was: aktueller Head / gewählte Dateien / ganzer Tray  
2. Format: Original-MIME · PDF · ZIP-Bundle  
3. Dateiname: Token `{name}-{date}-{step}` , Team-Default  
4. Beilegen: Provenance-JSON ja/nein (Preset darf erzwingen)  
5. **Share-safe-Check**: letzter Verify + optionales `forensics-share-safe`  
6. Ziel: Download · File-Picker (Desktop) · „in Session legen“ (kein Download)

Download vor bestandener Verify: möglich, Banner **im Drawer**, nicht still.

### 2.13 Batch

Gleicher `PipelineSpec` auf N Tray-Dateien derselben Familie.

- UI: Tray-Mehrfachauswahl → „Stapel anwenden“.
- Executor: bestehendes `mapFiles` (ein Fehler killt nicht alle).
- Fortschritt: Datei i/N + Schritt k/m, abbrechbar pro Datei.
- Ergebnis: Protokoll-Tabelle (heute `report.batch`) + optionales ZIP.

50 Dateien: Worker-Pool (2–4), nicht 50 Worker.

### 2.14 Mapping auf die bestehende Engine

| UI | Engine heute | Erweiterung |
|---|---|---|
| ActionBar / ⌘K-Aktionen | `listTools()`, `inputs.accept`, `title` | `workspace`-Metadaten, `outputs.mime` Pflicht |
| Schrittstapel | `PipelineSpec.steps`, `validatePipeline`, `whenMime` | `selection` am Schritt; Session-Bindung |
| OptionsPanel | `zodObjectFields` + `ZodForm` + `lockedKeys` | Selection-Felder aus Schema ausblenden |
| Verify-Siegel | `tool.verify`, `privacySensitive`, `attachVerification` | UI-States `idle \| running \| passed \| failed \| advisory` |
| Branding / Locks | `applyTeamPresets`, `branding.json`, `hiddenTools` | sichtbare Policy-Leiste |
| Provenance | `createProvenance`, Manifest am Report | Export-Drawer-Toggle |
| Handoff / Open / Desktop | IDB + Tauri invoke | schreiben in SessionStore, nicht in Einweg-Slot |
| History | `HistoryStore.save` nach Job | Session als übergeordnete Entität; Job = Export oder Einzelschritt-Audit |

`defineTool` bleibt die einzige Quelle für Namen, FAQ, Lizenzen, Presets. Die Workspace-UI **generiert** sich daraus, sie hardcodet keine 180 Buttons.

### 2.15 Nötige Engine-Erweiterungen

Bestehende Felder nicht umbenennen (`inputs.accept` bleibt). Ergänzen:

#### A. Deklarierte I/O-Familie und Workspace-Hints

```ts
/** Ergänzung an ToolDefinition — alle Felder optional für Rückwärtskompatibilität */
export type WorkspaceFamily = 'pdf' | 'image' | 'media' | 'office' | 'archive' | 'data';

export type SelectionKind = 'pages' | 'region' | 'timeRange' | 'fileIds' | 'textQuery';

export interface ToolWorkspaceMeta {
  family: WorkspaceFamily | readonly WorkspaceFamily[];
  /** ActionBar-Rang, kleiner = weiter vorn */
  priority?: number;
  /** Gruppierung in ⌘K und Overflow */
  verb?: 'transform' | 'inspect' | 'protect' | 'export' | 'compare';
  requires?: readonly SelectionKind[];
  destructive?: boolean;
  /** Kann ohne vollen Encode eine Vorschau liefern */
  previewable?: boolean;
}

// ToolDefinition +=
workspace?: ToolWorkspaceMeta;
/** Pflicht machen in Welle W1, heute oft schon gesetzt */
outputs: ToolOutputs;
```

#### B. Standard-Selektion (Zod-Bausteine)

Viele Tools erfinden `regions`, `order`, `startSec` parallel. Die Engine liefert Schemata, Tools **extend**en sie:

```ts
import { z } from 'zod';

export const pagesSchema = z.object({
  /** 1-basiert, inklusiv; leer = alle */
  pages: z.array(z.number().int().positive()).optional(),
});

export const regionSchema = z.object({
  regions: z
    .array(
      z.object({
        page: z.number().int().positive().optional(), // PDF
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
        unit: z.enum(['pdf', 'px', 'norm']).default('norm'),
      }),
    )
    .optional(),
});

export const timeRangeSchema = z.object({
  startSec: z.number().nonnegative().optional(),
  endSec: z.number().nonnegative().optional(),
});

export const fileIdsSchema = z.object({
  fileIds: z.array(z.string()).optional(),
  order: z.array(z.string()).optional(),
});
```

`RedactEditor.regions`, `ImageBoxEditor.boxesJson`, `MediaTrimEditor.startSec` konvergieren darauf. UI schreibt **nur diese Keys**.

#### C. Dokument-Handle (kein Re-Parse pro Schritt)

```ts
export interface DocumentHandle {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** OPFS-Pfad oder Transferable */
  source: { kind: 'opfs'; path: string } | { kind: 'bytes'; bytes: Uint8Array };
  /** Pack-private, nie strukturiert über die UI */
  parsed?: unknown;
  generation: number;
}

export interface ToolContext /* += */ {
  document?: DocumentHandle;
  /** Folge-Schritt darf parsed wiederverwenden, wenn generation passt */
}

export async function mutateHandle(
  ctx: ToolContext,
  handle: DocumentHandle,
  tool: ToolDefinition,
  options: unknown,
): Promise<DocumentHandle>;
```

Regel: `verify` sieht weiter **frisch geladene** Bytes (`reloadOutputs`) — das bleibt. Nur `run` darf den Cache nutzen. pdf-lib-`PDFDocument`, decoded ImageBitmap, FFmpeg-OPFS-Datei sind Kandidaten für `parsed`.

#### D. Inkrementelle Vorschau

```ts
export interface PreviewRequest {
  toolId: string;
  options: unknown;
  selection?: unknown;
  /** z. B. nur Seite 3, 72 dpi */
  window: { page?: number; width?: number; startSec?: number; durationSec?: number };
}

export interface PreviewFrame {
  mime: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  data: Uint8Array;
  note?: Localized;
}

// optional am Tool
preview?(ctx: ToolContext, files: NeoFile[], req: PreviewRequest): Promise<PreviewFrame[]>;
```

Ohne `preview`: UI zeigt Skeleton + letzten Commit. `previewRedact` im Worker ist der erste zu generalisierende Fall.

#### E. Worker-Pool mit warmem WASM

Ist: ein Worker pro Klick. Soll (wie Architektur):

- Pool-Größe `min(4, hardwareConcurrency)`, harte Obergrenze wegen WASM-Speicher.
- Packs bleiben lazy, aber **nach erstem PDF-Drop** `ensurePack('pdf')` + `loadPdfjs()` warm.
- Job-Queue: `run` / `runPipeline` / `preview` / `analyze`.
- Cancel: `AbortController`, bei Hänger `terminate` + Respawn **eines** Slots.
- Transfer: `ArrayBuffer` unter 64 MiB; darüber nur OPFS-Pfad (Platform hat `readOpfs`/`writeOpfs` in der Architektur — im Ist-`Platform` noch schmal, **hier nachziehen**).

#### F. Analyse-Hook (Wow-Moment 1)

```ts
export interface Finding {
  id: string;
  kind: string; // 'iban' | 'js' | 'attachment' | 'exif-gps' | …
  severity: 'info' | 'warn' | 'high';
  label: Localized;
  selection?: unknown;
  suggestedToolId?: string;
  suggestedOptions?: unknown;
}

// Pack-lokal, nicht jedes Tool
analyze?(ctx: ToolContext, file: NeoFile): Promise<Finding[]>;
```

PDF-Pack: dünner Lauf über `forensics-identify` + Redact-`previewRedactHits` + Sanitize-Scan, **ohne** Encode. Timeout 2 s, abbrechen ohne Drama.

---

## 3. Beziehung zu bestehenden Seiten

### 3.1 SEO-Tool-Seiten `/{id}` (nicht `/tools/{id}`)

**Bleiben.** Title, Description, FAQ, Guides, Format-Links, JSON-LD unverändert. `noindex` nie auf diesen URLs.

Neuer Vertrag der Insel:

1. Nutzer lässt Datei fallen (bestehende `DropZone`).
2. Bytes → SessionStore (OPFS) + `sessionId`.
3. `location.assign('/app?tool={id}&session={sessionId}')` **oder** `history.pushState` + Client-Router der App, wenn die Insel schon `/app` vorlädt.
4. Workspace öffnet mit Fokus-Datei und `enqueue` **nicht automatisch** (nur Tool vorgewählt, OptionsPanel offen). Ausnahme: Nutzer klickt „Jetzt ausführen“ auf der Landing — dann ein Schritt, Ergebnis im Workspace.

Deep-Links `/{id}?preset=&o=` bleiben; Workspace liest dieselben Query-Keys (`readToolQuery`).

**Kein** Soft-404, kein Canonical auf `/app`. `/app` ist `noindex`.

### 3.2 `/reader`

Geht in den PDF-Canvas des Workspace auf.

| Phase | Verhalten |
|---|---|
| W1 | `/reader` bleibt, teilt Canvas-Komponenten mit `/app` |
| W2 | `/reader?…` 302/Client-Redirect → `/app?family=pdf` + Session aus Handoff |
| Danach | Bookmark `/reader` dauerhaft umleiten, `hreflang` entfernen, aus Header-Nav nehmen |

Reader-only Features (Highlight, Notiz, Drucken, Invert) werden **Ansichts-Modus** „Lesen“ in der ActionBar, nicht ein zweites Produkt. Desktop-Menü „Öffnen“ zielt auf `/app`.

### 3.3 `/pipeline`

Der Builder **ist** der Schrittstapel plus ein leerer Canvas.

| Phase | Verhalten |
|---|---|
| W1–W2 | `/pipeline` bleibt; „Im Workspace öffnen“ wenn Dateien da |
| W3 | Hash `#p=` wird von `/app` verstanden (`decodePipelineHash`) |
| W4 | `/pipeline` rendert dieselbe Preact-App im Modus `stack`, oder 301 → `/app?mode=pipeline` |

URL-Hash-Teilen ohne Server bleibt. Bibliotheks-Presets (`PIPELINE_LIBRARY`) werden Workspace-Templates.

### 3.4 `/verlauf`

Wird **Session-Liste** plus Alt-Journal.

- Zeile = Session (Dateien-Namen, letzter Schritt, Datum) oder Legacy-Job (`toolId` + outputs).
- Klick: `/app?session=`.
- Journal-Export (JSONL/CSV ohne Bytes) bleibt — Compliance-Wert für Behörden.
- TTL/Quota-UI bleibt, gilt für Sessions.

### 3.5 `/open`, PWA, Share

`/open` wird dünner Einstieg: POST-Share speichert in Session, Redirect `/app`. `file_handlers.action` auf `/app` ändern, alte `/open`-URL als Redirect behalten (installierte PWAs).

### 3.6 `/watch`

Bleibt eigene Seite (Lizenz-Gate, Ordner-Rechte). Ergebnisse landen in Session-Bin und erscheinen im Verlauf. Kein Zwang, Watch in die Canvas-Chrome zu quetschen.

### 3.7 Header-Navigation

Heute: Formate, Verlauf, Reader, Pipeline, Watch, Lizenz, Lizenzen — zu viel für eine Zeile.

Ziel:

- Marketing-Header: Start, Formate, Vergleich, Preise, ⌘K, Locale, Theme, **Öffnen** (`/app`).
- App-Header: Session-Name, Lokal-Badge, Netz-Null, Locale, Theme, Export. Keine SEO-Links.
- Watch/Lizenz unter Overflow oder Footer.

### 3.8 Migrationspfad ohne SEO-Verlust

1. Alle `/{id}` weiter prerendern; interne Links unverändert.  
2. `ToolApp` schrittweise: gleicher Drop, neues Ziel `/app`. Fallback: alter Runner bleibt hinter `?legacy=1` eine Welle.  
3. Playwright-Smokes umbiegen: Upload auf Landing **oder** direkt `/app`, Assert auf Download im Drawer — erst wenn W2-DoD steht. Bis dahin alte Selektoren grün halten.  
4. Sitemap: `/app` rausfiltern (wie `/offline`).  
5. Compare-Seiten (`/vergleich/ilovepdf` …) Copy um „ein Tab, ein Dokument“ ergänzen, URLs bleiben.  
6. **Keine** Massenumbenennung nach `/tools/{id}`. Wenn die Architektur das noch will: Aliase `/tools/{id}` → `/{id}`, nicht umgekehrt.

---

## 4. Visuelles Konzept / Design-System

### 4.1 Haltung

**Ruhige Werkbank, nicht Tool-Jahrmarkt.** Papier und Mint bleiben als Marke (Wiedererkennung, White-Label-Fähigkeit über `branding.json`). Die Arbeitsfläche wird **kühler, dichter, sans-serif**, die Marketingseiten dürfen serif bleiben.

Bewusst anders als iLovePDF / Smallpdf:

| Sie | Wir |
|---|---|
| Bunte Icon-Kacheln als Produkt | Dokument füllt die Fläche, Tools sind Verben an der Kante |
| Upload-in-die-Wolke, Wartekreis, Download | Datei nie weg; Fortschritt am Dokument |
| Ein Tool = eine URL = eine Aktion | Ein Dokument = viele Aktionen |
| Freemium, Wasserzeichen, Limit-Dialoge | Community voll; Limits = Gerät, ehrlich angezeigt |
| „Sicher“ als Marketingwort | Verify-Siegel, Netz-Null, Manifest — prüfbar |
| Inter-ähnliche Generic-SaaS-UI | Editorial-Marke außen, Präzisions-UI innen |
| Modal-Hagel | Ein Panel, ein Stapel, Toasts nur für Fehler/Fertig |

Kein Glassmorphism-Regen, keine 3-D-Drop-Shadows auf jeder Karte, kein lila Gradient-Hero im Workspace.

### 4.2 Tokens

```css
/* Semantik — Light */
--bg:            #f3efe4;      /* bleibt Marke */
--bg-app:        #ebe6d8;      /* Workspace etwas grauer als Marketing */
--fg:            #10221c;
--muted:         #4a5a54;
--card:          #fffdf6;
--line:          #cfc8b6;
--accent:        #1f8f74;      /* Brand / branding.json */
--accent-fg:     #06281f;
--ok:            #1b7f4e;
--warn:          #c45c26;      /* nur Gefahr / Verify-Fail */
--info:          #2f6fed;      /* Selektion, nicht Marke */
--lock:          #6b5c3e;
--net-zero:      #1b7f4e;
--net-foreign:   #c45c26;

/* Dark: bestehendes #0c1210-System, --bg-app: #0a0f0d */

--font-ui:    "IBM Plex Sans", "Source Sans 3", ui-sans-serif, system-ui, sans-serif;
--font-display: "Iowan Old Style", Palatino, ui-serif, serif; /* nur H1 Marketing */
--font-mono:  "IBM Plex Mono", ui-monospace, monospace;

--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
--space-5: 24px; --space-6: 32px; --space-7: 48px;
--radius-s: 4px; --radius-m: 8px; --radius-l: 16px;
--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
--dur-1: 120ms; --dur-2: 200ms; --dur-3: 360ms;
--z-palette: 50; --z-drawer: 40; --z-toast: 60;
--focus: 2px solid var(--accent);
```

Self-host Plex (OFL) unter `/assets/fonts`. Kein Google-Fonts-CDN. White-Label: `--accent` / Logo / Name weiter aus `branding.json`; `--bg-app` ableiten, nicht überschreiben müssen.

**Motion:** nur Opacity/Transform, keine Layout-Sprünge. `@media (prefers-reduced-motion: reduce)` → Dauer 0, Fortschritt deterministisch (kein Pulse).

### 4.3 Dark Mode

- Wie heute: Klasse auf `<html>`, Init-Script vor First Paint.
- Workspace: Canvas-Papier **hell lassen** (PDF/Foto-Farbe), Chrome dunkel — sonst „gewaschene“ Seiten. Toggle „Seiten invertieren“ bleibt Reader-Erbe, default aus (Barriere: Kontrast vs. Farbtreue).
- `color-scheme` schon gesetzt — beibehalten.

### 4.4 Komponentenliste und Props-Skizzen

```ts
// AppShell — ersetzt Header+max-w-6xl auf /app
type AppShellProps = {
  locale: Locale;
  sessionName: string;
  local: boolean;          // immer true im Browser-Pfad
  foreignBytes: number;    // NetworkStatus
  policyLabel?: string;    // Team-Preset organization
  onExport: () => void;
  children: ComponentChildren;
};

// FileTray
type FileTrayProps = {
  files: SessionFileView[];
  activeId: string | null;
  selectedIds: string[];
  onActivate: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
};

// DocCanvas — Adapter-Switch
type DocCanvasProps = {
  family: WorkspaceFamily;
  handle: DocumentHandleView;
  selection: Selection;
  overlays: Overlay[];      // redact marks, crop, hits
  findings: Finding[];
  onSelection: (sel: Selection) => void;
  onFindingClick: (id: string) => void;
};

// ThumbRail
type ThumbRailProps = {
  items: Array<{ id: string; label: string; src?: string; dirty?: boolean }>;
  activeId: string;
  onSelect: (id: string) => void;
};

// ActionBar
type ActionBarProps = {
  tools: Array<{
    id: string;
    title: string;
    locked?: boolean;
    disabledReason?: string;
    destructive?: boolean;
  }>;
  overflow: typeof tools;
  onRun: (toolId: string) => void;
};

// CommandPalette — Workspace-Modus
type CommandPaletteProps = {
  locale: Locale;
  items: PaletteItem[];     // actions + nav
  open: boolean;
  onClose: () => void;
  onCommit: (item: PaletteItem) => void;
};

// StepStack
type StepStackProps = {
  steps: StepView[];
  head: number;
  onUndo: () => void;
  onRedo: () => void;
  onJump: (index: number) => void; // Vorschau alten Stands
  onSavePipeline: () => void;
};

// OptionsPanel
type OptionsPanelProps = {
  toolId: string | null;
  fields: FormField[];
  values: Record<string, unknown>;
  locked: string[];
  presets: ToolPreset[];
  onChange: (v: Record<string, unknown>) => void;
  onApply: () => void;
};

// DiffView
type DiffViewProps = {
  mode: 'wipe' | 'overlay' | 'report';
  before?: PreviewFrame;
  after?: PreviewFrame;
  report?: StructuredReport;
};

// ExportDrawer
type ExportDrawerProps = {
  open: boolean;
  files: SessionFileView[];
  shareSafe: 'yes' | 'no' | 'unknown';
  defaultName: string;
  includeProvenance: boolean;
  onConfirm: (spec: ExportSpec) => void;
  onClose: () => void;
};

// Toasts — ein Viewport
type Toast = { id: string; kind: 'ok' | 'warn' | 'err'; text: string; timeoutMs?: number };

// EmptyStates / Onboarding
type EmptyWorkspaceProps = {
  locale: Locale;
  onPick: () => void;
  recent: Array<{ id: string; name: string; at: number }>;
};
```

Weitere: `TrustBadge`, `VerifySeal`, `FindingBar`, `JobTicker`, `PolicyBanner`, `OnboardingCoach`.

Bestehende Inseln **wandern**: `DropZone` → Tray+Empty; `ZodForm` → OptionsPanel; `VerificationBlock` → Seal+Report; `RedactEditor` → PdfCanvas-Plugin; `ImageBoxEditor` → ImageCanvas; `MediaTrimEditor` → MediaCanvas (Waveform neu); `Reader` → PdfCanvas+ReadMode; `PipelineBuilder` → StepStack+Validator; `HistoryApp` → SessionList; `NetworkStatus` → TrustBadge.

### 4.5 Micro-Interactions (konkret)

- **Drop:** 80 ms Scale 1.01 auf `--bg-app`, gestrichelter Accent-Ring, Datei-Chip fliegt in den Tray (Transform von Drop-Punkt, 200 ms). Reduced Motion: Ring + Chip-Append ohne Flug.
- **Analyse:** Skeleton-Zeilen in der FindingBar (3 grau), dann Chips; Zahl zählt hoch (120 ms / Fund).
- **Schritt commit:** Thumb bekommt 160 ms Mint-Ring, Stack-Zeile slided 8 px.
- **Verify-Siegel:** Kreis-Stroke 360 ms, dann Haken — nur bei `passed && !warnings`. Fail: Rost-X, kein Konfetti.
- **Wipe:** CSS `clip-path` am After-Layer, Handle 44×44.
- **Job:** unbestimmter Balken verboten wenn `ProgressEvent.ratio` da ist; Phasen-Label aus Engine (`load|parse|…`).
- **Fehler:** Toast + Zeile im Stack, Canvas bleibt auf letztem guten Head.

### 4.6 Keyboard-first

| Taste | Aktion |
|---|---|
| ⌘K | Palette (Aktionen) |
| ⌘Z / ⌘⇧Z | Undo / Redo am Stapel |
| ⌘S | Export-Drawer (Desktop: nativer Save, wenn ungespeichert) |
| ⌘E | Export |
| ⌘1…9 | Tray-Datei |
| [ ] | vorige/nächste Seite oder Thumb |
| ⌘F | Suche in Dokument (Reader-Erbe) |
| ⌘Enter | OptionsPanel Anwenden |
| Esc | Panel/Drawer/Palette zu, Selektion leer |
| ? | Shortcuts, Workspace-Satz (nicht nur 4 Zeilen) |

Fokusreihenfolge: Tray → Thumbs → Canvas → ActionBar → Options → Stack. Keine Fokusfalle in der Palette (Tab zyklisch, Pfeile Liste).

### 4.7 Touch / Mobile

- ActionBar horizontal scroll, Snap, 44 px Höhe.
- Sheets mit Drag-Handle, Schließen über Swipe-down.
- Pinch-Zoom auf PDF/Bild (pdf.js / CSS-transform), nicht Browser-Zoom der Chrome.
- Lange Dateien: Tray als Bottom-Sheet mit Suche.
- `mobileMediaWarn` bleibt; zusätzlich „Auf Desktop fortsetzen“ wenn `size > 200 MB && saveData`.

### 4.8 a11y — BITV 2.0 / WCAG 2.2 AA

- Kontrast Text ≥ 4,5:1, UI-Linie ≥ 3:1; Mint auf Papier **messen** (Stamp-Größe 0.68rem ist Risiko).
- Zielgröße 24 px Minimum (WCAG 2.2 AA 2.5.8), primäre Aktionen 44 px.
- Canvas: `role="img"` + `aria-label="Seite 3 von 12"`; Funde als Liste, nicht nur Overlay.
- Live-Region `polite` für Progress und „Schritt Schwärzen fertig“.
- Verify-Fail nicht nur Farbe (OK/FAIL-Text bleibt).
- Bewegungsreduktion: siehe Tokens.
- Tastatur: alle Box-Zeichnungen mit Pfeil+Enter-Alternative (Redact: Suchmodus Pflicht, nicht nur Rechteck-Drag).
- Sprache: `lang` am html, Locale-Switch erhält Session-Query.
- White-Label-Farbe: Contrast-Check beim Laden von `branding.json`; Fallback auf Default-Mint wenn ungenügend.

Kein Overlay-only-Redact in der UI versprechen — Engine entfernt Content; UI muss das erklären (Landing + Panel).

---

## 5. Wow-Momente (machbar, keine Konzeptkunst)

| # | Moment | Technik | Welle |
|---|---|---|---|
| 1 | Datei ins Fenster → erste Seite < 300 ms + Leiste „3 IBANs, 2 Anhänge, JavaScript — jetzt bereinigen?“ | pdf.js erste Seite parallel zu `analyze()`; Hits aus `previewRedact` + Sanitize-Scan | W2 |
| 2 | Klick auf Fund „IBAN S.3“ → Sprung, Box, ein Klick „Diese schwärzen“ | Finding.selection → Overlay → `pdf-redact` nur diese region | W2 |
| 3 | Live-Schwärzung + Siegel nach Commit | Overlay sofort; `verify` im Worker; Stroke-Animation | W2 |
| 4 | „Make it fit“-Slider (Ziel-MB) mit Live-Größe | Debounced `preview` oder Schätzer aus Bild-dpi/CRF; Tool `pdf-compress` / `media-fit` | W2/W4 |
| 5 | Wischer Vorher/Nachher nach Compress/Repair | zwei PreviewFrames, clip-path | W2 |
| 6 | Pipeline auf 50 Dateien, pro Zeile Status | `mapFiles` + Pool + Tray-Progress | W5 |
| 7 | Desktop: PDF doppelklicken → Workspace mit Analyse, nicht leerer Reader | Tauri open → `/app`, `readOpenedFile` → Session | W2 |
| 8 | ⌘K „sanitizen“ wendet an, Canvas bleibt | kein `location.assign` | W3 |
| 9 | Export-Drawer Ampel Share-safe, ein Tap „prüfen“ | `forensics-share-safe` als Schritt | W3 |
| 10 | Tab-Crash, zurück: Akte da | OPFS Session | W1 |

Nicht als Wow verkaufen: generische Lottie, Onboarding-Karussell, Confetti.

---

## 6. Technische Architektur Frontend

### 6.1 Astro-Inseln vs. `/app`-SPA

**Entscheidung: hybride Site. Marketing/SEO bleibt Astro-SSG. `/app` ist eine dedizierte Preact-Anwendung als `client:only="preact"` auf einer dünnen Astro-Hülle (kein `max-w-6xl`, `noindex`).**

Begründung:

- 180+ Tool-Landings + Formate + Convert brauchen SSG, hreflang, JSON-LD. Eine CSR-App dafür wäre SEO- und Bundle-Regression.
- Der Workspace hat Shared State (Session, Head, Jobs, Worker). Zehn `client:load`-Inseln ohne gemeinsamen Store wiederholen das Handoff-Desaster.
- `ToolApp` bleibt übergangsweise auf `/{id}`; er teilt Module (`sessionStore`, `workerPool`) per Import, nicht per iframe.

Nicht: Next.js, nicht React. Stack ist Preact 10, MIT.

### 6.2 State: Preact + Signals

**Wahl: `@preact/signals` (MIT) + ein Modul `workspace-store.ts`.**

| Alternative | Urteil |
|---|---|
| Nur `useState` (Ist) | Prop-Drilling durch Shell/Canvas/Stack unhaltbar |
| Redux / Zustand | zusätzliche Lizenz/API, heavier; kein Gewinn gegen Signals |
| Solid | zweite Runtime, Bundle+Hirn |
| Nano Stores | ok, aber Signals sind die Preact-native Form |

```ts
import { signal, computed, batch } from '@preact/signals';

export interface Selection {
  pages?: number[];
  regions?: Array<{ page?: number; x: number; y: number; w: number; h: number; unit: 'pdf' | 'px' | 'norm' }>;
  timeRange?: { startSec: number; endSec: number };
  fileIds?: string[];
}

export interface StepRecord {
  stepId: string;
  toolId: string;
  options: unknown;
  selection: Selection;
  status: 'queued' | 'running' | 'ok' | 'error';
  outputRef?: string;
  verification?: VerificationReport;
  error?: string;
}

export interface SessionFileState {
  id: string;
  name: string;
  mime: string;
  size: number;
  family: WorkspaceFamily;
  opfsPath: string;
  revisions: StepRecord[];
  head: number; // index in revisions; -1 = original
  findings: Finding[];
}

export interface WorkspaceState {
  sessionId: string;
  name: string;
  files: SessionFileState[];
  activeFileId: string | null;
  selectedFileIds: string[];
  selection: Selection;
  pendingToolId: string | null;
  pendingOptions: Record<string, unknown>;
  jobs: Array<{ id: string; label: string; ratio: number }>;
  exportOpen: boolean;
  paletteOpen: boolean;
}

export const workspace = signal<WorkspaceState>(emptyWorkspace());

export const activeFile = computed(() =>
  workspace.value.files.find((f) => f.id === workspace.value.activeFileId) ?? null,
);

export const currentBytesPath = computed(() => {
  const f = activeFile.value;
  if (!f) return null;
  if (f.head < 0) return f.opfsPath;
  return f.revisions[f.head]?.outputRef ?? f.opfsPath;
});

export function enqueueStep(toolId: string, options: unknown, selection: Selection) {
  batch(() => {
    /* append queued step, kick workerPool */
  });
}

export function undo() { /* head-- , canvas bindet currentBytesPath */ }
export function redo() { /* head++ */ }
```

Jobs nie im Canvas-Komponentenstate. Worker postet Progress → `jobs` Signal.

### 6.3 Worker-Pool (UI-Seite)

```ts
// lib/worker-pool.ts
export function getWorkerPool(): {
  run(toolId: string, files: WorkerFileRef[], options: unknown, onProg: ProgressCb): Promise<ToolResult>;
  preview(req: PreviewRequest): Promise<PreviewFrame[]>;
  analyze(file: WorkerFileRef): Promise<Finding[]>;
  cancel(jobId: string): void;
};
```

`WorkerFileRef` = `{ name, mime, opfsPath }` bevorzugt, nicht immer `Uint8Array`. `createToolWorker()` intern wiederverwendet. Pack-Warmup: nach MIME-Detect.

### 6.4 Persistenz

```
OPFS
  /sessions/{sessionId}/src/{fileId}
  /sessions/{sessionId}/rev/{fileId}/{stepId}
  /history/…          (bestehend, Jobs/Exporte)
IndexedDB
  neotools-sessions     { id, name, filesMeta, steps, updatedAt }
  neotools-history      (bestehend)
  neotools-handoff      (Welle 1 noch, dann deprecated)
```

Quota: bestehende History-Settings + Session-Summe. Warnung in der Trust-Leiste, nicht erst beim Fail.

### 6.5 Routing / Deep-Links

Query (alle optional, komponierbar):

| Param | Bedeutung |
|---|---|
| `session` | vorhandene Session öffnen |
| `tool` | OptionsPanel + Action highlight |
| `preset` | Tool-Preset |
| `o` | Base64url-Options (bestehend) |
| `pages` | `1-3,7` → Selection |
| `t` | `12.0-40.0` Zeit |
| `mode` | `pipeline` \| `read` \| `batch` |
| `#p=` | Pipeline-Hash (bestehend) |

Tauri: `neotools://app?tool=pdf-redact` → `DesktopEvents` mappt schon auf Pfade; Ziel anpassen. Menü „Öffnen“ nicht mehr `/reader`.

### 6.6 Tauri

- Dateizuordnung und `readOpenedFile` → Session, Canvas sofort.
- Native Save im Export-Drawer (`pickSavePath` / `saveFile`) — Reader kann das schon.
- Deep-Link und Team-Preset-Event (`load-team-presets`) bleiben; Reload durch Store-Reapply ersetzen, sobald Registry im Worker reloadbar ist.
- PDF-Doppelklick = Wow 7. Kein zweites WebView.

### 6.7 Tests

| Lage | Neu |
|---|---|
| Vitest | SessionStore, Selection-Parse, Undo-head, Query-Router, Contrast-Helper |
| Playwright | W2: Drop PDF auf `/app` → Seite sichtbar → compress → stack+1 → undo → Export |
| Playwright | W2: Landing `/pdf-redact` Drop → `/app?tool=pdf-redact` → Mark → Verify-Siegel |
| Playwright | W3: `#p=` Pipeline im App-Modus |
| Playwright | bestehende merge/sanitize/redact-Smokes **nicht** in W1 zerbrechen |
| a11y | axe auf `/app` empty + PDF-geladen in CI (Welle W3) |

Goldens bleiben Pack-Sache.

### 6.8 Bundle-Disziplin

- `/app`-Entry importiert **nicht** `@neotools/tools-media` im Main-Thread.
- Canvas-Adapter: `import()` nach `family`.
- pdf.js worker unverändert same-origin.
- Signals + Shell-Ziel: **< 80 kB gz** ohne Packs. Packs weiter Worker-only.
- Kein neues UI-Framework, kein Chart-Kit, Waveform selbst (Peaks-Array, Canvas).

---

## 7. Umsetzungsplan in Wellen

Aufwände = Personentage einer Person, parallelisierbar wo gekennzeichnet. Reihenfolge nach Nutzerwert: **PDF zuerst**.

### Welle W0 — Design-System und App-Gerüst (parallel zu Engine-Feldern)

| Paket | Tage | Inhalt | Parallel |
|---|---|---|---|
| DS-01 | 2 | Tokens in `global.css`, UI-Sans self-host, Motion/Reduced | ja |
| DS-02 | 2 | TrustBadge, Theme, Focus, Skip-Link | ja |
| APP-01 | 2 | Route `/app` + `/en/app`, `noindex`, leere AppShell | nach DS-01 Start |
| ENG-01 | 2 | `workspace`-Meta, `pages/region/timeRange`-Zod, `outputs` lint | ja, anderer Agent |

**DoD W0:** `/app` lädt in < 1 s idle, Dark Mode, Badge „Lokal · Netz 0 B“, keine Regression der Tool-Seiten. Tokens dokumentiert in dieser Datei (oben).

**Risiko:** Branding-Kontrast; Mitigation: Check-Skript.

### Welle W1 — FileTray, Persistenz, Drop-Physik

| Paket | Tage | Inhalt | Parallel |
|---|---|---|---|
| SES-01 | 3 | SessionStore OPFS+IDB, Quota, Wiederöffnen | ja |
| TRAY-01 | 3 | FileTray, Multi-Datei, Paste/Drop global auf `/app` | nach SES-01 API |
| POOL-01 | 3 | Worker-Pool + OPFS-Refs statt immer Bytes | ja (Engine+Web) |
| LAND-01 | 2 | `ToolApp`-Drop schreibt Session und linkt `/app?tool=` (Feature-Flag) | nach SES-01 |

**DoD W1:** Zwei PDFs droppen, Reload, beide da; Landing `pdf-merge` Flag an → Tray hat beide; History unangetastet.

**Risiko:** Safari-OPFS-Quirks; Fallback IDB (schon im History-Stack).

### Welle W2 — PDF-Workspace (höchster Wert)

| Paket | Tage | Inhalt | Parallel |
|---|---|---|---|
| PDF-01 | 4 | PdfCanvas aus Reader+Redact: Thumbs, Zoom, Textsuche | ja zu PDF-02 |
| PDF-02 | 3 | StepStack Undo/Redo Snapshots | ja |
| PDF-03 | 4 | ActionBar PDF-Kern: compress, rotate, reorder, split, merge | nach PDF-01 |
| PDF-04 | 5 | Redact inline + FindingBar + VerifySeal | nach PDF-01, ENG preview |
| PDF-05 | 3 | Sanitize + Share-safe-Report strukturiert | nach PDF-03 |
| PDF-06 | 2 | Wipe-Diff compress; Make-it-fit Slider v1 (Schätzer ok) | nach PDF-03 |
| DESK-01 | 2 | Tauri-Open → `/app`; PWA-Handler Alias | ja |

**DoD W2:** Szenario Nutzer: ein PDF öffnen → komprimieren → Seiten tauschen → zwei IBANs schwärzen → sanitizen → Export mit Siegel. Kein zweites Öffnen. ⌘Z macht Sanitize rückgängig. Playwright-Flow grün. `/reader` darf noch existieren.

**Risiko:** RAM bei 200-Seiten-PDF + Snapshots; Mitigation: Thumb-Viewport virtualisieren, Snapshots nur Head und Head-1 halten, ältere auf OPFS ohne Decode.

### Welle W3 — Palette, Export, SEO-Brücke, Reader/Pipeline

| Paket | Tage | Inhalt | Parallel |
|---|---|---|---|
| PAL-01 | 3 | ⌘K Aktionen + bestehendes Nav-Fallback | ja |
| EXP-01 | 3 | ExportDrawer, Provenance-Toggle, Ampel | ja |
| SEO-01 | 3 | Alle Tool-Landings Flag default an; Header „Öffnen“ | nach W2 stabil |
| MIG-01 | 2 | `/reader` → `/app`, `/open` Redirect | nach SEO-01 |
| MIG-02 | 2 | `#p=` in `/app`, Pipeline-Seite Embed/Redirect | ja zu MIG-01 |
| A11Y-01 | 3 | axe CI, Tastatur-Pass, Kontrast-Fix | ja |

**DoD W3:** ⌘K „sanitizen“ ohne Navigation. Compare-Copy aktualisiert. Alte Reader-URLs landen im Workspace. Smokes umgezogen oder dual.

### Welle W4 — Bild- und Media-Workspace

| Paket | Tage | Inhalt | Parallel |
|---|---|---|---|
| IMG-01 | 4 | ImageCanvas, Boxen, Wipe, EXIF-Funde | ja zu MED-01 |
| IMG-02 | 2 | ActionBar image-* + doc-repair | nach IMG-01 |
| MED-01 | 5 | Waveform/Timeline, In/Out-Drag, Crop-rect | ja |
| MED-02 | 3 | media-fit Live-Größe, Trim commit | nach MED-01 |
| ANA-01 | 2 | `analyze()` image-metadata GPS, video duration | ja |

**DoD W4:** Foto droppen → GPS-Chip → strip → crop → export. Clip trimmen ohne Zahlenfelder als einzige UI. Mobile-Warnung unverändert ehrlich.

**Risiko:** ffmpeg-Kaltstart (10–30 s, GPL-Core-Größe). Mitigation: Trust-Leiste „FFmpeg wird geladen (lokal, x MB)“, Prefetch nach MIME `video/*`.

### Welle W5 — Office, Batch, Onboarding, Politur

| Paket | Tage | Inhalt | Parallel |
|---|---|---|---|
| OFF-01 | 4 | Office-Vorschau (HTML/Grid), to-pdf im Stapel | ja |
| BAT-01 | 4 | N Dateien, ein Stack, Protokoll, ZIP | ja |
| ONB-01 | 3 | EmptyState, 3 Coachmarks, Landing-Hero „Datei fallen lassen = arbeiten“ | ja |
| VER-01 | 2 | `/verlauf` Session-Liste | nach BAT-01 |
| POL-01 | 3 | Header-Schlankung Marketing, Watch-Link Overflow | ja |

**DoD W5:** 50 PDFs sanitize+compress mit sichtbarem Fortschritt. Office-DOCX → PDF → sanitize im einen Tab. Onboarding einmal, `localStorage`, skipbar. Reader/Pipeline-Nav aus dem Marketing-Header entfernt.

### Wellenplan-Tabelle (Überblick)

| Welle | Fokus | Kalender (1 Person) | Parallel max. | Nutzerwert |
|---|---|---|---|---|
| W0 | Tokens, `/app` leer, Engine-Meta | ~4–5 T | 3 | Grundlage |
| W1 | Session, Tray, Pool, Landing-Flag | ~8 T | 3 | Datei überlebt Reload |
| W2 | PDF-Workspace komplett | ~16–18 T | 3 | **Kernversprechen** |
| W3 | Palette, Export, Migration Reader/Pipeline | ~12 T | 3 | Ein-Tab-Gefühl überall |
| W4 | Bild + Media | ~12 T | 2 | Parität der Familien |
| W5 | Office, Batch, Onboarding | ~12 T | 3 | Kanzlei-Stapel, Creator-Fit |

Gesamt grob **8–10 Wochen** eine Person; mit 2–3 parallelen Tracks (DS/Engine/PDF) **5–6 Wochen** bis W2-DoD.

### Querschnittsrisiken

| Risiko | Welle | Mitigation |
|---|---|---|
| Anderer Agent ändert ToolApp/Reader unter dem Dokument | alle | nur Interfaces teilen; Feature-Flags; diese Datei nicht als stilles Rewrite der Inseln |
| WASM-OOM im Pool | W1–W4 | max 2 schwere Packs gleichzeitig (ffmpeg ⊕ onnx) |
| SEO-Unruhe durch Header-Änderung | W3 | Tool-URLs unangetastet; Messung interner Klicks |
| Snapshot-Quota | W2 | Head/Head-1; Nutzer-Dialog |
| BITV-Abnahme Kanzlei | W3 | axe + manuelle Checkliste im DoD |
| FFmpeg-Lizenzhinweis | W4 | bestehender `/lizenzen`-Text in JobTicker wiederholen |
| Doppelte Handoff-Pfade | W1–W3 | ein SessionStore, Handoff nur Adapter |

---

## 8. ASCII-Zustände (ergänzend)

### Empty `/app` Desktop

```
+--------------------------------------------------------------+
| ● LOKAL  ○ Netz 0 B                              [DE] [☽] ⌘K |
+--------------------------------------------------------------+
|                                                              |
|           Datei hierher ziehen                               |
|           PDF, Bild, Audio, Video, Office                    |
|           bleibt auf diesem Gerät                            |
|                                                              |
|           [ Dateien wählen ]     [ Session öffnen ]          |
|                                                              |
|           Zuletzt: Akte-Müller (heute, 6 Schritte)           |
+--------------------------------------------------------------+
```

### Export-Drawer

```
+---------------- Export --------------------------------+
| Antrag-geschaerzt.pdf                                  |
| Dateiname [ Antrag-2026-09-14-safe.pdf         ]       |
| ( ) Nur aktuelle Datei   ( ) Tray als ZIP              |
| [x] Provenance beilegen                                |
|                                                        |
| Share-safe  [ GRÜN · 12 Checks ]                       |
|             JS entfernt · IBANs nicht im Extract       |
|                                                        |
| [ Abbrechen ]                         [ Speichern ]    |
+--------------------------------------------------------+
```

---

## 9. Beispiel: Landing → Workspace (Sequenz)

```
Nutzer auf /pdf-redact
  DropZone.addFiles
    → sessionStore.create()
    → write OPFS src/
    → analyze() async
    → location /app?tool=pdf-redact&session=…
Workspace.mount
  → load session
  → PdfCanvas first page
  → FindingBar chips
  → pendingToolId = pdf-redact
  → OptionsPanel Muster
Nutzer klickt Chip IBAN
  → selection.regions = …
  → ⌘Enter / „Anwenden“
  → enqueueStep → workerPool.run('pdf-redact')
  → snapshot OPFS rev/
  → verify → Seal
  → head++
```

---

## 10. Kurzfassung für die Übergabe

### Kernentscheidungen

1. **Dokumentzentrierte SPA auf `/app`** (Alias `/workspace`), `noindex`. SEO-Tool-Seiten bleiben auf `/{id}`.
2. **Preact + `@preact/signals`**, eine Store-Modul-Grenze; kein React, kein Insel-Flickenteppich für die Arbeit.
3. **Schrittstapel = `PipelineSpec` + OPFS-Snapshots**; Undo ist Head-Bewegung, nicht inverse Ops.
4. **Engine erweitern, nicht forken:** `workspace`-Meta, Standard-Selektion, DocumentHandle, `preview`/`analyze`, echter Worker-Pool, OPFS-Pfade im `Platform`.
5. **PDF-Welle zuerst** (W2). Reader und Pipeline werden in den Workspace gefaltet, URLs umgeleitet, nicht gelöscht ohne Redirect.
6. **Marke:** Mint/Papier/Lokal-Badge behalten; Workspace wird UI-Sans, dichter, prüfbarer — kein iLovePDF-Kachelpult.
7. **Verify fail-closed** bleibt Gesetz; Siegel und Export-Ampel sind die sichtbare Form.

### Wellenplan

| Welle | Ergebnis |
|---|---|
| W0 | Tokens + leere AppShell + Engine-Felder |
| W1 | Session-Bin überlebt Reload; Landing kann übergeben |
| W2 | PDF: ein Tab, Stapel, Redact, Sanitize, Siegel, Desktop-Open |
| W3 | ⌘K-Aktionen, Export-Drawer, Reader/Pipeline/Open umgebogen |
| W4 | Bild- und Media-Canvas |
| W5 | Office, Batch 50, Onboarding, Verlauf=Sessions |

### Nötige Engine-Änderungen (Checkliste)

- [ ] `ToolDefinition.workspace` + `outputs` verpflichtend linten  
- [ ] Zod-Bausteine `pages` / `regions` / `timeRange` / `fileIds`  
- [ ] Tools schrittweise auf Bausteine umstellen (pdf-redact, image-crop, media-trim zuerst)  
- [ ] `DocumentHandle` + optionales `parsed` auf `ToolContext`  
- [ ] `preview?` am Tool; `previewRedact` darauf abbilden  
- [ ] `analyze?` pro Pack oder `forensics-analyze`  
- [ ] `Platform.readOpfs` / `writeOpfs` im Browser-Adapter (Architektur-Soll)  
- [ ] Worker-Pool (2–4), Job-Queue, Warmup, Cancel+Respawn  
- [ ] `PipelineStep.selection?` (oder Options-only, wenn Bausteine reichen)  
- [ ] `runPipeline` Zwischenstände als Handles, nicht nur volle `NeoFile`-Kopien  
- [ ] Preset-Sichtbarkeit: `getAppliedPresets` für Policy-Leiste (schon lesbar)  

### Offene Fragen

1. **Default nach Desktop-PDF-Open:** Analyse immer an, oder nur bei `privacySensitive`-Team-Policy? (Vorschlag: immer, Timeout 2 s, still scheitern.)  
2. **Snapshot-Tiefe:** nur Head±1 oder volle Historie bis Quota? (Vorschlag: volle Historie bis 200 MB Session-Cap, dann älteste Revisions droppen, Original behalten.)  
3. **Merge-UX:** Tray-Mehrfachauswahl vs. eigenes Overlay „Reihenfolge“. (Vorschlag: Overlay, weil Outline/Bates Optionen brauchen.)  
4. **Signatur erstellen** bleibt CLI/Tauri — zeigt die ActionBar „Nur Desktop“ oder verstecken im Web? (Vorschlag: sichtbar, disabled, Grundzeile.)  
5. **`/app` PWA-Scope:** eigener Service-Worker-Scope oder einer? (Vorschlag: einer, Precache Shell+`/app`; Engines on demand — wie heute.)  
6. **White-Label:** dürfen Mandanten die Serife der Landing behalten, wenn Workspace Plex nutzt? (Vorschlag: ja, zwei Font-Tokens.)  
7. **Parallel-Agent:** wer besitzt `ToolApp.tsx` / `Reader.tsx` in W1–W2? Flag-Schnittstelle in dieser Datei §3.1, Ownership im Sprint klären.  
8. **Analyse-Telemetrie:** keine. Auch keine anonymen Counts im Workspace ohne bestehendes self-hosted Plausible-Event ohne PII — und nicht für Funde (Funde sind Inhalt).  

---

*Ende des Konzepts. Umsetzung beginnt mit W0/DS-01 und ENG-01; kein Cosmetics-Pass auf dem Katalog ersetzt den Workspace.*

---

## 11. App-first-Pivot (2026-09-14, ersetzt §2.2, §3 und die Landing-Pläne ab W3)

**Feedback:** „Nur noch in Workspace denken. Ich möchte ein Programm, keine Website, die mit Informationen vollballert. Die App startet auf der Website, der Fokus liegt auf der App, und darunter erklärt sich die App – wunderschön, mit Wow-Effekt.“

### 11.1 Entscheidungen (keine offenen Fragen)

| # | Entscheidung |
|---|--------------|
| 1 | `/` (und `/en`) **ist die App above the fold**: die echte `WorkspaceApp`-Shell, eingebettet mit `100dvh − Top-Bar`, Leerzustand = Drop-Fläche + zuletzt verwendete Sessions + Statusleiste mit Lokal-Badge. Ein ruhiger Satz in der Top-Bar („Dateien lokal bearbeiten. Nichts verlässt deinen Rechner.“), Scroll-Hinweis „Was steckt drin ↓“. Sonst nichts im ersten Viewport. |
| 2 | Die erste Datei **expandiert die Shell in den Vollbild-Workspace** (`data-expanded="true"`, Seite darunter ausgeblendet, `body`-Scroll gesperrt). URL bleibt `/`; Deep-Link-Zustand wird wie bisher nach `?tool=&file=&session=` gespiegelt. „Zurück zur Übersicht“ über Menü *Ansicht → Übersicht* oder `Esc` bei leerer Auswahl – Session bleibt (OPFS), kein Datenverlust. |
| 3 | **Workspace je Dateityp**, erkannt per Magic Bytes (`identifyBytes` aus `tools-forensics`, nicht Endung): `pdf`, `image`, `audio`, `video`, `office`, `archive`, `data`, `unbekannt → Identify`. Jeder Workspace listet **alle** Registry-Tools, die den MIME akzeptieren (`workspaceToolsFor`), gruppiert nach Verb: Umwandeln · Bearbeiten · Schützen/Schwärzen · Prüfen/Analysieren · Exportieren. Nichts hartkodiert. |
| 4 | **Shell wie ein Programm**: Menüleiste (Datei · Bearbeiten · Ansicht · Werkzeuge · Hilfe, echte Menüs mit Shortcuts) · links Session-Bin · Mitte Canvas · rechts Inspector (Tool-Optionen, Schrittstapel, Verifikation) · unten Statusleiste (Dateiinfo, Lokal-Badge, Job-Fortschritt, Sprache/Theme). 12–14 px UI-Schrift, Icon-Buttons mit Tooltips, ein-/ausklappbare Panels persistiert in `localStorage`. Dark und Light gleichwertig. |
| 5 | **Darunter = die Erklärung** (der SEO-Inhalt von `/`): je Workspace eine Sektion als **Live-Mock** (echte Komponenten im Demo-Zustand mit winzigen mitgelieferten Beispieldateien, scroll-getrieben: Drop → Analyse-Leiste → Schwärzung → Siegel grün → Export), „Alles läuft hier“ (Datenfluss-Diagramm + Live-Zähler *0 Requests an Fremdserver* aus `performance.getEntriesByType('resource')`), „Alle Werkzeuge“ (durchsuchbares Raster aus der Registry, Klick → App mit Tool), „Für Kanzleien, Steuerberater, Behörden“, „Für Creator“, Desktop-/Self-Hosting-Karten, schlanker Footer nach `/info/...`. Anmutung Linear/Raycast/Arc: große ruhige Typografie, eine Display-Größe pro Sektion, Glows nur am Akzent. Reduced Motion → statische Frames. |
| 6 | **Informationen wandern aus** nach `/info/...` (`/en/info/...`) mit eigenem schlichtem Doku-Layout (`InfoBase.astro`): `/info/tools/{id}`, `/info/formats[/{id}]`, `/info/convert[/{pair}]`, `/info/guides[/{slug}]`, `/info/vergleich/{x}` (`/en/info/compare/{x}`), `/info/preise`, `/info/ueber`, `/info/impressum`, `/info/datenschutz`, `/info/lizenzen`, `/info/lizenz`, `/info/no-upload`, `/info/spec[/…]`. Alte URLs leiten um (Astro `redirects`, statisches Meta-Refresh + Canonical). Sitemap = nur `/` + `/info/**`. |
| 7 | `/{toolId}` wird **App-Deep-Link**: rendert `/` mit expandierter Shell und vorgewähltem Tool (Ein-Satz-Beschreibung im Inspector), `noindex`, Canonical → `/info/tools/{id}`. `/app`, `/workspace`, `/reader`, `/verlauf`, `/pipeline`, `/watch` leiten in die App (`/?panel=history`, `/?panel=pipeline`, `/?panel=watch`). `ToolApp` als Route entfällt. |
| 8 | **Design-Tokens neu auf App-Ästhetik**: neutrale Graustufen, Mint nur als reduzierter Akzent, Papier-Beige raus, 4-px-Raster, Radius 6–8 px, 1-px-Trennlinien statt Schatten-Karten, nur funktionale Motion, System-UI-Schriftstapel (`Inter`-Fallback nur lokal, kein CDN). Eigenes SVG-Icon-Set (`Icons.tsx`, Lucide-kompatible Metrik, ISC). |
| 9 | Reihenfolge: Shell/Leerzustand embedded + Expand → Info-Umzug + Redirects → PDF-Workspace → Erklärsektionen mit Live-Mocks → generischer Workspace für alle Typen → Bild → Audio/Video. Nach jedem Block Commit + Push. |

### 11.2 Wireframes

**`/` — erster Viewport (Leerzustand, eingebettete Shell)**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◧ NeoTools   Datei  Bearbeiten  Ansicht  Werkzeuge  Hilfe   Dateien lokal    │
│                                              bearbeiten. Nichts verlässt … ⌘K ☾│
├──────────────┬───────────────────────────────────────────────┬───────────────┤
│ SESSIONS     │                                               │ INSPECTOR     │
│ ▸ akte 09-14 │        ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐      │               │
│ ▸ scan 09-12 │                                               │ Datei ablegen │
│              │      Datei öffnen · hierher ziehen · einfügen  │ – der passende│
│              │                [ Datei wählen ]               │ Workspace     │
│              │        └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘      │ lädt.         │
│              │                                               │               │
│ + Neue Session                                               │               │
├──────────────┴───────────────────────────────────────────────┴───────────────┤
│ ● Lokal · Netz 0 B                                DE · EN   ⚙  Was steckt drin ↓│
└──────────────────────────────────────────────────────────────────────────────┘
```

**`/` — expandierter PDF-Workspace (nach dem ersten Drop)**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◧ NeoTools   Datei  Bearbeiten  Ansicht  Werkzeuge  Hilfe   akte-mueller ⌘K ☾│
├──────────┬──────────────────────────────────────────────────┬────────────────┤
│ BIN      │ Umwandeln ▾ Bearbeiten ▾ Schützen ▾ Prüfen ▾ Export│ INSPECTOR     │
│ ▣ akte   │ ─────────────────────────────────────────────────│ ┌ Schwärzen ──┐│
│ ▢ scan   │ ⚠ 3 IBAN gefunden               [Jetzt schwärzen]│ │ Modus ● auto││
│          │ ┌───┐ ┌──────────────────────────────────────┐   │ │ Muster …    ││
│          │ │ 1 │ │                                      │   │ │ [Anwenden ⌘↵]│
│          │ ├───┤ │        Seiten-Canvas (pdf.js)        │   │ └─────────────┘│
│          │ │ 2 │ │                                      │   │ SCHRITTE       │
│          │ ├───┤ │                                      │   │ ● Original     │
│          │ │ 3 │ └──────────────────────────────────────┘   │ ○ Schwärzen ✓  │
│          │ └───┘  ‹ 1 / 3 ›   − 100 % +   🔍               │ ○ Komprimieren │
├──────────┴──────────────────────────────────────────────────┴────────────────┤
│ akte-mueller.pdf · PDF · 2 KB · 3 Seiten   ● Lokal · Netz 0 B  ▶ compress 40 %│
└──────────────────────────────────────────────────────────────────────────────┘
```

**`/` — Bild-Workspace** (gleiche Shell; Canvas = zoombare Bitmap, Tools = Familie image)

```
│ BIN      │ Umwandeln ▾ Bearbeiten ▾ Schützen ▾ Prüfen ▾ Export│ INSPECTOR     │
│ ▣ foto   │ ┌──────────────────────────────────────────────┐ │ Skalieren       │
│          │ │                                              │ │ Breite [1600]   │
│          │ │     Bitmap, Schachbrett, Zoom 50 %           │ │ Format ● webp   │
│          │ │                                              │ │ [Anwenden ⌘↵]   │
│          │ └──────────────────────────────────────────────┘ │ SCHRITTE        │
│          │   − 50 % +   Einpassen   1:1    3024×4032 · 2,1 MB│ ● Original      │
```

**`/` — unter dem Fold (Erklärung)**

```
  ─────────────────────────────  scroll  ─────────────────────────────
  PDF.                                  ┌──────────────────────────┐
  Schwärzen, komprimieren, signieren –  │  Live-Mock des PDF-      │
  in einem Tab, nie hochgeladen.        │  Workspace (echte Komp.) │
  [Im Workspace ausprobieren ↑]         │  Drop→Analyse→Schwärzen→✓│
                                        └──────────────────────────┘
  Bild. …  Audio. …  Video. …  Office & Daten. …  Archiv. …  Forensik & DACH. …
  Alles läuft hier.   [Browser ▭]→[WASM ⚙]→[deine Platte ▤]   0 Requests an Fremdserver
  Alle 235 Werkzeuge.  [suchen…] [PDF][Bild][Audio][Video][Office][Daten][Archiv]  Raster → App
  Für Kanzleien · Steuerberater · Behörden        Für Creator
  Desktop-App · Self-Hosting · CLI   (drei Karten)
  Footer → /info: Preise · Vergleich · Guides · Impressum · Datenschutz · Lizenzen · GitHub
```

**`/info/...` — Doku-Layout**

```
┌──────────────────────────────────────────────────────────────┐
│ ◧ NeoTools  Info     Tools · Formate · Guides · Vergleich · …│
├──────────────────────────────────────────────────────────────┤
│  # PDF schwärzen                     [Im Workspace öffnen →] │
│  Fließtext … FAQ … verwandte Formate … Guides …              │
├──────────────────────────────────────────────────────────────┤
│ Footer: Impressum · Datenschutz · Lizenzen · No-Upload       │
└──────────────────────────────────────────────────────────────┘
```

**Mobile (≤ 768 px)**: Top-Bar reduziert auf ◧ + ☰ (Menüs als Sheet), Bin/Inspector als Bottom-Sheets über Tab-Bar (Bin · Optionen · Schritte · Export), Thumb-Leiste horizontal über dem Canvas, Statusleiste nur Lokal-Badge. Erklärsektionen stapeln, Mocks skalieren auf Breite.

### 11.3 Definition of Done (Pivot)

- `/` zeigt im ersten Viewport die Drop-Zone ohne Scrollen; keine Hero-`h1`, keine Zähler, kein Feature-Raster above the fold.
- PDF / Bild / unbekannte Datei fallen lassen lädt den passenden Workspace mit ≥ 15 / ≥ 8 / ≥ 3 Tools in der Leiste; Deep-Link `/pdf-redact` öffnet die expandierte Shell mit dem Tool.
- Scrollen zeigt ≥ 5 Erklärsektionen; „Im Workspace ausprobieren“ öffnet den PDF-Workspace ohne Navigation; Tool-Raster klickbar; Reduced Motion rendert statisch.
- Alte URLs leiten um; `/info/**` indexierbar, App-Routen `noindex`; Sitemap nur `/` + `/info/**`; null Fremd-Origin-Requests.
