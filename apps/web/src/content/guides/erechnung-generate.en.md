---
title: Generate an e-invoice
locale: en
tool: dach-erechnung-generate
formats:
  - xml
  - pdf
  - csv
updated: "2026-09-14"
description: CII, UBL or Factur-X (PDF/A-3b) from a form, JSON or CSV, then validation.
---

`dach-erechnung-generate` builds invoices locally. With no file, the form values apply. JSON and CSV files create one or more invoices. PNG/JPEG with a matching name is used as a logo.

**Main options** (`invoiceDataSchema` plus `autoVerify`).

- `profile`: `MINIMUM`, `BASIC`, `EN16931`, `XRECHNUNG` (default).
- `syntax`: `cii`, `ubl`, `both`, `hybrid` (default `hybrid` = CII plus Factur-X PDF).
- `invoiceNumber`, `issueDate`, `dueDate`, `deliveryDate`, `currency`, `typeCode` (default `380`).
- `taxMode`: `standard19`, `reduced7`, `zero`, `reverse13b`, `kleinunternehmer`.
- `seller` / `buyer`: `name`, `street`, `zip`, `city`, `country`, `vatId`, `email`, `iban`, `bic`, `leitwegId`.
- `lines[]`: `name`, `qty`, `unit` (default `C62`), `net`, `vatRate`.
- `paymentTerms`, `skontoPercent`, `skontoDays`, `note`.
- `autoVerify` (default `true`): writes `{stem}-validate.json`.

**CSV columns.** `invoiceNumber`/`nummer`, `seller`, `iban`, `buyer`, `leitwegId`, `name`, `qty`, `net`, `vatRate`.

Read the validate report before sending.
