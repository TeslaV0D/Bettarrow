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

## Schnellstart (Docker Compose)

Voraussetzungen: Docker mit Compose-Plugin (v2), ca. 512 MB RAM.

```bash
git clone <repo-url> bettarrow && cd bettarrow
cp .env.example .env

# 1. Passwort-Hash erzeugen (Eingabe ist verdeckt) und in .env bei APP_PASSWORD_HASH eintragen
docker compose build web
docker compose run --rm --no-deps web node scripts/hash-password.mjs

# 2. In .env ein langes, zufälliges POSTGRES_PASSWORD setzen, z. B.:
openssl rand -hex 24

# 3. Starten
docker compose up -d
docker compose ps        # beide Services sollten "healthy" sein
```

Danach ist die App unter `http://<server-ip>:3000` erreichbar (Port über `APP_PORT`).

Beim Start werden Datenbank-Migrationen und die mitgelieferte Übungsdatenbank automatisch angewendet (mit Advisory-Lock, idempotent). Schlägt eine Migration fehl, beendet sich der Container und Docker startet ihn neu – es wird nie eine halb migrierte App ausgeliefert. Logs: `docker compose logs -f web`.

### Updates

```bash
git pull
docker compose up -d --build
```

Vorher empfiehlt sich ein Backup (`./scripts/backup-db.sh`). Migrationen laufen beim Start automatisch. Von dir bearbeitete Standardübungen werden bei Updates **nicht** überschrieben.

---

## Konfiguration (`.env`)

| Variable | Pflicht | Standard | Beschreibung |
| --- | --- | --- | --- |
| `APP_PASSWORD_HASH` | ja¹ | – | scrypt-Hash des Login-Passworts (`scripts/hash-password.mjs`). Enthält kein `$`, kann direkt eingefügt werden. |
| `APP_PASSWORD` | ja¹ | – | Alternative: Klartext-Passwort (min. 8 Zeichen). Wird ignoriert, wenn ein Hash gesetzt ist. |
| `POSTGRES_PASSWORD` | ja | – | Passwort der Datenbank (nur intern genutzt). |
| `POSTGRES_USER` / `POSTGRES_DB` | nein | `bettarrow` | Datenbank-Benutzer/-Name. |
| `APP_PORT` | nein | `3000` | Port auf dem Host. |
| `APP_BIND` | nein | `0.0.0.0` | `127.0.0.1`, wenn nur ein lokaler Reverse Proxy zugreifen soll. |
| `DEFAULT_TIMEZONE` | nein | `Europe/Berlin` | Start-Zeitzone (später im Profil änderbar). |
| `SESSION_MAX_AGE_DAYS` | nein | `30` | Gültigkeit der Anmeldung (gleitend). |
| `COOKIE_SECURE` | nein | `auto` | `auto` = Secure-Cookie bei HTTPS (über `X-Forwarded-Proto`), `true`/`false` erzwingt. |
| `BACKUP_INTERVAL_HOURS` | nein | `24` | Intervall automatischer JSON-Backups, `0` deaktiviert. |
| `BACKUP_KEEP` | nein | `14` | Anzahl aufbewahrter automatischer Backups. |

¹ Eines von beiden ist erforderlich. Ohne Passwort startet die App in Produktion nicht.

Die Datenbank veröffentlicht **keinen** Port nach außen; nur der Web-Container erreicht sie im internen Docker-Netz.

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

Persistente Daten:

| Ort | Inhalt |
| --- | --- |
| Docker-Volume `bettarrow_db-data` | PostgreSQL-Datenbank (alle Daten) |
| `./backups` (Bind-Mount) | automatische JSON-Backups (`bettarrow-*.json.gz`) und DB-Dumps aus `backup-db.sh` |

`docker compose down` behält die Daten. **`docker compose down -v` löscht das Datenbank-Volume!**

### 1. App-Backups (JSON, automatisch)

- Alle `BACKUP_INTERVAL_HOURS` Stunden schreibt die App ein vollständiges, gzip-komprimiertes JSON-Backup nach `./backups` und behält die letzten `BACKUP_KEEP`.
- Manuell: *Profil → Daten → Backup jetzt erstellen*. Dort auch Download und Wiederherstellung (Bestätigung durch Eingabe von `ERSETZEN`).
- Vor jedem Import/Restore wird automatisch ein Sicherheits-Backup (`…-vor-import.json.gz`) erstellt.
- Format: siehe [docs/EXPORT_FORMAT.md](docs/EXPORT_FORMAT.md). Dieselben Dateien lassen sich unter *Profil → Daten → Import* hochladen.

### 2. Datenbank-Dump (pg_dump)

```bash
./scripts/backup-db.sh                       # → ./backups/db-<zeitstempel>.dump (wird auf Lesbarkeit geprüft)
./scripts/restore-db.sh ./backups/db-….dump  # fragt nach Bestätigung, ersetzt ALLE Daten
```

Der Restore stoppt den Web-Container, legt die Datenbank neu an, spielt den Dump ein und startet die App wieder (fehlende Migrationen werden dabei automatisch nachgezogen).

### Empfehlungen & Grenzen

- Ein Backup ist nur so gut wie seine Wiederherstellung: teste den Restore gelegentlich (z. B. in einer zweiten Instanz mit anderem `name:`/Port).
- Kopiere `./backups` regelmäßig **auf ein anderes Gerät** (NAS, externe Platte, restic/borg). Backups auf demselben Datenträger schützen nicht vor Hardwaredefekten.
- JSON-Backups enthalten alle persönlichen Daten, aber keine Login-Sitzungen. DB-Dumps enthalten die komplette Datenbank.
- Ein JSON-Import ersetzt den kompletten Datenbestand (kein Zusammenführen) und ist atomar: Bei einem Fehler bleibt alles unverändert.
- Ein Training, das während eines Backups läuft, wird mit seinem aktuellen Stand gesichert.

Getestet (automatisiert): Export → Import ergibt exakt denselben Datenstand; fehlerhafte Importe werden vollständig zurückgerollt; Backup-Rotation. Manuell getestet: `backup-db.sh` → Daten löschen → `restore-db.sh` stellt den Stand wieder her.

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
npm run db:migrate      # Migrationen + Übungsdatenbank
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
