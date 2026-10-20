# Bettarrow

Selbst gehostetes Trainingstagebuch für Krafttraining – schnell im Gym, ruhig im Design, deine Daten bleiben auf deinem Server.

- **Aktives Training** mit Inline-Eingabe, Ein-Tap-Abhaken, automatischer Übernahme der Werte aus dem letzten Training, Pausentimer, Autosave mit Offline-Toleranz
- **Übungsdatenbank** mit 142 Übungen, Suche (auch nach englischen/alternativen Namen), kombinierbaren Filtern, Favoriten und eigenen Übungen
- **Vorlagen** (Push/Pull/Legs, Ganzkörper, …) und **Kalender** mit Ruhetagen, Verschieben und wöchentlichen Wiederholungen
- **Dashboard** mit Wochenübersicht und interaktiver Muskelkarte (vorne/hinten)
- **Statistik**: Volumen, Sätze, Kontinuität, Muskelgruppenanalyse, Fortschritt je Übung, Bestleistungen
- **Profil** mit Körpergewichtsverlauf, Einstellungen, JSON-Export/-Import und automatischen Backups

Keine Cloud, kein Tracking, keine externen Schriften oder APIs zur Laufzeit.

---

## Schnellstart

Voraussetzungen: Docker mit Compose-Plugin (v2), ca. 512 MB RAM im Betrieb. Der einmalige Image-Build braucht kurzzeitig mehr.

- **Portainer (Git-Stack):** siehe [Erstes Deployment mit Portainer](#erstes-deployment-mit-portainer-git-stack).
- **Docker Compose direkt:**

```bash
git clone <repo-url> bettarrow && cd bettarrow
cp .env.example .env && chmod 600 .env
python3 scripts/hash-password.py   # Ausgabe bei APP_PASSWORD_HASH in .env eintragen
openssl rand -hex 24               # als POSTGRES_PASSWORD in .env eintragen
docker compose up -d               # baut das Image, migriert, startet
docker compose ps                  # db + web "healthy", migrate "exited (0)"
```

Danach ist die App unter `http://<server-ip>:3000` erreichbar (Port über `APP_PORT`).

---

## Deployment

Bettarrow läuft vollständig in Docker: ein Stack aus drei Services in `compose.yaml`. Node.js auf dem Host ist nicht nötig, eine Registry oder CI auch nicht. Das Image wird beim Deployment direkt aus dem Repository gebaut.

| Service | Aufgabe | Lebensdauer |
| --- | --- | --- |
| `db` (`bettarrow-db`) | PostgreSQL 16, Daten im Volume `bettarrow-db-data` | dauerhaft, **kein** veröffentlichter Port |
| `migrate` (`bettarrow-migrate`) | wendet Migrationen + Übungsdatenbank an, beendet sich danach | einmalig pro Deployment, Exit-Code 0 = Erfolg |
| `web` (`bettarrow-web`) | die App, Port `APP_PORT` (Standard 3000) | dauerhaft, startet erst nach erfolgreichem `migrate` |

Start-Reihenfolge: `db` healthy → `migrate` läuft durch → `web` startet.
- Schlägt `migrate` fehl, startet `web` nicht. Eine halb migrierte App wird also nie ausgeliefert.
- Migrationen laufen immer genau einmal in genau einem Container, zusätzlich abgesichert durch einen PostgreSQL-Advisory-Lock.
- `web` migriert selbst nicht. Ist das Schema nicht aktuell, verweigert die App den Start mit einer klaren Meldung im Log.

> **Wichtig: Repository ≠ Image ≠ laufender Stack.** Ein `git push` ändert nur das Repository. Erst ein (Re-)Deployment in Portainer bzw. `docker compose up -d` baut daraus ein neues Image und ersetzt die laufenden Container. Ob eine Version wirklich läuft, zeigt nur der Stack selbst: Container-Status `healthy` und `GET /api/health`.

### Variablen

Secrets gehören **nie** ins Repository. `.env` ist in `.gitignore` und `.dockerignore` eingetragen. Alle Variablen sind in [`.env.example`](.env.example) dokumentiert.

| Variable | Pflicht | Standard | Beschreibung |
| --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | **ja** | – | Datenbank-Passwort, nur intern genutzt. Erzeugen z. B. mit `openssl rand -hex 24`. Sonderzeichen sind erlaubt. |
| `APP_PASSWORD_HASH` | **ja¹** | – | scrypt-Hash des Login-Passworts, siehe unten. Enthält kein `$` und lässt sich direkt einfügen. |
| `APP_PASSWORD` | ja¹ | – | Alternative: Klartext-Passwort (min. 8 Zeichen). Wird ignoriert, wenn ein Hash gesetzt ist. |
| `APP_PORT` | nein | `3000` | Port auf dem Host. |
| `APP_BIND` | nein | `0.0.0.0` | `127.0.0.1`, wenn nur ein lokaler Reverse Proxy zugreifen soll. |
| `DEFAULT_TIMEZONE` | nein | `Europe/Berlin` | Start-Zeitzone (später im Profil änderbar). |
| `POSTGRES_USER` / `POSTGRES_DB` | nein | `bettarrow` | Nur vor dem ersten Deployment ändern. |
| `SESSION_MAX_AGE_DAYS` | nein | `30` | Gültigkeit der Anmeldung (gleitend). |
| `COOKIE_SECURE` | nein | `auto` | `auto` = Secure-Cookie bei HTTPS (über `X-Forwarded-Proto`), `true`/`false` erzwingt. |
| `BACKUP_INTERVAL_HOURS` | nein | `24` | Intervall automatischer JSON-Backups, `0` deaktiviert. |
| `BACKUP_KEEP` | nein | `14` | Anzahl aufbewahrter automatischer Backups. |
| `BACKUP_PATH` | nein | Volume `bettarrow-backups` | **Absoluter** Host-Pfad (z. B. `/srv/bettarrow/backups`), wenn die JSON-Backups direkt auf dem Host liegen sollen. |

¹ Eines von beiden ist erforderlich. Ohne Passwort startet die App in Produktion nicht. Fehlt `POSTGRES_PASSWORD`, bricht schon das Deployment mit einer klaren Meldung ab.

**In Portainer müssen nur `POSTGRES_PASSWORD` und `APP_PASSWORD_HASH` gesetzt werden.** Alles andere ist optional.

**Passwort-Hash erzeugen.** Die Eingabe ist verdeckt, das Ergebnis ist eine Zeile `APP_PASSWORD_HASH=scrypt:…`. Drei Wege, je nachdem was gerade verfügbar ist:

```bash
python3 scripts/hash-password.py                          # nur Python 3 (z. B. Ubuntu-Host), kein Node nötig
docker exec -it bettarrow-web node scripts/hash-password.mjs   # im laufenden Container (z. B. Passwortwechsel)
npm run hash-password                                     # Entwicklungs-Checkout
```

Ohne Checkout auf dem Host reicht die einzelne Datei `scripts/hash-password.py` (aus GitHub herunterladen), sie hat keine Abhängigkeiten.

### Erstes Deployment mit Portainer (Git-Stack)

Getestet mit **Portainer CE 2.45.2** (Docker-Standalone-Umgebung, Ubuntu-Host). Benötigt werden Git-Stacks mit `build:`-Unterstützung, Umgebungsvariablen und Named Volumes. Das alles ist in Portainer CE enthalten.

1. **Portainer bereit?** Neuere Versionen (getestet: 2.45.2) verlangen bei der Ersteinrichtung ein Setup-Token. Es steht in `docker logs portainer`.
2. **Zugriff auf das Repository.** Ist das Repo privat, in GitHub einen *Fine-grained Personal Access Token* anlegen: nur dieses Repository, Berechtigung *Contents: Read-only*. Den Token nur in Portainer eintragen, nirgendwo committen.
3. **Stack anlegen:** *Stacks → Add stack*
   - Name: `bettarrow`
   - Build method: **Repository**
   - Repository URL: `https://github.com/<owner>/Bettarrow`
   - Authentication: aktivieren, Benutzername + Token (nur bei privatem Repo)
   - Repository reference: `refs/heads/main` (bzw. der Branch, den der Server verfolgen soll) oder ein Tag wie `refs/tags/v1.0.0`
   - Compose path: `compose.yaml`
   - Environment variables: `POSTGRES_PASSWORD` und `APP_PASSWORD_HASH` eintragen, optional `APP_PORT` usw. Alternativ eine lokal ausgefüllte Kopie von `.env.example` per *Load variables from .env file* hochladen.
   - *GitOps updates*: aus lassen (siehe [Updates](#updates)).
4. **Deploy the stack.** Portainer klont das Repository und baut das Image auf dem Host. Der erste Build dauert einige Minuten.
5. **Prüfen** (Portainer → *Containers*):
   - `bettarrow-db`: running, healthy
   - `bettarrow-migrate`: **exited (0)**. Das ist gewollt, der Job ist fertig. Log endet mit `[migrate] database is up to date`.
   - `bettarrow-web`: running, healthy
   - `http://<server-ip>:<APP_PORT>/api/health` liefert `{"status":"ok"}`; danach unter `http://<server-ip>:<APP_PORT>` anmelden.

Hinweise zu Portainer:
- Keine relativen Bind-Mounts. Relative Pfade wie `./backups` funktionieren bei Git-Stacks in Portainer CE nicht zuverlässig (*relative path volumes* sind eine Business-Edition-Funktion). Deshalb arbeitet `compose.yaml` nur mit Named Volumes. Wer die Backups als Ordner auf dem Host will, setzt `BACKUP_PATH` auf einen **absoluten** Pfad.
- Volumes und Container haben feste Namen (`bettarrow-*`), unabhängig vom Stack-Namen. Deshalb läuft pro Docker-Host nur eine Instanz.
- Logs: Portainer → Container → *Logs*, bzw. `docker logs bettarrow-web`.

### Alternative ohne Portainer-Git-Stack

Wenn Git-Stacks oder Image-Builds in der vorhandenen Portainer-Umgebung nicht verfügbar sind, z. B. bei einem Agent ohne Build-Rechte:

**Docker Compose direkt auf dem Host.** Das ist die einfachste Variante, der Stack erscheint in Portainer trotzdem als „limited“:

```bash
git clone https://github.com/<owner>/Bettarrow.git /opt/bettarrow && cd /opt/bettarrow
cp .env.example .env && chmod 600 .env    # POSTGRES_PASSWORD und APP_PASSWORD_HASH eintragen
docker compose up -d                      # baut das Image, migrate läuft, web startet
docker compose ps
```

**Image auf dem Host bauen + Web-Editor-Stack:**
1. `docker build -t bettarrow-web:local .` im Checkout ausführen.
2. Inhalt von `compose.yaml` in Portainer als *Web editor*-Stack einfügen.
3. Dort bei `x-app-image` den Block `build:` entfernen und `pull_policy: never` setzen.

Updates bedeuten dann: neu bauen, danach den Stack in Portainer *Update the stack*.

### Updates

Ablauf für jede neue Version:

1. **Backup** der Datenbank (siehe [Datenbank-Dump](#2-datenbank-dump-pg_dump)). Migrationen laufen nur vorwärts.
2. Änderungen auf den Branch pushen, den der Stack verfolgt. *Das ist noch kein Deployment.*
3. **Portainer:** *Stacks → bettarrow → Editor → Pull and redeploy*. Mit **Docker Compose:** `git pull && docker compose up -d`.
   - Portainer holt den neuen Stand des Repositorys.
   - Wegen `pull_policy: build` wird das Image **neu gebaut**.
   - `migrate` läuft erneut und spielt neue Migrationen ein.
   - `web` wird ersetzt.
   - Die Daten in den Volumes bleiben unverändert.
4. **Kontrollieren:** `bettarrow-migrate` exited (0), `bettarrow-web` healthy, `/api/health` ok. Erst dann ist die neue Version deployt.

Von dir bearbeitete Standardübungen werden bei Updates **nicht** überschrieben.

**Automatische Updates?** Nicht zuverlässig in Portainer CE, daher ist der manuelle Redeploy der dokumentierte Weg.
- *GitOps updates* mit Polling lassen sich in CE zwar einschalten. Im Test mit CE 2.45.2 hat das Polling aber auch nach mehreren Intervallen keinen Redeploy ausgelöst.
- Webhooks, *Force redeployment* und *Re-pull image* sind laut Portainer-Oberfläche Business-Edition-Funktionen.

Mit Portainer BE kann man GitOps-Polling oder einen Webhook (z. B. aus einem GitHub-Workflow) nutzen. Dafür ist im Repository nichts zu ändern.

### Rollback

1. **Code zurück:** Im Stack-Editor die *Repository reference* auf den vorherigen Stand stellen, z. B. ein Tag `refs/tags/v1.0.0`, dann *Pull and redeploy*. Mit Compose: `git checkout v1.0.0 && docker compose up -d`. Getestet: Rollback auf ein Tag und zurück, Daten bleiben erhalten.
2. **Datenbank zurück**, nur nötig, wenn die neuere Version eine Migration eingespielt hat: Den vor dem Update erstellten Dump wiederherstellen (siehe [Wiederherstellung](#2-datenbank-dump-pg_dump)). Eine ältere App-Version startet zwar auf einem neueren Schema, ist aber nicht dafür gebaut.

Tipp: Jede deployte Version taggen (`git tag v1.1.0 && git push origin v1.1.0`). Dann ist ein Rollback nur ein Wechsel der Referenz.

### Persistenz

| Volume | Inhalt |
| --- | --- |
| `bettarrow-db-data` | PostgreSQL-Datenbank (alle Daten) |
| `bettarrow-backups` (oder `BACKUP_PATH`) | automatische JSON-Backups (`bettarrow-*.json.gz`) |

Getestet: Container ersetzen, Neustart, Update, Rollback, `docker compose down` + `up` und sogar *Stack löschen* + neu anlegen behalten die Daten.

> **Achtung:** Gelöscht werden die Daten nur, wenn **das Volume selbst** entfernt wird: `docker compose down -v`, `docker volume rm bettarrow-db-data` oder in Portainer unter *Volumes → Remove*. Vorher immer ein Backup ziehen.

---

## Zugriff, Sicherheit & Reverse Proxy

- **Einzelbenutzer-Login** mit Passwort (scrypt-Hash), Sitzungen in der Datenbank (nur der SHA-256-Hash des Tokens wird gespeichert), `HttpOnly`/`SameSite=Lax`-Cookie, Rate-Limiting bei Fehlversuchen.
- Jede Seite, Server Action und API-Route prüft die Sitzung serverseitig. Schreibende API-Routen prüfen zusätzlich die Herkunft (Origin), Server Actions haben Next.js-CSRF-Schutz.
- Alle Eingaben werden serverseitig mit zod validiert; Fehlermeldungen geben keine internen Details preis.
- Sicherheitsheader (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, …).

**Im LAN** reicht `http://<server-ip>:3000`. **Von außen** bitte nur über einen Reverse Proxy mit HTTPS (oder per VPN wie WireGuard/Tailscale) zugreifen und `APP_BIND=127.0.0.1` setzen. Der Proxy muss `Host`/`X-Forwarded-Host` und `X-Forwarded-Proto` weitergeben.

Caddy:

```caddy
training.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name training.example.com;
  # ssl_certificate …; ssl_certificate_key …;
  client_max_body_size 64m;   # für Datenimporte
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Hinweis: Das Rate-Limit verwendet `X-Forwarded-For` zur Zuordnung; zusätzlich gilt ein globales Limit für alle Fehlversuche.

---

## Daten, Backups & Wiederherstellung

Wo die Daten liegen, steht unter [Persistenz](#persistenz). Es gibt zwei unabhängige Backup-Wege.

### 1. App-Backups (JSON, automatisch)

- Alle `BACKUP_INTERVAL_HOURS` Stunden schreibt die App ein vollständiges, gzip-komprimiertes JSON-Backup in das Backup-Volume (`/backups` im Container). Die letzten `BACKUP_KEEP` bleiben erhalten.
- Manuell: *Profil → Daten → Backup jetzt erstellen*. Dort gibt es auch **Download** und Wiederherstellung (Bestätigung durch Eingabe von `ERSETZEN`).
- Vor jedem Import oder Restore wird automatisch ein Sicherheits-Backup (`…-vor-import.json.gz`) erstellt.
- Dateien auf den Host kopieren: `docker cp bettarrow-web:/backups/. ./bettarrow-backups/`. Mit `BACKUP_PATH` liegen sie ohnehin direkt im Host-Ordner.
- Format: siehe [docs/EXPORT_FORMAT.md](docs/EXPORT_FORMAT.md). Dieselben Dateien lassen sich unter *Profil → Daten → Import* hochladen.

### 2. Datenbank-Dump (pg_dump)

Mit Repository-Checkout auf dem Host. Die Skripte arbeiten über die Containernamen und funktionieren deshalb für Portainer- und Compose-Stacks gleichermaßen:

```bash
./scripts/backup-db.sh                       # → ./backups/db-<zeitstempel>.dump (wird auf Lesbarkeit geprüft)
./scripts/restore-db.sh ./backups/db-….dump  # verlangt die Eingabe RESTORE, ersetzt ALLE Daten
```

Ohne Checkout, also nur mit Docker auf dem Host, gehen dieselben Schritte von Hand:

```bash
# Backup
docker exec bettarrow-db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-privileges' > bettarrow-$(date +%F).dump

# Restore (ersetzt ALLE Daten)
docker stop bettarrow-web
docker exec bettarrow-db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE);" -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";"'
docker exec -i bettarrow-db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --exit-on-error' < bettarrow-2026-10-20.dump
docker start -a bettarrow-migrate   # bringt einen älteren Dump auf das aktuelle Schema
docker start bettarrow-web
```

Der Restore läuft so ab:
1. Web-Container stoppen.
2. Datenbank neu anlegen.
3. Dump einspielen.
4. Migrations-Job laufen lassen.
5. App wieder starten.

### Empfehlungen & Grenzen

- Vor **jedem Update** einen DB-Dump ziehen. Migrationen sind nicht umkehrbar.
- Ein Backup ist nur so gut wie seine Wiederherstellung: teste den Restore gelegentlich.
- Kopiere die Backups regelmäßig **auf ein anderes Gerät** (NAS, externe Platte, restic/borg). Backups auf demselben Datenträger schützen nicht vor Hardwaredefekten.
- JSON-Backups enthalten alle persönlichen Daten, aber keine Login-Sitzungen. DB-Dumps enthalten die komplette Datenbank.
- Ein JSON-Import ersetzt den kompletten Datenbestand (kein Zusammenführen). Er ist atomar: Bei einem Fehler bleibt alles unverändert.
- Ein Training, das während eines Backups läuft, wird mit seinem aktuellen Stand gesichert.

Getestet:
- Automatisiert: Export → Import ergibt exakt denselben Datenstand; fehlerhafte Importe werden vollständig zurückgerollt; Backup-Rotation.
- Manuell gegen den Compose-Stack: `backup-db.sh` → Daten löschen → `restore-db.sh` stellt den Stand wieder her.

---

## Bedienung – die wichtigsten Abläufe

- **Training starten**: Dashboard („Training starten“), grüner Play-Button in der Navigation, aus einer Vorlage oder direkt im Kalender. Läuft bereits ein Training, wird es fortgesetzt – es entsteht nie ein Duplikat.
- **Sätze**: Gewicht und Wiederholungen sind mit den Werten deines **letzten abgeschlossenen** Trainings dieser Übung vorbelegt; die Spalte „Vorher“ zeigt die Herkunft. Ein Tap auf ✓ hakt ab (leere Felder übernehmen dabei die Vorwerte). Ein Tap auf die Satznummer öffnet Satztyp (Aufwärmen, Dropset, Versagen), RIR/RPE, Notiz und Löschen.
- **Körpergewichtsübungen**: Je nach Übung trägst du Zusatzgewicht (+kg) oder Unterstützung (−kg) ein; die Gesamtlast wird aus dem beim Training gespeicherten Körpergewicht × Faktor berechnet und angezeigt.
- **Speichern**: Jede Eingabe wird sofort lokal gesichert und automatisch mit dem Server synchronisiert („Gespeichert“ im Kopfbereich). Offline wird lokal weitergespeichert und später synchronisiert.
- **Abschluss**: „Beenden“ zeigt eine Zusammenfassung; erst dann zählt das Training in Verlauf und Statistik. Nicht abgehakte Sätze werden verworfen oder übernommen – deine Wahl.

---

## Entwicklung

Voraussetzungen: Node.js ≥ 22, PostgreSQL 16.

```bash
npm install
cp .env.example .env    # DATABASE_URL und APP_PASSWORD setzen
npm run db:migrate      # Migrationen + Übungsdatenbank (npm run dev migriert zusätzlich selbst)
npm run dev             # http://localhost:3000
```

| Befehl | Zweck |
| --- | --- |
| `npm run typecheck` | TypeScript-Prüfung |
| `npm run lint` | ESLint |
| `npm test` | Unit- und Integrationstests (Integration braucht PostgreSQL, `TEST_DATABASE_URL`, Standard `postgres://bettarrow:bettarrow@localhost:5432/bettarrow_test`) |
| `npm run test:e2e` | Playwright-E2E gegen eine laufende Instanz (`E2E_BASE_URL`, `E2E_PASSWORD`; leere Datenbank verwenden) |
| `npm run build` | Produktionsbuild |
| `npm run db:generate` | neue Migration aus Schemaänderungen erzeugen (`drizzle/`) |
| `npx tsx scripts/dev-demo-data.ts` | **nur Entwicklung**: füllt eine leere DB mit 12 Wochen Beispieltraining |

Weitere Dokumentation: [ARCHITECTURE.md](ARCHITECTURE.md) · [IMPLEMENTATION.md](IMPLEMENTATION.md) · [CHANGELOG.md](CHANGELOG.md) · [docs/EXPORT_FORMAT.md](docs/EXPORT_FORMAT.md)

Gestalterisch inspiriert von modernen Fitness-Apps wie Arrow Fitness; Code, Grafiken (inkl. Körperfigur) und Texte sind eigenständig.
