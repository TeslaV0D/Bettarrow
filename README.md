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

Voraussetzungen: Docker mit Compose-Plugin (v2), ca. 512 MB RAM. Gebaut wird nichts auf dem Server: Das fertige Image kommt aus der GitHub Container Registry.

- **Portainer CE (empfohlen):** siehe [Erstes Deployment mit Portainer](#erstes-deployment-mit-portainer-ce).
- **Docker Compose direkt:**

```bash
mkdir -p /opt/bettarrow && cd /opt/bettarrow
curl -fsSLO https://raw.githubusercontent.com/TeslaV0D/Bettarrow/main/compose.yaml
curl -fsSL  https://raw.githubusercontent.com/TeslaV0D/Bettarrow/main/.env.example -o .env && chmod 600 .env
curl -fsSLO https://raw.githubusercontent.com/TeslaV0D/Bettarrow/main/scripts/hash-password.py
python3 hash-password.py   # Ausgabe bei APP_PASSWORD_HASH in .env eintragen
openssl rand -hex 24       # als POSTGRES_PASSWORD in .env eintragen
docker compose up -d       # zieht das Image, migriert, startet
docker compose ps          # db + web "healthy", migrate "exited (0)"
```

Danach ist die App unter `http://<server-ip>:3000` erreichbar (Port über `APP_PORT`).

---

## Deployment

### Überblick: drei getrennte Zustände

```
git push main ──► GitHub Actions ──► ghcr.io/teslav0d/bettarrow:{sha-<commit>, main} ──► Portainer-Redeploy ──► laufender Stack
 (Repository)     (Tests + Build)     (Image in der Registry)                             (manuell)            (Server)
```

> **Repository ≠ Image ≠ laufender Stack.**
> - Ein `git push` ändert nur das Repository.
> - Ein grüner Workflow veröffentlicht nur ein Image.
> - Erst ein Redeploy in Portainer ersetzt die Container auf dem Server.
>
> Welche Version wirklich läuft, zeigt `GET /api/health`: `{"status":"ok","version":"1.2.0","revision":"<commit-sha>"}`.

Der Stack in `compose.yaml` besteht aus drei Services:

| Service | Aufgabe | Lebensdauer |
| --- | --- | --- |
| `db` (`bettarrow-db`) | PostgreSQL 16, Daten im Volume `bettarrow-db-data` | dauerhaft, **kein** veröffentlichter Port |
| `migrate` (`bettarrow-migrate`) | wendet Migrationen + Übungsdatenbank an, beendet sich danach | einmalig pro Deployment, Exit-Code 0 = Erfolg |
| `web` (`bettarrow-web`) | die App, Port `APP_PORT` (Standard 3000) | dauerhaft, startet erst nach erfolgreichem `migrate` |

`migrate` und `web` laufen aus demselben Image, also immer in derselben Version. Start-Reihenfolge: `db` healthy → `migrate` läuft durch → `web` startet.

- **Migrationen sind kontrolliert.** Sie laufen pro Deployment genau einmal in genau einem Container, zusätzlich abgesichert durch einen PostgreSQL-Advisory-Lock.
- **Kein Start auf halbem Schema.** Schlägt `migrate` fehl, startet `web` nicht. `web` migriert selbst nicht: Ist das Schema älter als das Image, verweigert die App den Start mit einer klaren Meldung im Log.
- **Healthcheck.** `/api/health` führt eine echte Datenbankabfrage aus. Docker prüft den Endpunkt im Container alle 30 s. Antwortet die DB nicht, liefert er `503` und der Container wird `unhealthy`.

### CI: GitHub Actions → GHCR

Der Workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) hat zwei Jobs.

**Job `checks`** läuft bei jedem Pull Request auf `main` und jedem Push auf `main`:
- `npm run typecheck`, `npm run lint`
- `npm run test:unit`, `npm run test:integration` (gegen einen PostgreSQL-16-Service)
- Produktionsbuild: `npm run build` und `npm run build:migrate`

**Job `image`** läuft nur, wenn `checks` grün ist:
1. Baut das Docker-Image.
2. Startet damit den echten Stack aus `compose.yaml` und prüft: `migrate` exit 0, `web` healthy, `/api/health` meldet den richtigen Commit.
3. Führt die Playwright-E2E-Tests (`npm run test:e2e`) gegen den Container aus.
4. **Nur bei Push auf `main`:** veröffentlicht genau dieses getestete Image als
   - `ghcr.io/teslav0d/bettarrow:sha-<7-stelliger Commit>`: unveränderlich, eindeutig pro Commit
   - `ghcr.io/teslav0d/bettarrow:main`: zeigt immer auf den neuesten erfolgreichen Build von `main`

Sicherheit:
- Das `GITHUB_TOKEN` hat global nur `contents: read`. Nur der Image-Job bekommt zusätzlich `packages: write`, und gepusht wird nur auf `main`.
- Es werden keine weiteren Secrets benötigt. Die Test-Passwörter erzeugt der Workflow bei jedem Lauf zufällig.
- Läufe auf `main` werden nacheinander abgearbeitet, nicht abgebrochen. Dadurch landet `:main` immer auf dem neuesten Commit.

Das Image ist für `linux/amd64` gebaut (übliche x86-Server). Für einen ARM-Server (z. B. Raspberry Pi) müsste der Workflow um `docker/setup-qemu-action` und `platforms: linux/amd64,linux/arm64` erweitert werden.

**Sichtbarkeit des Pakets.** Pakete, die ein Workflow mit dem `GITHUB_TOKEN` anlegt, übernehmen laut GitHub-Doku die Sichtbarkeit des Repositorys. Bei diesem öffentlichen Repo ist das Paket damit öffentlich, und Portainer kann es **ohne Zugangsdaten** ziehen.
- Nach dem ersten Lauf prüfen: GitHub → Profil → *Packages* → `bettarrow` → *Package settings* → *Danger Zone*: „Public“.
- Ist das Paket privat: in Portainer unter *Registries → Add registry → Custom registry* `ghcr.io` mit GitHub-Benutzer und einem *Personal Access Token (classic)* mit nur `read:packages` anlegen.

### Variablen

Secrets gehören **nie** ins Repository:
- `.env*` steht in `.gitignore` (Ausnahme: `.env.example`) und in `.dockerignore`.
- Der Workflow braucht keine eigenen Secrets.
- Alle Variablen sind in [`.env.example`](.env.example) dokumentiert.

| Variable | Pflicht | Standard | Beschreibung |
| --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | **ja** | – | Datenbank-Passwort, nur intern genutzt. Erzeugen z. B. mit `openssl rand -hex 24`. Sonderzeichen sind erlaubt. |
| `APP_PASSWORD_HASH` | **ja¹** | – | scrypt-Hash des Login-Passworts, siehe unten. Enthält kein `$` und lässt sich direkt einfügen. |
| `APP_PASSWORD` | ja¹ | – | Alternative: Klartext-Passwort (min. 8 Zeichen). Wird ignoriert, wenn ein Hash gesetzt ist. |
| `BETTARROW_TAG` | nein | `main` | Image-Tag: `main` folgt der neuesten Version, `sha-<commit>` pinnt eine bestimmte Version (Rollback). |
| `BETTARROW_IMAGE` | nein | `ghcr.io/teslav0d/bettarrow` | Image ohne Tag, z. B. für einen Fork. |
| `BETTARROW_PULL_POLICY` | nein | `always` | `always` = bei jedem Deployment auf ein neueres Image prüfen. `never` nur für lokal gebaute Images. |
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

**Passwort-Hash erzeugen.** Die Eingabe ist verdeckt, das Ergebnis ist eine Zeile `APP_PASSWORD_HASH=scrypt:…`:

```bash
python3 scripts/hash-password.py                               # nur Python 3 (z. B. Ubuntu-Host), keine Abhängigkeiten
docker exec -it bettarrow-web node scripts/hash-password.mjs   # im laufenden Container (z. B. Passwortwechsel)
npm run hash-password                                          # Entwicklungs-Checkout
```

### Erstes Deployment mit Portainer CE

Getestet mit **Portainer CE 2.45.2** (Docker-Standalone-Umgebung). Benötigt werden nur CE-Funktionen: Git-Stacks, Umgebungsvariablen und Named Volumes.

1. **Image vorhanden?** In GitHub unter *Actions* muss der Workflow „CI“ für den gewünschten Commit auf `main` grün sein. Die Zusammenfassung des Laufs listet die veröffentlichten Tags.
2. **Portainer bereit?** Neuere Versionen (getestet: 2.45.2) verlangen bei der Ersteinrichtung ein Setup-Token aus `docker logs portainer`.
3. **Stack anlegen:** *Stacks → Add stack*
   - Name: `bettarrow`
   - Build method: **Repository**
   - Repository URL: `https://github.com/TeslaV0D/Bettarrow` (öffentlich, keine Authentifizierung nötig)
   - Repository reference: `refs/heads/main`
   - Compose path: `compose.yaml`
   - Environment variables: `POSTGRES_PASSWORD` und `APP_PASSWORD_HASH`, optional `APP_PORT` usw. Alternativ eine lokal ausgefüllte Kopie von `.env.example` per *Load variables from .env file* hochladen.
   - *GitOps updates*: aus lassen (siehe [Updates](#updates)).
4. **Deploy the stack.** Portainer holt `compose.yaml` aus dem Repository und zieht das Image aus GHCR.
5. **Prüfen** (Portainer → *Containers*):
   - `bettarrow-db`: running, healthy
   - `bettarrow-migrate`: **exited (0)**. Das ist gewollt, der Job ist fertig. Log endet mit `[migrate] database is up to date`.
   - `bettarrow-web`: running, healthy
   - `http://<server-ip>:<APP_PORT>/api/health` liefert `status: ok` und die Commit-`revision`. Danach unter `http://<server-ip>:<APP_PORT>` anmelden.

Ein *Web-editor*-Stack mit dem Inhalt von `compose.yaml` funktioniert ebenfalls, auch das ist getestet. Der Git-Stack hat den Vorteil, dass Änderungen an `compose.yaml` beim Redeploy automatisch mitkommen.

Hinweise:
- Keine relativen Bind-Mounts: *Relative path volumes* sind in Portainer eine Business-Edition-Funktion. `compose.yaml` arbeitet deshalb nur mit Named Volumes. Wer die Backups als Ordner auf dem Host will, setzt `BACKUP_PATH` auf einen **absoluten** Pfad.
- Container und Volumes haben feste Namen (`bettarrow-*`), unabhängig vom Stack-Namen. Deshalb läuft pro Docker-Host nur eine Instanz.
- Logs: Portainer → Container → *Logs*, bzw. `docker logs bettarrow-web`.

### Updates

So erkennt Portainer CE ein neues Image zuverlässig: **Portainer CE fragt die Registry nicht von selbst ab.** Ein neues Image kommt nur bei einem Redeploy auf den Server. Damit das dann sicher passiert, steht in `compose.yaml` `pull_policy: always`:
- Jeder Redeploy fragt GHCR nach dem aktuellen Digest von `:main` und lädt ein neueres Image.
- Das funktioniert auch, wenn sich am Git-Stand nichts geändert hat.
- Der CE-Schalter *Re-pull image* wird dafür nicht gebraucht.

Ablauf für jede neue Version:

1. Änderung auf `main` pushen bzw. mergen. *Das ist noch kein Deployment.*
2. Warten, bis der Workflow „CI“ grün ist. Erst dann gibt es das neue Image. Ein Redeploy vorher würde nur das alte `:main` erneut ziehen.
3. **Backup** der Datenbank (siehe [Datenbank-Dump](#2-datenbank-dump-pg_dump)). Migrationen laufen nur vorwärts.
4. **Portainer:** *Stacks → bettarrow → Pull and redeploy* (Git-Stack) bzw. *Update the stack* (Web-Editor). **Compose:** `docker compose up -d`. Dabei passiert Folgendes:
   - Das neue Image wird gezogen.
   - `migrate` läuft und spielt neue Migrationen ein.
   - `web` wird ersetzt.
   - Die Volumes bleiben unverändert.
5. **Kontrollieren:** `bettarrow-migrate` exited (0), `bettarrow-web` healthy, und `/api/health` meldet als `revision` den erwarteten Commit. Erst dann ist die neue Version deployt.

Schlägt der Image-Pull fehl (GHCR nicht erreichbar, Tag existiert nicht), bricht Portainer das Deployment mit einer Fehlermeldung ab. Der laufende Stack bleibt dabei unverändert in Betrieb.

Von dir bearbeitete Standardübungen werden bei Updates **nicht** überschrieben.

**Automatisches Deployment** ist bewusst nicht eingerichtet. Optionen für später:
- **GitOps-Polling (CE):** Im Test mit CE 2.45.2 hat es keinen Redeploy ausgelöst. Außerdem reagiert es auf Git-Commits, nicht auf Images. Es würde also mit dem laufenden CI-Build konkurrieren und eventuell noch das alte Image ziehen.
- **Stack-Webhooks / Image-Polling:** laut Portainer-Oberfläche Business-Edition-Funktionen. Ein Webhook müsste aus GitHub erreichbar sein, also öffentlich. Ohne zusätzliche Absicherung (VPN, Reverse Proxy mit Auth) ist das nicht empfehlenswert.
- **Container-Updater wie Watchtower:** ersetzen nur einzelne Container und umgehen den `migrate`-Job. Bei Schemaänderungen würde `web` dann nicht starten.

### Rollback

1. **App zurück:** In Portainer die Variable `BETTARROW_TAG` auf den Commit-Tag der vorherigen Version setzen, z. B. `sha-1a2b3c4`, dann *Pull and redeploy* bzw. *Update the stack*. Die Tags stehen unter GitHub → *Packages* → `bettarrow` und in der Zusammenfassung jedes CI-Laufs. Zurück zur aktuellen Version: Variable entfernen oder auf `main` setzen.
2. **Datenbank zurück**, nur nötig, wenn die neuere Version eine Migration eingespielt hat: den vor dem Update erstellten Dump wiederherstellen (siehe [Wiederherstellung](#2-datenbank-dump-pg_dump)). Eine ältere App-Version startet zwar auf einem neueren Schema, ist aber nicht dafür gebaut.

Getestet: Rollback per `BETTARROW_TAG` und zurück, die Daten bleiben erhalten.

### Lokal bauen statt GHCR

Für Entwicklung, zum Testen vor dem Push oder wenn GHCR nicht erreichbar ist:

```bash
git clone https://github.com/TeslaV0D/Bettarrow.git && cd Bettarrow
cp .env.example .env && chmod 600 .env    # POSTGRES_PASSWORD und APP_PASSWORD_HASH eintragen
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

### Persistenz

| Volume | Inhalt |
| --- | --- |
| `bettarrow-db-data` | PostgreSQL-Datenbank (alle Daten) |
| `bettarrow-backups` (oder `BACKUP_PATH`) | automatische JSON-Backups (`bettarrow-*.json.gz`) |

- Die Volumes haben feste Namen und gehören zu keinem Container. Ein neues App-Image, ein Redeploy, Rollback, Neustart, `docker compose down` und sogar *Stack löschen* + neu anlegen lassen sie unverändert.
- `web` und `migrate` schreiben nicht in `bettarrow-db-data`. Nur der `db`-Container mountet es, und dessen Image (`postgres:16-alpine`) ist vom App-Image unabhängig.
- Getestet: Image-Update per Redeploy, Rollback, Stack löschen und neu anlegen. Die Daten blieben jeweils erhalten.

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
| `npm run build` | Produktionsbuild (`npm run build:migrate` bündelt zusätzlich den Migrations-Job) |
| `npm run db:generate` | neue Migration aus Schemaänderungen erzeugen (`drizzle/`) |
| `npx tsx scripts/dev-demo-data.ts` | **nur Entwicklung**: füllt eine leere DB mit 12 Wochen Beispieltraining |

CI (`.github/workflows/ci.yml`) führt dieselben Befehle bei jedem Pull Request und Push auf `main` aus.

Weitere Dokumentation: [ARCHITECTURE.md](ARCHITECTURE.md) · [IMPLEMENTATION.md](IMPLEMENTATION.md) · [CHANGELOG.md](CHANGELOG.md) · [docs/EXPORT_FORMAT.md](docs/EXPORT_FORMAT.md)

Gestalterisch inspiriert von modernen Fitness-Apps wie Arrow Fitness; Code, Grafiken (inkl. Körperfigur) und Texte sind eigenständig.
