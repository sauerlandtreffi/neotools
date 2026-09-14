import type { Locale } from '../lib/i18n';

export const COMPARE_AS_OF = '2026-09-14';

export type CompareId = 'ilovepdf' | 'smallpdf' | 'adobe-acrobat';

export interface CompareRow {
  criterion: { de: string; en: string };
  neo: { de: string; en: string };
  other: { de: string; en: string };
}

export interface CompareFaq {
  q: { de: string; en: string };
  a: { de: string; en: string };
}

export interface ComparePage {
  id: CompareId;
  name: string;
  site: string;
  summary: { de: string; en: string };
  rows: CompareRow[];
  faq: CompareFaq[];
  notes: { de: string; en: string };
}

const NEO = {
  upload: { de: 'Nein (statische Seite + Worker)', en: 'No (static page + worker)' },
  watermark: { de: 'Nein', en: 'No' },
  limits: { de: 'Nur Gerätespeicher / Browser-Quota', en: 'Device memory / browser quota only' },
  price: { de: 'Alle Tools frei (Community)', en: 'Every tool free (Community)' },
  offline: { de: 'Ja, nach Asset-Cache; Desktop/CLI ohne Netz', en: 'Yes after asset cache; desktop/CLI without network' },
  redact: {
    de: 'Echte Content-Entfernung plus Verifikation (pdf-redact)',
    en: 'True content removal plus verification (pdf-redact)',
  },
  selfhost: { de: 'Ja (Docker, branding.json)', en: 'Yes (Docker, branding.json)' },
  oss: { de: 'Engine-Kern MIT; gebündelte Libs siehe /lizenzen', en: 'Engine core MIT; bundled libs on /licenses' },
};

function page(
  id: CompareId,
  name: string,
  site: string,
  summary: ComparePage['summary'],
  other: {
    upload: CompareRow['other'];
    watermark: CompareRow['other'];
    limits: CompareRow['other'];
    price: CompareRow['other'];
    offline: CompareRow['other'];
    redact: CompareRow['other'];
    selfhost: CompareRow['other'];
    oss: CompareRow['other'];
  },
  faq: CompareFaq[],
  notes: ComparePage['notes'],
): ComparePage {
  return {
    id,
    name,
    site,
    summary,
    notes,
    faq,
    rows: [
      { criterion: { de: 'Upload der Datei', en: 'File upload' }, neo: NEO.upload, other: other.upload },
      { criterion: { de: 'Wasserzeichen', en: 'Watermark' }, neo: NEO.watermark, other: other.watermark },
      { criterion: { de: 'Nutzungslimits', en: 'Usage limits' }, neo: NEO.limits, other: other.limits },
      { criterion: { de: 'Preis (öffentliche Stufe)', en: 'Price (public tier)' }, neo: NEO.price, other: other.price },
      { criterion: { de: 'Offline', en: 'Offline' }, neo: NEO.offline, other: other.offline },
      {
        criterion: { de: 'Schwärzung (echt / Overlay)', en: 'Redaction (true / overlay)' },
        neo: NEO.redact,
        other: other.redact,
      },
      { criterion: { de: 'Self-Hosting', en: 'Self-hosting' }, neo: NEO.selfhost, other: other.selfhost },
      {
        criterion: { de: 'Open Source der Engine', en: 'Engine open source' },
        neo: NEO.oss,
        other: other.oss,
      },
    ],
  };
}

export const COMPARE_PAGES: Record<CompareId, ComparePage> = {
  ilovepdf: page(
    'ilovepdf',
    'iLovePDF',
    'https://www.ilovepdf.com/',
    {
      de: 'Web-Dienst zum Bearbeiten von PDFs. Die Verarbeitung läuft nach Upload auf den Servern des Anbieters (eigene Hilfe- und Datenschutztexte).',
      en: 'Web service for PDF editing. Processing happens after upload on the vendor’s servers (their help and privacy texts).',
    },
    {
      upload: { de: 'Ja, für die Web-Tools', en: 'Yes, for the web tools' },
      watermark: {
        de: 'Kostenlose Stufe: bei mehreren Werkzeugen bekanntes Wasserzeichen; Premium entfernt es',
        en: 'Free tier: watermark on several tools; Premium removes it',
      },
      limits: {
        de: 'Kostenlose Stufe mit Tages- und Dateigrenzen (Anbieter, Stand variabel)',
        en: 'Free tier with daily and file limits (vendor, figures change)',
      },
      price: {
        de: 'Kostenlose Stufe und kostenpflichtiges Abo (iLovePDF Premium / iLoveAPI)',
        en: 'Free tier and paid subscription (iLovePDF Premium / iLoveAPI)',
      },
      offline: {
        de: 'Primär Online; Desktop-/App-Clients nutzen den Cloud-Dienst',
        en: 'Primarily online; desktop/app clients use the cloud service',
      },
      redact: {
        de: 'Redact-Funktion wird angeboten; kein öffentlich dokumentiertes Verify nach Content-Entfernung',
        en: 'A redact feature is offered; no public verify-after-content-removal documentation',
      },
      selfhost: {
        de: 'Kein öffentliches Self-Hosting-Image; API ist ein Cloud-Produkt (iLoveAPI)',
        en: 'No public self-host image; the API is a cloud product (iLoveAPI)',
      },
      oss: { de: 'Nein (proprietär)', en: 'No (proprietary)' },
    },
    [
      {
        q: {
          de: 'Lädt iLovePDF Dateien auf einen Server?',
          en: 'Does iLovePDF upload files to a server?',
        },
        a: {
          de: 'Ja. Die Web-Werkzeuge verarbeiten hochgeladene Dateien auf der Infrastruktur von iLovePDF. Das steht in den öffentlichen Hilfe- und Datenschutztexten des Anbieters.',
          en: 'Yes. The web tools process uploaded files on iLovePDF infrastructure, as stated in the vendor’s public help and privacy texts.',
        },
      },
      {
        q: {
          de: 'Ist NeoTools eine Kopie von iLovePDF?',
          en: 'Is NeoTools a copy of iLovePDF?',
        },
        a: {
          de: 'Nein. NeoTools ist eine lokale Engine (Browser, CLI, Desktop, optional Self-Host). iLovePDF ist ein Cloud-SaaS. Die Tabelle listet nur diese Architekturunterschiede.',
          en: 'No. NeoTools is a local engine (browser, CLI, desktop, optional self-host). iLovePDF is cloud SaaS. The table only lists those architecture differences.',
        },
      },
    ],
    {
      de: 'Preise und Tageslimits ändert der Anbieter. Diese Seite nennt keine Euro-Beträge.',
      en: 'The vendor changes prices and daily limits. This page does not quote euro amounts.',
    },
  ),
  smallpdf: page(
    'smallpdf',
    'Smallpdf',
    'https://smallpdf.com/',
    {
      de: 'Web-Dienst für PDF- und Office-Konvertierung. Dateien werden zur Verarbeitung übertragen (Datenschutz- und Produktdokumentation des Anbieters).',
      en: 'Web service for PDF and office conversion. Files are transferred for processing (vendor privacy and product documentation).',
    },
    {
      upload: { de: 'Ja, für die Web-Tools', en: 'Yes, for the web tools' },
      watermark: {
        de: 'Kostenlose Stufe: typischerweise ohne dauerhaftes Wasserzeichen, mit Nutzungsgrenzen',
        en: 'Free tier: typically no permanent watermark, with usage caps',
      },
      limits: {
        de: 'Kostenlose Stufe mit Tageslimit; Pro hebt das Limit auf',
        en: 'Free tier with a daily cap; Pro lifts the cap',
      },
      price: {
        de: 'Kostenlose Stufe und Smallpdf Pro (Abo)',
        en: 'Free tier and Smallpdf Pro (subscription)',
      },
      offline: {
        de: 'Primär Online; es gibt Desktop-Clients mit Cloud-Anbindung',
        en: 'Primarily online; desktop clients exist with cloud connectivity',
      },
      redact: {
        de: 'Redact in kostenpflichtigen Plänen; Verfahren nicht als lokale Content-Entfernung mit Verify dokumentiert',
        en: 'Redact on paid plans; not documented as local content removal with verify',
      },
      selfhost: { de: 'Kein öffentliches Self-Hosting-Image bekannt', en: 'No public self-host image known' },
      oss: { de: 'Nein (proprietär)', en: 'No (proprietary)' },
    },
    [
      {
        q: {
          de: 'Braucht Smallpdf einen Upload?',
          en: 'Does Smallpdf require an upload?',
        },
        a: {
          de: 'Ja. Die Browser-Werkzeuge senden die Datei an die Server von Smallpdf. Das folgt aus dem Produktmodell und den Datenschutztexten.',
          en: 'Yes. The browser tools send the file to Smallpdf servers. That follows from the product model and the privacy texts.',
        },
      },
      {
        q: {
          de: 'Gibt Smallpdf die Dateien frei ohne Konto?',
          en: 'Does Smallpdf process files without an account?',
        },
        a: {
          de: 'Eine kostenlose Stufe existiert. Anzahl der Vorgänge pro Tag ist begrenzt; genaue Zahlen ändert der Anbieter.',
          en: 'A free tier exists. Daily operations are capped; exact numbers change with the vendor.',
        },
      },
    ],
    {
      de: 'Smallpdf nennt Speicherdauer und TLS in den eigenen Datenschutztexten. Das ändert nichts am Upload.',
      en: 'Smallpdf describes retention and TLS in its own privacy texts. That does not change the upload.',
    },
  ),
  'adobe-acrobat': page(
    'adobe-acrobat',
    'Adobe Acrobat',
    'https://www.adobe.com/acrobat.html',
    {
      de: 'Desktop- und Cloud-Produktfamilie (Reader kostenlos, Standard/Pro und Acrobat online kostenpflichtig). Viele Desktop-Funktionen laufen lokal; Cloud-Funktionen übertragen Dateien an Adobe.',
      en: 'Desktop and cloud product family (Reader free, Standard/Pro and Acrobat online paid). Many desktop features run locally; cloud features send files to Adobe.',
    },
    {
      upload: {
        de: 'Nein bei vielen Desktop-Funktionen; ja bei Acrobat online / Document Cloud',
        en: 'No for many desktop features; yes for Acrobat online / Document Cloud',
      },
      watermark: {
        de: 'Keine kostenlose-Web-Wasserzeichen-Stufe wie bei PDF-SaaS; Testversionen und Online-Limits separat',
        en: 'No free-web watermark tier like PDF SaaS; trials and online caps are separate',
      },
      limits: {
        de: 'Reader: Anzeigen. Bearbeiten, Schwärzen, PDF/A: lizenzierte Desktop- oder Cloud-Pläne',
        en: 'Reader: viewing. Edit, redact, PDF/A: licensed desktop or cloud plans',
      },
      price: {
        de: 'Reader frei; Acrobat Standard/Pro und Enterprise als Abo oder Volumenlizenz',
        en: 'Reader free; Acrobat Standard/Pro and Enterprise as subscription or volume license',
      },
      offline: {
        de: 'Ja für installiertes Acrobat (viele Werkzeuge); Cloud-Dienste brauchen Netz',
        en: 'Yes for installed Acrobat (many tools); cloud services need a network',
      },
      redact: {
        de: 'Acrobat Pro: dokumentierte echte Redaction (Content entfernen), plus Sanitize',
        en: 'Acrobat Pro: documented true redaction (content removal), plus sanitize',
      },
      selfhost: {
        de: 'Kein offenes Docker-Image der Engine; Enterprise über Adobe-Verträge',
        en: 'No open Docker image of the engine; enterprise via Adobe contracts',
      },
      oss: { de: 'Nein (proprietär)', en: 'No (proprietary)' },
    },
    [
      {
        q: {
          de: 'Kann Acrobat offline schwärzen?',
          en: 'Can Acrobat redact offline?',
        },
        a: {
          de: 'Acrobat Pro auf dem Rechner kann Dateien lokal schwärzen. Adobe dokumentiert das als Entfernen von Inhalt, nicht als Overlay. Cloud-Funktionen sind getrennt.',
          en: 'Acrobat Pro on the machine can redact files locally. Adobe documents that as content removal, not overlay. Cloud features are separate.',
        },
      },
      {
        q: {
          de: 'Ist Adobe Reader dasselbe wie NeoTools?',
          en: 'Is Adobe Reader the same as NeoTools?',
        },
        a: {
          de: 'Nein. Reader ist ein Anzeigeprogramm. Bearbeiten, Schwärzen und PDF/A liegen in kostenpflichtigen Acrobat-Plänen oder in NeoTools lokal.',
          en: 'No. Reader is a viewer. Editing, redaction and PDF/A sit in paid Acrobat plans or locally in NeoTools.',
        },
      },
    ],
    {
      de: 'Adobe-Produktnamen und Plan-Zuschnitte ändern sich. Quelle: öffentliche Acrobat-Produktseiten.',
      en: 'Adobe product names and plan cuts change. Source: public Acrobat product pages.',
    },
  ),
};

export function comparePath(locale: Locale, id: CompareId): { de: string; en: string; current: string } {
  const de = `/vergleich/${id}`;
  const en = `/en/compare/${id}`;
  return { de, en, current: locale === 'de' ? de : en };
}

export function compareJsonLd(locale: Locale, page: ComparePage) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map((item) => ({
      '@type': 'Question',
      name: item.q[locale],
      acceptedAnswer: { '@type': 'Answer', text: item.a[locale] },
    })),
  };
}
