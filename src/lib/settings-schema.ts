import { z } from "zod";
import { isValidTimeZone, isYmd } from "./dates";

const optNum = (min: number, max: number, msg: string) =>
  z
    .preprocess((v) => (v === "" || v == null ? null : Number(String(v).replace(",", "."))), z.number({ message: msg }).min(min, msg).max(max, msg).nullable())
    .optional()
    .transform((v) => v ?? null);

export const profileSchema = z.object({
  name: z.string().trim().max(60).nullable().default(null),
  birthDate: z
    .string()
    .nullable()
    .default(null)
    .refine((v) => !v || isYmd(v), "Ungültiges Datum"),
  sex: z.enum(["female", "male", "diverse"]).nullable().default(null),
  heightCm: optNum(100, 250, "Größe zwischen 100 und 250 cm"),
  targetWeightKg: optNum(30, 300, "Zielgewicht zwischen 30 und 300 kg"),
  trainingLevel: z.enum(["beginner", "intermediate", "advanced"]).nullable().default(null),
  goals: z.string().trim().max(1000).nullable().default(null),
});

export const settingsSchema = z.object({
  weightUnit: z.enum(["kg", "lb"]),
  heightUnit: z.enum(["cm", "in"]),
  weekStart: z.coerce.number().int().min(1).max(7),
  timezone: z.string().refine(isValidTimeZone, "Unbekannte Zeitzone"),
  defaultRestSeconds: z.coerce.number().int().min(0, "0–3600 Sekunden").max(3600, "0–3600 Sekunden"),
  autoStartRestTimer: z.boolean(),
  restTimerSound: z.boolean(),
  keepScreenAwake: z.boolean(),
  effortMetric: z.enum(["none", "rir", "rpe"]),
  defaultBodyweightMode: z.enum(["bodyweight", "bodyweight_plus", "bodyweight_minus", "none"]),
  bodyweightInVolume: z.boolean(),
  secondaryMuscleWeight: z.coerce.number().min(0, "0 bis 1").max(1, "0 bis 1"),
});

export const bodyweightSchema = z.object({
  date: z.string().refine(isYmd, "Ungültiges Datum"),
  weightKg: z.number({ message: "Gewicht angeben" }).min(20, "Gewicht zwischen 20 und 400 kg").max(400, "Gewicht zwischen 20 und 400 kg"),
  note: z.string().trim().max(200).nullable().default(null),
});

export type ProfileInput = z.input<typeof profileSchema>;
export type SettingsInput = z.input<typeof settingsSchema>;
