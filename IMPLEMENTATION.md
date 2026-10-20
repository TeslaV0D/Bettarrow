# Implementierungsstand

Stand: 2026-10-20 · Version 1.0.0

## Status nach Bereichen

| Bereich | Status | Anmerkungen |
| --- | --- | --- |
| Fundament (Schema, Migrationen, Auth, Designsystem, Navigation, Docker) | ✅ fertig | Migration + Seed beim Start, Healthchecks, unprivilegierter Container |
| Übungsdatenbank & Suche | ✅ fertig | 142 Übungen, 22 Muskelgruppen (inkl. Untergruppen), 14 Equipment-Typen, 23 Bewegungsmuster; Suche über Name, Aliasse, Muskel, Equipment |
| Eigene Übungen / Kategorien | ✅ fertig | Anlegen, Bearbeiten, Archivieren; eigenes Equipment, Bewegungsmuster, Muskelgruppen |
| Trainingsvorlagen | ✅ fertig | Reihenfolge per Menü (hoch/runter) statt Drag & Drop |
| Aktives Training | ✅ fertig | siehe unten |
| Vorbelegung mit letzten Werten | ✅ fertig | nur abgeschlossene Einheiten, je Übung, 2 Abfragen |
| Autosave & Wiederaufnahme | ✅ fertig | lokal synchron + Server-Snapshot, offline-tolerant, Konflikterkennung |
| Pausentimer | ✅ fertig | Ruhezeit pro Übung (nicht pro einzelnem Satz) |
| Kalender & Ruhetage | ✅ fertig | Monat/Woche + Tagesdetails, Wiederholungen |
| Dashboard & Muskelkarte | ✅ fertig | Intensität = gewichtete Sätze / 10 pro Woche |
| Statistik & Übungsfortschritt | ✅ fertig | eine Kennzahl je Diagramm (eine Achse) |
| Bestleistungen | ✅ fertig | aus Daten abgeleitet, e1RM als Schätzung gekennzeichnet |
| Profil, Körpergewicht, Einstellungen | ✅ fertig | |
| Export / Import / Backups | ✅ fertig | Import ersetzt vollständig (kein Zusammenführen) |
| Tests | ✅ ausgeführt | siehe unten |

### Aktives Training – Funktionsumfang

Start aus Vorlage, Kalender, Dashboard oder frei · Übungen hinzufügen (Mehrfachauswahl, Suche, Favoriten, zuletzt verwendet), entfernen (mit Bestätigung), tauschen, sortieren, mehrfach hinzufügen · Notizen je Übung, Satz und Training · beliebig viele Sätze · Satztypen Arbeitssatz/Aufwärmen/Dropset/Versagen · RIR oder RPE · Ein-Tap-Abhaken (übernimmt bei leeren Feldern die Vorwerte) · Spalte „Vorher“ mit Datum der Herkunft · Körpergewicht-Lastmodelle (Zusatzgewicht, Unterstützung, Faktor) mit Anzeige der Gesamtlast · Trainingsdauer, Fortschritt, Volumen live · Pausieren/Fortsetzen · Bildschirm-Wachhalten (Wake Lock) · Abschlussdialog mit Zusammenfassung und Umgang mit offenen Sätzen · Verwerfen mit Undo · nachträgliches Bearbeiten abgeschlossener Trainings · „Erneut durchführen“.

## Ausgeführte Prüfungen (2026-10-20)

| Prüfung | Ergebnis |
| --- | --- |
| `npm run typecheck` (tsc) | ✅ ohne Fehler |
| `npm run lint` (ESLint inkl. React-Hooks/Compiler-Regeln) | ✅ ohne Fehler |
| Unit-Tests (Vitest) | ✅ 52/52 – Datum/Zeitzone/DST/Jahreswechsel, Perioden, Last-/Volumenregeln, e1RM, Vorbelegung, PR-Erkennung, Muskelzuordnung, Kalender/Wiederholungen, Passwort-Hash, Einheiten, Körpergewichtsmittel |
| Integrationstests (Vitest + PostgreSQL 16) | ✅ 38/38 – Migration auf leerer DB, Training starten (auch parallel ohne Duplikat), Vorbelegung (ignoriert aktive/verworfene Einheiten, unabhängig von Vorlagenänderungen), Sync (viele Sätze, Bearbeiten, Idempotenz, veraltete Snapshots, Gerätekonflikt, ungültige Daten), Körpergewicht-Snapshots, Abschluss/Verwerfen/Undo, PRs, Kalender (Planen, Verschieben, Wiederholungen, Monats-/Jahreswechsel, Verknüpfung), Vorlagen ändern ohne Historie zu verändern, Statistik (SQL ≙ TS-Regeln), Export→Import exakt identisch, atomarer Rollback, Backup-Rotation/Restore |
| `npm run build` (Produktion) | ✅ ohne Warnungen |
| E2E (Playwright, Chromium) gegen Produktionsbuild | ✅ 8/8 – Login/API-Schutz, kompletter Trainingsablauf inkl. Reload und Vorbelegung, Offline-Autosave, Reload direkt nach Eingabe, Kalender, Statistik/Profil/Export, Mobile ohne horizontales Scrollen, Touch-Ziele ≥ 44 px, keine Konsolenfehler |
| Docker | ✅ Image-Build, `docker compose up` (beide Services healthy, DB-Port nicht veröffentlicht), E2E 8/8 gegen den Container, Persistenz nach `down`/`up`, `backup-db.sh` → Daten löschen → `restore-db.sh` stellt den Stand wieder her, automatische JSON-Backups im Bind-Mount, `hash-password.mjs` im Container |

Hinweis zur Testumgebung: Der Docker-Build wurde in der Entwicklungs-Sandbox mit einem Basisimage gebaut, das zusätzlich der dortigen Proxy-CA vertraut (`--build-arg NODE_IMAGE=…`); das Projekt-Dockerfile selbst ist unverändert und nutzt `node:22-alpine`.

## Bekannte Einschränkungen

- **Kein Service Worker**: Offline-Toleranz gilt für eine bereits geöffnete Trainingsseite. Ein vollständiges Neuladen *ohne* Netz kann die App nicht laden; die Eingaben bleiben lokal gespeichert und werden beim nächsten Öffnen mit Verbindung synchronisiert.
- **Benachrichtigungen** am Pausenende funktionieren, solange der Tab aktiv ist bzw. der Browser Hintergrund-Timer zulässt. Ohne Web-Push (bewusst keine externen Dienste) können mobile Browser im Hintergrund verzögern; Ton/Vibration erfolgen beim Zurückkehren.
- **Ruhezeit** lässt sich pro Übung (im Training und in der Vorlage) anpassen, nicht pro einzelnem Satz.
- **Mehrere Geräte gleichzeitig**: Konflikte werden erkannt und müssen manuell entschieden werden (kein automatisches Zusammenführen).
- **Import** ersetzt alle Daten; ein selektiver Import/Merge ist nicht vorgesehen.
- **Übungsbilder**: Datenfeld vorhanden, aber kein Upload und keine mitgelieferten Bilder.
- **Körperkarte**: stilisierte Darstellung; eigene Muskelgruppen erscheinen in Statistiken, aber nicht auf der Figur. Seitliche Bauchmuskeln sind nur in der Vorderansicht abgebildet.
- **Login-Rate-Limit** wird im Speicher gehalten (Reset bei Neustart).
- **Körpergewichtsfaktoren** sind Näherungswerte (z. B. Liegestütz 0,65) und pro Übung anpassbar.

## Offene / mögliche Erweiterungen

- Supersätze (Gruppierung von Übungen) und Dropset-Ketten
- Progressionsvorschläge auf Basis der Historie (nur als bestätigbare Vorschläge)
- RIR/RPE-Auswertungen, weitere Körpermaße
- Service Worker für vollständigen Offline-Start, Web-Push für Timer im Hintergrund
- Drag & Drop für Reihenfolgen
- Merge-Import

## Technische Schulden

- Vorlagen speichern ihre Einträge per „ersetzen“; IDs der Vorlageneinträge ändern sich beim Speichern (für Trainings irrelevant, da nicht referenziert).
- Die Volumenregel existiert zweimal (TS für Live-Anzeige, SQL für Aggregation); ein Integrationstest stellt Gleichheit sicher.
- E2E-Tests erwarten eine leere Datenbank und laufen seriell.
