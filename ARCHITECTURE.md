# Architektur

## Überblick

```
Browser (React 19, Client Components nur wo interaktiv)
   │  HTML/RSC          │ Server Actions (zod-validiert)     │ fetch keepalive (Autosave)
   ▼                    ▼                                    ▼
Next.js 16 App Router (Node.js, standalone) ── proxy.ts (Cookie-Gate)
   │  Server Components lesen direkt über Drizzle
   │  src/server/services/*  (Domänenlogik, DB injiziert → testbar)
   ▼
PostgreSQL 16 (Volume bettarrow-db-data)  /backups (Volume bettarrow-backups, JSON .gz)
```

Ein App-Prozess, eine Datenbank, keine weiteren Dienste. Beim Serverstart (`instrumentation.ts`) wird die Konfiguration geprüft und der Backup-Scheduler gestartet. Migrationen laufen in Produktion **nicht** im App-Prozess, sondern im Deployment-Job `migrate` (siehe [Deployment](#deployment)). Die App prüft beim Start nur, ob das Schema aktuell ist, und beendet sich sonst.

## Technologieentscheidungen

| Bereich | Wahl | Begründung |
| --- | --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, `output: standalone`) | Server Components liefern fertige Daten ohne Client-Fetch-Kaskaden; ein Deployable; kleines Docker-Image. |
| Rendering | dynamisch, ohne `cacheComponents` | Private App, jede Seite ist nutzerspezifisch und aktuell; einfacher und vorhersehbarer als PPR/`use cache`. |
| DB / ORM | PostgreSQL 16 + Drizzle ORM + postgres.js | Kein Engine-Binary, SQL-nah (DISTINCT ON, FILTER, partielle Unique-Indizes), reproduzierbare SQL-Migrationen in `drizzle/`. |
| Validierung | zod v4 | Gemeinsame Schemas für Client und Server (`src/lib/*-schema.ts`). |
| UI | Tailwind v4, eigene Komponenten nach shadcn-Muster auf Radix (Dialog, Dropdown), Lucide-Icons, Sonner (Toasts/Undo) | Wenige, zugängliche Primitives statt großer Komponentenbibliothek. Native `<select>` für mobile Bedienbarkeit. |
| Diagramme | eigene SVG/HTML-Charts (`src/components/charts`) | Keine Chart-Bibliothek nötig (~5 KB statt >100 KB), eine Serie je Diagramm (eine Achse), Hover/Tap-Tooltips. |
| Körperkarte | eigenes SVG (`src/components/body`) | Muskelpfade per Muskel-ID adressierbar, gespiegelt, ohne 3D-Bibliothek. |
| Schrift | Geist (lokal über das npm-Paket) | Keine externen Font-Requests. |
| Auth | scrypt (node:crypto), DB-Sessions | Keine nativen Abhängigkeiten; Sitzungen überleben Neustarts und sind serverseitig widerrufbar. |
| Tests | Vitest (Unit + Integration gegen echte PostgreSQL), Playwright (E2E) | Kritische Logik (Datum, Volumen, Sync, Import) gegen die echte Datenbank geprüft. |

## Verzeichnisstruktur

```
src/
  app/                  Routen (App Router)
    (app)/              geschützter Bereich mit App-Shell: Dashboard, Kalender, Statistik, Profil,
                        Übungen, Vorlagen, Verlauf, /workout (aktives Training)
    api/                Route Handler: health, workouts/[id]/sync, export, import, backups/[name]
    login/
  components/           UI (ui/ = Designsystem-Bausteine; workout/, calendar/, body/, charts/ …)
  lib/                  reine, geteilte Logik (Daten, Training, Kalender, Formatierung, Schemas, Reducer)
  server/
    db/                 Schema, Client, Migration
    services/           Domänenlogik mit injizierter DB (workouts, calendar, templates, stats,
                        data-transfer, backups) – direkt integrationsgetestet
    queries/            Lese-Abfragen für Seiten (server-only)
    actions/            Server Actions (immer über run(): Auth + Fehlerbehandlung)
    seed/               Muskelgruppen, Equipment, Bewegungsmuster, 142 Übungen
  instrumentation*.ts   Start: Env-Prüfung, Schema-Prüfung (bzw. Migration mit MIGRATE_ON_START), Backup-Scheduler
  proxy.ts              Cookie-Gate (Weiterleitung zum Login); Sicherheitsgrenze ist der Server-Code
drizzle/                SQL-Migrationen
scripts/                hash-password.mjs/.py, migrate.ts (→ dist/migrate.mjs), backup-db.sh, restore-db.sh, dev-demo-data.ts
compose.yaml            Stack für Docker Compose und Portainer (db, migrate, web)
tests/                  unit/, integration/, e2e/
```

## Datenmodell

```
muscle_groups (id PK text, parent_id → muscle_groups, region)      equipment (id, category)      movement_patterns
        ▲ primary / secondary                                          ▲
exercises (id text PK, load_mode, bodyweight_factor, tracking, rep range, rest, notes, favorite, archived_at, is_custom, is_modified)
   ├─ exercise_secondary_muscles (exercise_id, muscle_id)
   ├─ template_exercises ── templates
   └─ workout_exercises ── workouts ── workout_sets
plan_rules (wöchentliche Wiederholung) ── planned_entries (Tagesplanung / Ruhetage / materialisierte Vorkommen)
workouts.planned_entry_id → planned_entries
body_weight_entries (date UNIQUE)      profile (Singleton)      settings (Singleton)      auth_sessions
```

Wichtige Regeln:

- **Zeit**: Instants als `timestamptz`; Kalendertage als `date` in der konfigurierten Zeitzone. Ein Training zählt für den Tag, an dem es gestartet wurde (`workouts.local_date`), Mitternacht/Monats-/Jahreswechsel und Sommerzeit sind dadurch eindeutig. Datumsarithmetik arbeitet auf UTC-Mitternacht (`src/lib/dates.ts`).
- **Gewichte** immer in kg (`numeric(…,3)`); lb ist reine Anzeige-/Eingabeumrechnung.
- **Historie ist unveränderlich gegenüber Stammdaten**: `workout_exercises` speichert Lastmodus, Faktor und Erfassungsart als Snapshot; `workout_sets` speichert das verwendete Körpergewicht und die berechnete Last. Vorlagen werden von Trainings nicht referenziert (nur `template_id` als Herkunft, `ON DELETE SET NULL`). Änderungen an Übung, Vorlage oder Profil ändern keine alten Ergebnisse.
- **Keine unbeabsichtigten Kaskaden**: Übungen und Muskelgruppen sind `ON DELETE RESTRICT` referenziert; verwendete Übungen werden archiviert statt gelöscht. Kaskaden gibt es nur innerhalb eines Aggregats (Training → Übungen → Sätze, Vorlage → Einträge).
- **Genau ein aktives Training**: partieller Unique-Index `workouts(status) WHERE status = 'active'`.
- **Abgeleitete Werte** (Volumen, Bestleistungen, Statistiken) werden nicht gespeichert, sondern aus den Sätzen berechnet.
- Indizes auf allen Fremdschlüsseln, `workouts(status, local_date)`, `planned_entries(date)`, eindeutige `(rule_id, occurrence_date)`.

## Kernabläufe

### Aktives Training & Autosave

1. `startWorkout` (Transaktion) liefert ein bestehendes aktives Training zurück oder legt eines an; Unique-Verletzungen bei parallelen Klicks werden abgefangen → nie Duplikate. Startet man eine heute geplante Vorlage, wird der Kalendereintrag verknüpft.
2. Der Client hält den Zustand in einem reinen Reducer (`src/lib/workout-reducer.ts`). Jede Änderung erhöht eine monotone **Revision** (Zeitstempel).
3. `use-workout-sync`: sichert den Zustand **synchron im Commit** in `localStorage`, sendet nach 700 ms einen **vollständigen Snapshot** an `POST /api/workouts/:id/sync`, sofort beim Verstecken/Verlassen der Seite (`keepalive`), mit exponentiellem Backoff bei Netzfehlern und erneut bei `online`.
4. Der Server übernimmt Snapshots idempotent (Upsert über client-generierte UUIDs, Entfernen fehlender Zeilen). Ältere oder doppelte Snapshots (`revision ≤ gespeichert`) werden ignoriert; ein Snapshot eines **anderen Geräts** auf veralteter Basis wird als Konflikt abgelehnt (UI bietet „Server-Version laden“ / „Meine Version behalten“).
5. Beim Laden wird ein lokaler Entwurf mit höherer Revision als der Serverstand automatisch wiederhergestellt.
6. Erst `finishWorkout` setzt den Status `completed` (und schließt den verknüpften Kalendereintrag). Verwerfen setzt `discarded` (Undo möglich).

### Vorbelegung („letzte Werte“)

`loadPrefill` sucht je Übung mit `DISTINCT ON (exercise_id)` die jüngste **abgeschlossene** Einheit, die mindestens einen abgehakten Satz der Übung enthält, und lädt deren abgehakte Sätze – zwei Abfragen für beliebig viele Übungen. Aktive und verworfene Einheiten werden nie verwendet. Beim Bearbeiten alter Trainings werden nur frühere Einheiten herangezogen. Regel für die Satzzahl: Sätze der letzten Einheit; verlangt die Vorlage mehr Arbeitssätze, wird der letzte Satz fortgeschrieben; ohne Historie: Zielsatzzahl der Vorlage mit unterem Wiederholungswert.

### Kalender

Einzeltermine und Ruhetage sind Zeilen in `planned_entries`. Wöchentliche Regeln (`plan_rules`) werden beim Lesen zu **virtuellen** Einträgen expandiert (`rule:<id>:<datum>`). Sobald man mit einem Vorkommen interagiert (verschieben, ausfallen lassen, entfernen, starten), wird es materialisiert (Unique auf `(rule_id, occurrence_date)`), wodurch das virtuelle Vorkommen entfällt. Anzeige-Zustände: geplant, abgeschlossen, verschoben (`moved_from`), nicht absolviert (geplant + Vergangenheit), ausgefallen (`skipped`), Ruhetag. Ein leerer Tag ist nie ein Ruhetag.

### Berechnungen

Definiert in `src/lib/training.ts` (die SQL-Variante in `services/stats.ts` wird per Test gegen die TS-Regeln abgeglichen):

- **Arbeitssatz**: abgehakt und kein Aufwärmsatz (Dropset/Versagen zählen).
- **Effektive Last**: extern = Gewicht; Körpergewicht = KG × Faktor; +Zusatz = KG × Faktor + Gewicht; −Unterstützung = max(0, KG × Faktor − Gewicht); „ohne Last“ = keine. Faktoren sind anpassbare Näherungen (z. B. Liegestütz 0,65).
- **Volumen** = Last × Wiederholungen je Arbeitssatz. Zeit-Übungen und Übungen ohne Last zählen nicht; Sätze ohne Last/Wiederholungen werden gezählt, aber als „unvollständig“ markiert. Körpergewichtslasten optional (Einstellung).
- **Muskelzuordnung**: 1 Satz für den primären Muskel, Faktor *w* (Einstellung, Standard 0,5) für jeden sekundären; direkte und indirekte Anteile werden getrennt ausgewiesen. In der Gruppenentwicklung wird indirekte Arbeit innerhalb derselben Hauptgruppe nicht doppelt gezählt.
- **Bestleistungen**: höchste Last, Wiederholungsrekord bei gleicher oder höherer Last, höchstes Satzvolumen, geschätztes 1RM (Epley, 1–12 Wdh., nicht für reine Körpergewichts-/lastlose Übungen, klar als Schätzung markiert). Die erste Einheit einer Übung erzeugt keine „Rekorde“.
- **Wochen**: Beginn konfigurierbar (Standard Montag); Serien zählen Wochen mit mindestens einem Training.

### Export, Import, Backup

`services/data-transfer.ts`: versioniertes JSON (`format: "bettarrow-export", version: 1`), Validierung von Struktur, Version und internen Referenzen; Import ersetzt alles in **einer Transaktion** und spielt danach die aktuellen Referenzdaten ein. `services/backups.ts`: gzip, atomares Schreiben (tmp + rename), Rotation, Schutz gegen Pfad-Traversal.

## Deployment

```
compose.yaml (Projekt "bettarrow")
  db       postgres:16-alpine  ── Volume bettarrow-db-data, kein Host-Port, Healthcheck pg_isready
  migrate  bettarrow-web:local ── node migrate.mjs, einmalig, restart "no"   (depends_on: db healthy)
  web      bettarrow-web:local ── node server.js, Port ${APP_PORT}          (depends_on: migrate completed successfully)
                                  Volume bettarrow-backups (oder BACKUP_PATH) → /backups
```

- **Ein Image, zwei Rollen.** `migrate` und `web` nutzen dasselbe lokal gebaute Image (`pull_policy: build`). Jedes `docker compose up` bzw. Portainer-*Pull and redeploy* baut aus dem ausgecheckten Stand neu. Eine Registry ist nicht nötig.
- **Kontrollierte Migrationen.**
  - `scripts/migrate.ts` wird beim Image-Build mit esbuild zu `dist/migrate.mjs` gebündelt, damit im Runtime-Image keine Dev-Abhängigkeiten nötig sind.
  - Das Skript wartet auf die Datenbank und wendet Migrationen + Referenzdaten auf **einer** Verbindung unter einem `pg_advisory_lock` an. Selbst ein versehentlich parallel gestarteter zweiter Job wartet daher nur.
  - `web` startet erst nach Exit-Code 0 (`service_completed_successfully`).
  - `getSchemaStatus()` vergleicht das Migrations-Journal im Image mit `drizzle.__drizzle_migrations`. Ist die DB älter als das Image, beendet sich `web` mit Hinweis statt auf einem veralteten Schema zu laufen.
  - Für die Entwicklung migriert `MIGRATE_ON_START=true` (Standard außerhalb von Compose) im App-Prozess.
- **Datenbank-URL.** Compose übergibt `POSTGRES_HOST/USER/PASSWORD/DB` statt einer fertigen URL. `server/database-url.ts` baut die URL mit URL-Encoding, deshalb funktionieren beliebige Sonderzeichen im Passwort. `DATABASE_URL` hat Vorrang, wenn gesetzt.
- **Feste Namen.** Containernamen (`bettarrow-db/-migrate/-web`) und Volume-Namen sind fest, unabhängig vom Stack-Namen in Portainer. Die Backup-/Restore-Skripte arbeiten deshalb ohne Compose-Projektverzeichnis. Volumes überleben Container-Ersatz, Updates und das Löschen des Stacks.
- **Keine relativen Bind-Mounts.** Für Portainer-Git-Stacks unzuverlässig (CE). Optionaler Host-Ordner nur über einen absoluten `BACKUP_PATH`.
- **Kein Docker-Hub-Frontend.** Das Dockerfile nutzt das eingebaute BuildKit-Frontend (keine `# syntax=`-Zeile), damit ein Build nur `node:22-alpine` und `postgres:16-alpine` benötigt.

## Sicherheit

- Sitzung wird in jeder Seite (`requirePageAuth`), jeder Server Action (`run()`) und jedem Route Handler geprüft; `proxy.ts` ist nur eine Komfort-Weiterleitung.
- Schreibende Route Handler prüfen zusätzlich Origin/Host (`server/request-guard.ts`).
- Login-Rate-Limit pro Client und global; konstante Verzögerung bei Fehlversuchen; Vergleich in konstanter Zeit.
- Keine Secrets im Repository; `.env` ist ignoriert; Backups mit Dateirechten `0600`.
- Container läuft als unprivilegierter Benutzer (UID 1001, `su-exec`), `tini` als Init.

## Performance

- Seiten laden Daten serverseitig in wenigen, parallelen Abfragen; keine N+1 (Prefill: 2 Abfragen, Verlauf/Statistik: Aggregation in SQL pro Trainingsübung).
- Übungssuche läuft clientseitig auf dem gesamten Katalog (≈ 150 Einträge, vorindiziert, `useDeferredValue`).
- Satzzeilen und Übungskarten sind memoisiert; der Pausentimer und die Laufzeitanzeige sind externe Stores (ein Intervall), unabhängig von Renderzyklen.
- Keine Chart- oder 3D-Bibliotheken, keine externen Ressourcen.
