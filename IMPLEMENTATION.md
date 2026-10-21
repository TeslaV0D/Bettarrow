# Implementierungsstand

Stand: 2026-10-21 · Version 1.2.0

## Status nach Bereichen

| Bereich | Status | Anmerkungen |
| --- | --- | --- |
| Fundament (Schema, Migrationen, Auth, Designsystem, Navigation, Docker) | ✅ fertig | Healthchecks, unprivilegierter Container |
| Deployment (GitHub Actions → GHCR → Portainer CE) | ✅ fertig | CI testet, baut und veröffentlicht `ghcr.io/teslav0d/bettarrow:{main,sha-<commit>}`. `compose.yaml` zieht das Image (`pull_policy: always`), mit einmaligem `migrate`-Job und Named Volumes. Keine Secrets im Repo. Siehe [Deployment-Einrichtung](#deployment-einrichtung) |
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

## Ausgeführte Prüfungen (2026-10-20/21)

| Prüfung | Ergebnis |
| --- | --- |
| `npm run typecheck` (tsc) | ✅ ohne Fehler |
| `npm run lint` (ESLint inkl. React-Hooks/Compiler-Regeln) | ✅ ohne Fehler |
| Unit-Tests (Vitest) | ✅ 55/55 – Datum/Zeitzone/DST/Jahreswechsel, Perioden, Last-/Volumenregeln, e1RM, Vorbelegung, PR-Erkennung, Muskelzuordnung, Kalender/Wiederholungen, Passwort-Hash (Node + Python-Generator), DB-URL mit Sonderzeichen-Passwort, Einheiten, Körpergewichtsmittel |
| Integrationstests (Vitest + PostgreSQL 16) | ✅ 38/38 – Migration auf leerer DB, Training starten (auch parallel ohne Duplikat), Vorbelegung (ignoriert aktive/verworfene Einheiten, unabhängig von Vorlagenänderungen), Sync (viele Sätze, Bearbeiten, Idempotenz, veraltete Snapshots, Gerätekonflikt, ungültige Daten), Körpergewicht-Snapshots, Abschluss/Verwerfen/Undo, PRs, Kalender (Planen, Verschieben, Wiederholungen, Monats-/Jahreswechsel, Verknüpfung), Vorlagen ändern ohne Historie zu verändern, Statistik (SQL ≙ TS-Regeln), Export→Import exakt identisch, atomarer Rollback, Backup-Rotation/Restore |
| `npm run build` (Produktion) | ✅ ohne Warnungen |
| E2E (Playwright, Chromium) gegen Produktionsbuild | ✅ 8/8 – Login/API-Schutz, kompletter Trainingsablauf inkl. Reload und Vorbelegung, Offline-Autosave, Reload direkt nach Eingabe, Kalender, Statistik/Profil/Export, Mobile ohne horizontales Scrollen, Touch-Ziele ≥ 44 px, keine Konsolenfehler |
| CI-Simulation (frischer Klon, frische PostgreSQL) | ✅ `npm ci`, typecheck, lint, Unit 55/55, Integration 38/38, `build` + `build:migrate` ohne `.env`. Image-Build mit Build-Args, Smoke-Schritt aus `ci.yml` unverändert ausgeführt (migrate exit 0, web healthy, `/api/health` meldet den Commit), E2E 8/8 gegen den Container. `actionlint` ohne Befund. |
| Docker Compose (`compose.yaml`) | ✅ Frischer Start: db healthy → migrate exited (0) → web healthy, DB-Port nicht veröffentlicht. Fehlendes `POSTGRES_PASSWORD` bricht mit klarer Meldung ab. E2E 8/8 gegen den Stack. Neues Image + `up -d` ersetzt die Container, migrate läuft erneut, Daten bleiben. `down`/`up` behält Daten. `backup-db.sh` → Daten löschen → `restore-db.sh` stellt den Stand wieder her. `web` verweigert den Start auf nicht migrierter DB. Sonderzeichen-Passwörter (`@ / # :`) funktionieren. |
| Portainer CE 2.45.2 + Registry (lokale Registry statt GHCR, lokaler Git-Server) | ✅ Git-Stack mit Variablen nur in Portainer zieht das Image, migriert, web healthy. Neues Image unter demselben Tag `main` veröffentlicht → *Pull and redeploy* **ohne** neuen Commit und **ohne** „Re-pull image“ zieht es dank `pull_policy: always`, die Daten bleiben. Rollback per `BETTARROW_TAG=sha-…` funktioniert. Registry nicht erreichbar → Deployment schlägt mit Meldung fehl, der laufende Stack bleibt unverändert. Stack löschen + als Web-Editor-Stack neu anlegen: Volumes und Daten bleiben, *Update the stack* zieht ebenfalls das neue Image. Ältere Prüfung (1.1.0, Build im Stack): GitOps-Polling hat in CE keinen Redeploy ausgelöst. |

Hinweise zur Testumgebung:
- Die Docker-Builds liefen in der Entwicklungs-Sandbox mit einem lokal gebauten `node:22-alpine`, das zusätzlich der dortigen TLS-Proxy-CA vertraut. Das Projekt-Dockerfile und `compose.yaml` sind dafür nicht verändert.
- Portainer lief lokal mit einer lokalen Registry anstelle von GHCR.
- Der echte Lauf von GitHub Actions und der Push nach GHCR passieren erst auf GitHub. Ihr Ergebnis steht unter *Actions* im Repository.
- Ein Deployment auf dem Zielserver ist **nicht** erfolgt.

## Deployment-Einrichtung

### Bestandsaufnahme (geprüft, nicht angenommen)

| Voraussetzung | Status vorher | Ergebnis |
| --- | --- | --- |
| npm-Skripte `typecheck`, `lint`, `test:unit`, `test:integration`, `test:e2e`, `build`, `build:migrate` | vorhanden (`package.json`) | unverändert von CI genutzt |
| Unit-/Integrations-/E2E-Tests | vorhanden (`tests/unit`, `tests/integration`, `tests/e2e`) | Integration braucht PostgreSQL (`TEST_DATABASE_URL`), E2E eine leere DB (`E2E_BASE_URL`, `E2E_PASSWORD`). Beides stellt CI bereit. |
| Healthcheck-Endpunkt `GET /api/health` | vorhanden (DB-Abfrage `select 1`, ohne Login erreichbar) | ergänzt um `version` und `revision` des Images |
| Docker-`HEALTHCHECK` | vorhanden (ruft `/api/health` im Container auf) | unverändert |
| Kontrollierte Migration | vorhanden (`migrate`-Job, Advisory-Lock, Schema-Prüfung in `web`) | unverändert. Läuft mit dem gezogenen Image bei jedem Deployment. |
| Dockerfile / compose.yaml | vorhanden (Build auf dem Server) | Image kommt jetzt aus GHCR. Lokaler Build über `compose.build.yaml`. |
| CI, Registry | fehlten | `.github/workflows/ci.yml`, GHCR |

### Was wo eingerichtet wird

1. **Repository (erledigt mit diesem Stand):**
   - `.github/workflows/ci.yml`
   - `compose.yaml` mit `image: ghcr.io/teslav0d/bettarrow:${BETTARROW_TAG:-main}` und `pull_policy: always`
   - `compose.build.yaml`
   - Dockerfile mit Build-Infos und OCI-Labels
2. **GitHub (einmalig prüfen):**
   - *Settings → Actions → General → Workflow permissions* darf auf „Read repository contents“ stehen bleiben. Der Workflow fordert `packages: write` selbst und nur im Image-Job an.
   - Nach dem ersten erfolgreichen Lauf unter *Packages* prüfen, dass `bettarrow` öffentlich ist. Sonst die Registry-Zugangsdaten in Portainer hinterlegen (README).
3. **Portainer CE (einmalig):** Git-Stack auf `refs/heads/main`, Compose path `compose.yaml`, Variablen `POSTGRES_PASSWORD` und `APP_PASSWORD_HASH` (README → „Erstes Deployment mit Portainer CE“).
4. **Pro Update:** CI grün abwarten → DB-Backup → *Pull and redeploy* → `revision` in `/api/health` prüfen.

### Entscheidungen

- **Getestetes Image = veröffentlichtes Image.** Der Workflow baut einmal, testet genau dieses Image (Compose-Stack + E2E) und pusht es danach. Es gibt keinen zweiten Build.
- **Zwei Tags.**
  - `sha-<commit>` ist unveränderlich und dient Rollback und Nachvollziehbarkeit.
  - `main` ist beweglich, damit Portainer ohne Konfigurationsänderung die neueste Version bekommt.
  - Der Commit-Tag wird zuerst gepusht. `main` zeigt also nie auf ein Image ohne Commit-Tag.
- **Minimale Token-Rechte.** Global gilt `contents: read`. `packages: write` gibt es nur im Image-Job, und gepusht wird nur bei Push/Dispatch auf `main`. Weitere Secrets gibt es nicht, Test-Passwörter werden pro Lauf zufällig erzeugt.
- **`pull_policy: always` statt Portainer-„Re-pull image“.** Das funktioniert in CE für Git- und Web-Editor-Stacks und ist getestet.
- **Kein Webhook, kein Auto-Deploy.** Bewusst manuell, siehe README → „Updates“.

## Bekannte Einschränkungen

- **Kein Service Worker**: Offline-Toleranz gilt für eine bereits geöffnete Trainingsseite. Ein vollständiges Neuladen *ohne* Netz kann die App nicht laden; die Eingaben bleiben lokal gespeichert und werden beim nächsten Öffnen mit Verbindung synchronisiert.
- **Benachrichtigungen** am Pausenende funktionieren, solange der Tab aktiv ist bzw. der Browser Hintergrund-Timer zulässt. Ohne Web-Push (bewusst keine externen Dienste) können mobile Browser im Hintergrund verzögern; Ton/Vibration erfolgen beim Zurückkehren.
- **Ruhezeit** lässt sich pro Übung (im Training und in der Vorlage) anpassen, nicht pro einzelnem Satz.
- **Mehrere Geräte gleichzeitig**: Konflikte werden erkannt und müssen manuell entschieden werden (kein automatisches Zusammenführen).
- **Import** ersetzt alle Daten; ein selektiver Import/Merge ist nicht vorgesehen.
- **Übungsbilder**: Datenfeld vorhanden, aber kein Upload und keine mitgelieferten Bilder.
- **Körperkarte**: stilisierte Darstellung; eigene Muskelgruppen erscheinen in Statistiken, aber nicht auf der Figur. Seitliche Bauchmuskeln sind nur in der Vorderansicht abgebildet.
- **Login-Rate-Limit** wird im Speicher gehalten (Reset bei Neustart).
- **Eine Instanz pro Docker-Host**: Container- und Volume-Namen sind fest (`bettarrow-*`).
- **Kein automatisches Deployment**: Portainer CE erkennt neue Images nicht selbst (GitOps-Polling ohne Wirkung im Test, Webhooks/Image-Polling nur BE). Updates per *Pull and redeploy*, dabei sorgt `pull_policy: always` für das neue Image.
- **Image nur für `linux/amd64`**: für ARM-Server müsste der Workflow um QEMU/`platforms` erweitert werden.
- **Migrationen nur vorwärts**: ein Rollback über eine Schemaänderung hinweg braucht den DB-Dump von vor dem Update.
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
