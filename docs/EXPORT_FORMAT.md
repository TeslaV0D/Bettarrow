# Exportformat `bettarrow-export` (Version 1)

Vollständiger Datenaustausch als JSON (UTF-8). Automatische Backups sind dieselbe Datei, gzip-komprimiert (`.json.gz`). Der Import akzeptiert beides.

## Grundregeln

- `format` ist immer `"bettarrow-export"`, `version` eine ganze Zahl. Die App importiert Versionen ≤ ihrer eigenen; neuere Dateien werden mit Hinweis abgelehnt.
- Zeitpunkte: ISO 8601 mit Zeitzone (`2026-10-20T17:03:12.000Z`). Kalendertage: `YYYY-MM-DD` (bezogen auf `settings.timezone`).
- Gewichte immer in **Kilogramm**, Dauer in Sekunden.
- IDs: Übungen, Muskelgruppen, Equipment und Bewegungsmuster haben stabile Text-IDs (Standarddaten z. B. `bench-press-barbell`, eigene `custom-…`); alle übrigen IDs sind UUIDs.
- Fehlende optionale Werte sind `null`, nicht weggelassen.

## Struktur

```jsonc
{
  "format": "bettarrow-export",
  "version": 1,
  "exportedAt": "2026-10-20T18:00:00.000Z",
  "settings": {
    "weightUnit": "kg", "heightUnit": "cm", "weekStart": 1, "timezone": "Europe/Berlin",
    "defaultRestSeconds": 90, "autoStartRestTimer": true, "restTimerSound": true, "keepScreenAwake": true,
    "effortMetric": "rir", "defaultBodyweightMode": "bodyweight_plus",
    "bodyweightInVolume": true, "secondaryMuscleWeight": 0.5
  },
  "profile": { "name": "…", "birthDate": null, "sex": null, "heightCm": 182, "targetWeightKg": null, "trainingLevel": null, "goals": null },
  "muscleGroups":     [{ "id": "chest", "name": "Brust", "parentId": null, "region": "upper", "sortOrder": 0, "isBuiltin": true }],
  "equipment":        [{ "id": "barbell", "name": "Langhantel", "category": "Freie Gewichte", "sortOrder": 0, "isBuiltin": true }],
  "movementPatterns": [{ "id": "horizontal_push", "name": "Horizontales Drücken", "sortOrder": 0, "isBuiltin": true }],
  "exercises": [{
    "id": "bench-press-barbell", "name": "Bankdrücken (Langhantel)", "aliases": ["Bench Press"],
    "description": "…", "instructions": "Zeile 1\nZeile 2",
    "primaryMuscleId": "chest", "secondaryMuscleIds": ["delts_front", "triceps"],
    "equipmentId": "barbell", "movementPatternId": "horizontal_push",
    "mechanic": "compound",            // compound | isolation
    "tracking": "reps",                // reps | duration
    "loadMode": "external",            // external | bodyweight | bodyweight_plus | bodyweight_minus | none
    "bodyweightFactor": 1, "repMin": 5, "repMax": 10, "restSeconds": 180,
    "notes": null, "imagePath": null, "isCustom": false, "isModified": false, "isFavorite": true,
    "archivedAt": null, "createdAt": "…", "updatedAt": "…"
  }],
  "templates": [{
    "id": "uuid", "name": "Push", "description": null, "notes": null, "createdAt": "…", "updatedAt": "…",
    "items": [{ "id": "uuid", "exerciseId": "bench-press-barbell", "position": 0, "targetSets": 3,
                "repMin": 6, "repMax": 10, "restSeconds": 150, "notes": null }]
  }],
  "planRules": [{ "id": "uuid", "kind": "workout", "templateId": "uuid", "title": "Push", "weekdays": [1, 4],
                  "startDate": "2026-10-01", "endDate": null, "createdAt": "…", "updatedAt": "…" }],
  "plannedEntries": [{ "id": "uuid", "date": "2026-10-25", "kind": "rest", "templateId": null, "title": "Ruhetag",
                       "notes": null, "status": "planned",   // planned | completed | skipped | cancelled
                       "movedFrom": null, "ruleId": null, "occurrenceDate": null, "createdAt": "…", "updatedAt": "…" }],
  "workouts": [{
    "id": "uuid", "name": "Push", "templateId": "uuid", "plannedEntryId": null,
    "status": "completed",             // active | completed | discarded
    "startedAt": "…", "endedAt": "…", "pausedAt": null, "pausedSeconds": 0, "localDate": "2026-10-09",
    "bodyweightKg": 80.4, "notes": null, "createdAt": "…", "updatedAt": "…",
    "exercises": [{
      "id": "uuid", "exerciseId": "bench-press-barbell", "position": 0, "notes": null, "restSeconds": 150,
      "tracking": "reps", "loadMode": "external", "bodyweightFactor": 1,   // Snapshot zum Trainingszeitpunkt
      "sets": [{
        "id": "uuid", "position": 0, "setType": "working",                 // warmup | working | dropset | failure
        "weightKg": 60,          // eingetragener Wert: externe Last / Zusatzgewicht / Unterstützung
        "reps": 8, "durationSeconds": null, "rir": 2, "rpe": null, "note": null,
        "completed": true, "completedAt": "…",
        "bodyweightKg": null,    // verwendetes Körpergewicht (nur Körpergewichtsmodi)
        "loadKg": 60             // berechnete effektive Last
      }]
    }]
  }],
  "bodyWeight": [{ "id": "uuid", "date": "2026-10-01", "weightKg": 80.4, "note": null, "createdAt": "…", "updatedAt": "…" }]
}
```

## Import-Verhalten

1. Prüfung von `format`/`version`, Struktur und Datentypen (zod) sowie aller Referenzen (Übungen, Muskelgruppen, Vorlagen, Kalendereinträge; höchstens ein aktives Training; ein Körpergewichtseintrag pro Tag).
2. Vorschau mit Anzahl der Datensätze, Bestätigung durch Eingabe von `ERSETZEN`.
3. Automatisches Sicherheits-Backup des aktuellen Stands.
4. In **einer Transaktion**: alle persönlichen Daten löschen, Inhalt der Datei einspielen. Bei jedem Fehler wird vollständig zurückgerollt.
5. Danach werden die Standarddaten der installierten App-Version ergänzt bzw. aktualisiert (nicht bearbeitete Standardübungen).

Bei künftigen Formatänderungen wird `version` erhöht und der Import erhält einen Migrationspfad für ältere Versionen.
