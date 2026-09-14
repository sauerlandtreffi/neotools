---
title: E-Rechnung erzeugen
locale: de
tool: dach-erechnung-generate
formats:
  - xml
  - pdf
  - csv
updated: "2026-09-14"
description: CII, UBL oder Factur-X (PDF/A-3b) aus Formular, JSON oder CSV, danach Validierung.
---

`dach-erechnung-generate` baut Rechnungen lokal. Ohne Datei gelten die Formularwerte. JSON- und CSV-Dateien erzeugen eine oder mehrere Rechnungen. PNG/JPEG mit passendem Namen wird als Logo genutzt.

**Wichtige Optionen** (Schema `invoiceDataSchema` plus `autoVerify`).

- `profile`: `MINIMUM`, `BASIC`, `EN16931`, `XRECHNUNG` (Default).
- `syntax`: `cii`, `ubl`, `both`, `hybrid` (Default `hybrid` = CII plus Factur-X-PDF).
- `invoiceNumber`, `issueDate`, `dueDate`, `deliveryDate`, `currency`, `typeCode` (Default `380`).
- `taxMode`: `standard19`, `reduced7`, `zero`, `reverse13b`, `kleinunternehmer`.
- `seller` / `buyer`: `name`, `street`, `zip`, `city`, `country`, `vatId`, `email`, `iban`, `bic`, `leitwegId`.
- `lines[]`: `name`, `qty`, `unit` (Default `C62`), `net`, `vatRate`.
- `paymentTerms`, `skontoPercent`, `skontoDays`, `note`.
- `autoVerify` (Default `true`): erzeugt `{stem}-validate.json`.

**CSV-Spalten.** `invoiceNumber`/`nummer`, `seller`, `iban`, `buyer`, `leitwegId`, `name`, `qty`, `net`, `vatRate`.

Erst den Validate-Report lesen, dann versenden.
