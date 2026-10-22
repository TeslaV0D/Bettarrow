import { z } from "zod";
import { isValidTimeZone, isYmd } from "./dates";
import { MSG } from "./i18n/locales";

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
    .refine((v) => !v || isYmd(v), `${MSG}validation.invalidDate`),
  sex: z.enum(["female", "male", "diverse"]).nullable().default(null),
  heightCm: optNum(100, 250, `${MSG}validation.heightRange`),
  targetWeightKg: optNum(30, 300, `${MSG}validation.targetRange`),
  trainingLevel: z.enum(["beginner", "intermediate", "advanced"]).nullable().default(null),
  goals: z.string().trim().max(1000).nullable().default(null),
});

export const settingsSchema = z.object({
  weightUnit: z.enum(["kg", "lb"]),
  heightUnit: z.enum(["cm", "in"]),
  weekStart: z.coerce.number().int().min(1).max(7),
  timezone: z.string().refine(isValidTimeZone, `${MSG}validation.unknownTimezone`),
  defaultRestSeconds: z.coerce.number().int().min(0, `${MSG}validation.restRange`).max(3600, `${MSG}validation.restRange`),
  autoStartRestTimer: z.boolean(),
  restTimerSound: z.boolean(),
  keepScreenAwake: z.boolean(),
  effortMetric: z.enum(["none", "rir", "rpe"]),
  defaultBodyweightMode: z.enum(["bodyweight", "bodyweight_plus", "bodyweight_minus", "none"]),
  bodyweightInVolume: z.boolean(),
  secondaryMuscleWeight: z.coerce.number().min(0, `${MSG}validation.zeroToOne`).max(1, `${MSG}validation.zeroToOne`),
});

export const bodyweightSchema = z.object({
  date: z.string().refine(isYmd, `${MSG}validation.invalidDate`),
  weightKg: z.number({ message: `${MSG}validation.enterWeight` }).min(20, `${MSG}validation.weightRange`).max(400, `${MSG}validation.weightRange`),
  note: z.string().trim().max(200).nullable().default(null),
});

export type ProfileInput = z.input<typeof profileSchema>;
export type SettingsInput = z.input<typeof settingsSchema>;
