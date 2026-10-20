/**
 * Built-in reference data. IDs are stable and part of the export format —
 * never rename an existing id, only add new ones.
 */

export const MUSCLE_GROUPS = [
  { id: "chest", name: "Brust", parentId: null, region: "upper" },
  { id: "shoulders", name: "Schultern", parentId: null, region: "upper" },
  { id: "delts_front", name: "Vordere Schulter", parentId: "shoulders", region: "upper" },
  { id: "delts_side", name: "Seitliche Schulter", parentId: "shoulders", region: "upper" },
  { id: "delts_rear", name: "Hintere Schulter", parentId: "shoulders", region: "upper" },
  { id: "back", name: "Rücken", parentId: null, region: "upper" },
  { id: "lats", name: "Latissimus", parentId: "back", region: "upper" },
  { id: "traps", name: "Trapezmuskel", parentId: "back", region: "upper" },
  { id: "upper_back", name: "Oberer Rücken", parentId: "back", region: "upper" },
  { id: "lower_back", name: "Unterer Rücken", parentId: "back", region: "core" },
  { id: "biceps", name: "Bizeps", parentId: null, region: "upper" },
  { id: "triceps", name: "Trizeps", parentId: null, region: "upper" },
  { id: "forearms", name: "Unterarme", parentId: null, region: "upper" },
  { id: "core", name: "Bauch", parentId: null, region: "core" },
  { id: "abs", name: "Gerade Bauchmuskeln", parentId: "core", region: "core" },
  { id: "obliques", name: "Seitliche Bauchmuskeln", parentId: "core", region: "core" },
  { id: "glutes", name: "Gesäß", parentId: null, region: "lower" },
  { id: "quads", name: "Quadrizeps", parentId: null, region: "lower" },
  { id: "hamstrings", name: "Beinbeuger", parentId: null, region: "lower" },
  { id: "adductors", name: "Adduktoren", parentId: null, region: "lower" },
  { id: "abductors", name: "Abduktoren", parentId: null, region: "lower" },
  { id: "calves", name: "Waden", parentId: null, region: "lower" },
] as const;

export type BuiltinMuscleId = Exclude<(typeof MUSCLE_GROUPS)[number]["id"], "shoulders" | "back" | "core">;

export const EQUIPMENT = [
  { id: "barbell", name: "Langhantel", category: "Freie Gewichte" },
  { id: "dumbbell", name: "Kurzhantel", category: "Freie Gewichte" },
  { id: "ez_bar", name: "SZ-Stange", category: "Freie Gewichte" },
  { id: "kettlebell", name: "Kettlebell", category: "Freie Gewichte" },
  { id: "trap_bar", name: "Trap Bar", category: "Freie Gewichte" },
  { id: "plate", name: "Hantelscheibe", category: "Freie Gewichte" },
  { id: "landmine", name: "Landmine", category: "Freie Gewichte" },
  { id: "bodyweight", name: "Körpergewicht", category: "Körpergewicht" },
  { id: "machine", name: "Maschine", category: "Maschinen" },
  { id: "cable", name: "Kabelzug", category: "Kabelzug" },
  { id: "smith_machine", name: "Smith Machine", category: "Maschinen" },
  { id: "band", name: "Widerstandsband", category: "Widerstandsbänder" },
  { id: "medicine_ball", name: "Medizinball", category: "Sonstige" },
  { id: "other", name: "Sonstiges", category: "Sonstige" },
] as const;

export type BuiltinEquipmentId = (typeof EQUIPMENT)[number]["id"];

export const MOVEMENT_PATTERNS = [
  { id: "horizontal_push", name: "Horizontales Drücken" },
  { id: "vertical_push", name: "Vertikales Drücken" },
  { id: "horizontal_pull", name: "Horizontales Ziehen" },
  { id: "vertical_pull", name: "Vertikales Ziehen" },
  { id: "squat", name: "Kniebeuge" },
  { id: "hinge", name: "Hüftbeuge (Hinge)" },
  { id: "lunge", name: "Ausfallschritt / einbeinig" },
  { id: "chest_fly", name: "Fliegende Bewegung" },
  { id: "shoulder_raise", name: "Schulterheben" },
  { id: "elbow_flexion", name: "Ellbogenbeugung" },
  { id: "elbow_extension", name: "Ellbogenstreckung" },
  { id: "wrist", name: "Handgelenk / Griff" },
  { id: "knee_extension", name: "Kniestreckung" },
  { id: "knee_flexion", name: "Kniebeugung" },
  { id: "hip_extension", name: "Hüftstreckung" },
  { id: "hip_abduction", name: "Hüftabduktion" },
  { id: "hip_adduction", name: "Hüftadduktion" },
  { id: "calf_raise", name: "Wadenheben" },
  { id: "trunk_flexion", name: "Rumpfbeugung" },
  { id: "anti_movement", name: "Rumpfstabilisation" },
  { id: "rotation", name: "Rotation" },
  { id: "carry", name: "Tragen" },
  { id: "shrug", name: "Schulterblatt heben" },
] as const;

export type BuiltinPatternId = (typeof MOVEMENT_PATTERNS)[number]["id"];
