import type { LoadMode, Tracking } from "@/lib/training";
import type { BuiltinEquipmentId, BuiltinMuscleId, BuiltinPatternId } from "./reference";

export interface SeedExercise {
  id: string;
  name: string;
  aliases?: string[];
  primary: BuiltinMuscleId;
  secondary?: BuiltinMuscleId[];
  equipment: BuiltinEquipmentId;
  pattern?: BuiltinPatternId;
  mechanic: "compound" | "isolation";
  load?: LoadMode;
  /** Share of bodyweight moved; approximation, user-adjustable. */
  factor?: number;
  tracking?: Tracking;
  reps?: [number, number];
  rest?: number;
  description: string;
  /** Execution cues, one per line. */
  cues: string[];
}
