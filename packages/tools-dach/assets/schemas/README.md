# E-Invoice schemas (gitignored)

Run `node packages/tools-dach/scripts/fetch-schemas.mjs` to download official
UN/CEFACT CII, OASIS UBL 2.1 and KoSIT XRechnung artefacts.

Licenses (typically redistributable, not bundled by default):

- UN/CEFACT XML schemas — free reuse
- OASIS UBL 2.1 XSD — OASIS copyright, typically free
- KoSIT XRechnung Schematron — Apache-2.0
- CEN EN 16931 Schematron — check CEN licence before redistribution

Validation without these files uses the EN 16931 BT table and TypeScript BR rules.
