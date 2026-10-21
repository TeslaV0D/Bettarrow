# Changelog

Alle relevanten Änderungen. Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## [1.2.0] – 2026-10-21

Deployment über GitHub Actions → GitHub Container Registry → Portainer CE.

### Hinzugefügt
- GitHub-Actions-Workflow `ci.yml`:
  - Checks: Typecheck, Lint, Unit-/Integrationstests mit PostgreSQL-Service, Produktionsbuild.
  - Docker-Image: wird mit dem echten Compose-Stack getestet (Migration, Health, Revision) und mit den Playwright-E2E-Tests geprüft.
  - Veröffentlichung nach GHCR als `main` und `sha-<commit>`, nur auf `main`, mit minimalen Token-Rechten.
- `compose.build.yaml` für lokale Image-Builds.
- `GET /api/health` meldet zusätzlich `version` und `revision` des laufenden Images.
- OCI-Labels (`source`, `version`, `revision`) im Image.
- Variablen `BETTARROW_IMAGE`, `BETTARROW_TAG` (Rollback per Commit-Tag), `BETTARROW_PULL_POLICY`.

### Geändert
- `compose.yaml` baut nicht mehr auf dem Server, sondern zieht `ghcr.io/teslav0d/bettarrow` mit `pull_policy: always`. Ein Portainer-Redeploy holt damit zuverlässig das neueste Image.
- README und IMPLEMENTATION beschreiben Einrichtung, Updates, Rollback und das Verhalten von Portainer CE.

## [1.1.0] – 2026-10-20

Deployment über GitHub → Portainer (Git-Stack) → Docker.

### Hinzugefügt
- `compose.yaml` für Docker Compose und Portainer-Git-Stacks: `db`, einmaliger `migrate`-Job, `web`. Feste Container- und Volume-Namen (`bettarrow-db-data`, `bettarrow-backups`), Log-Rotation, Pflichtvariablen mit klarer Fehlermeldung.
- `scripts/hash-password.py`: Passwort-Hash ohne Node.js erzeugen (kompatibel zum App-Format).
- `getSchemaStatus()`: Die App startet nicht auf einem veralteten Schema.
- Optionaler absoluter Host-Pfad für App-Backups (`BACKUP_PATH`).
- `public/robots.txt` (keine Indexierung).
- README: erstes Deployment mit Portainer, Variablen, Updates, Rollback, Backup/Restore mit und ohne Checkout, Alternativen ohne Git-Stack, Verhalten von Auto-Updates in Portainer CE.

### Geändert
- Migrationen laufen in Produktion nur noch im `migrate`-Job (gebündelt als `dist/migrate.mjs`), nicht mehr beim App-Start. In der Entwicklung bleibt `MIGRATE_ON_START` aktiv.
- Datenbankzugang über `POSTGRES_*`-Variablen, die URL wird mit Encoding gebaut. Sonderzeichen im DB-Passwort funktionieren.
- `backup-db.sh` / `restore-db.sh` arbeiten über Containernamen, also auch ohne Compose-Projektverzeichnis. Der Restore führt danach den Migrations-Job aus.
- Dockerfile ohne `# syntax=`-Zeile (kein zusätzlicher Image-Pull von Docker Hub) und ohne `VOLUME` (keine anonymen Volumes je Deployment).
- `docker-compose.yml` ersetzt durch `compose.yaml`. Backups liegen jetzt im Volume statt im Bind-Mount `./backups`.

### Behoben
- Image-Build aus einem frischen Git-Klon schlug fehl, weil der leere Ordner `public/` nicht versioniert war.
- Unbenutzte Imports (ESLint-Warnungen).

### Upgrade von 1.0.0
Das alte Compose-Projekt nutzte das Volume `bettarrow_db-data`. Vor dem Umstieg einen Dump ziehen (`./scripts/backup-db.sh` mit `DB_CONTAINER=<alter Containername>`), den neuen Stack starten und den Dump mit `./scripts/restore-db.sh` einspielen.

## [1.0.0] – 2026-10-20

Erste vollständige Version.

### Hinzugefügt
- Single-User-Login (scrypt-Hash, DB-Sessions, Rate-Limiting), Sicherheitsheader, serverseitige Validierung.
- Datenbankschema mit reproduzierbaren Migrationen, automatische Migration beim Start, 142 mitgelieferte Übungen.
- Übungsdatenbank: Suche inkl. Aliasse, kombinierbare Filter, Sortierung, Favoriten, zuletzt verwendet, eigene Übungen, Archivieren statt Löschen, Zurücksetzen bearbeiteter Standardübungen.
- Trainingsvorlagen: erstellen, bearbeiten, sortieren, duplizieren, löschen.
- Aktives Training: Vorbelegung mit den Werten der letzten abgeschlossenen Einheit, beliebig viele Sätze, Satztypen, RIR/RPE, Notizen, Übungen hinzufügen/entfernen/tauschen/sortieren, Pausieren, Pausentimer mit Ton/Vibration/Benachrichtigung, Körpergewichts-Lastmodelle, Autosave mit lokaler Sicherung, Offline-Queue und Konflikterkennung, Abschlussdialog, Verwerfen mit Undo.
- Verlauf mit Zusammenfassung, Bestleistungen und Muskelbeteiligung; Bearbeiten und erneutes Durchführen früherer Einheiten.
- Kalender: Monats-/Wochenansicht, Tagesdetails, Planen, Verschieben, Ausfallen lassen, Ruhetage, wöchentliche Wiederholungen.
- Dashboard mit Tagesplan, Wochenübersicht, interaktiver Muskelkarte, letzten Trainings und Bestleistungen.
- Statistik mit Zeiträumen, Trends, Kontinuität/Heatmap, Muskelgruppenanalyse (direkt/indirekt), Übungsfortschritt und Rekordtabellen.
- Profil, Körpergewichtshistorie mit Diagramm und Durchschnitten, Einstellungen, eigene Kategorien.
- Versionierter JSON-Export/-Import, automatische Backups mit Rotation, pg_dump-Skripte.
- Docker-Image (standalone, unprivilegiert) und Compose-Setup mit Healthchecks.
- Unit-, Integrations- und E2E-Tests.
