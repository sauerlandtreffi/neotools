---
title: E-Rechnung prüfen
locale: de
tool: dach-erechnung-validate
formats:
  - xml
  - pdf
updated: "2026-09-14"
description: XRechnung, ZUGFeRD und Factur-X lokal prüfen und als HTML, PDF oder Markdown anzeigen.
---

`dach-erechnung-validate` liest XML oder ein PDF mit eingebettetem CII/UBL. Geprüft werden Wohlgeformtheit, Profil, EN-16931-BT-Felder, ein Satz BR-Regeln und Arithmetik.

**Optionen.** Nur `locale` (`de`/`en`) für die Anzeige.

**Eingaben.** XML (`application/xml`, `text/xml`), JSON oder PDF. Mehrere Dateien nacheinander.

**Ausgabe je Datei.** `{stem}-report.json`, `{stem}.md`, `{stem}.html`, `{stem}-view.pdf`. Das View-PDF ist eine Darstellung, keine neue rechtsgültige Rechnung.

**Nicht tun.** Ein rotes Report-Feld ignorieren und die XML trotzdem an die Leitweg-ID schicken. Zuerst die Befunde schließen, dann erzeugen oder erneut prüfen.
