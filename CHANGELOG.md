# Changelog

Alle relevanten Änderungen. Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

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
