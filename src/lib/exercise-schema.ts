import { z } from "zod";
import { LOAD_MODES, TRACKING_TYPES } from "./training";
import { MSG } from "./i18n/locales";

const optInt = (min: number, max: number) =>
  z
    .preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(min).max(max).nullable())
    .optional()
    .transform((v) => v ?? null);

export const exerciseInputSchema = z
  .object({
    name: z.string().trim().min(2, `${MSG}validation.nameTooShort`).max(100, `${MSG}validation.nameTooLong`),
    aliases: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    description: z.string().trim().max(2000).nullable().default(null),
    instructions: z.string().trim().max(5000).nullable().default(null),
    primaryMuscleId: z.string().min(1, `${MSG}validation.choosePrimary`),
    secondaryMuscleIds: z.array(z.string().min(1)).max(10).default([]),
    equipmentId: z.string().min(1, `${MSG}validation.chooseEquipment`),
    movementPatternId: z.string().min(1).nullable().default(null),
    mechanic: z.enum(["compound", "isolation"]),
    tracking: z.enum(TRACKING_TYPES),
    loadMode: z.enum(LOAD_MODES),
    bodyweightFactor: z.preprocess((v) => (v === "" || v == null ? 1 : Number(v)), z.number().min(0.05, `${MSG}validation.factorTooSmall`).max(2, `${MSG}validation.factorMax`)),
    repMin: optInt(1, 100),
    repMax: optInt(1, 100),
    restSeconds: optInt(0, 3600),
    notes: z.string().trim().max(5000).nullable().default(null),
  })
  .refine((v) => v.repMin == null || v.repMax == null || v.repMin <= v.repMax, {
    message: `${MSG}validation.minGreaterMax`,
    path: ["repMax"],
  });

export type ExerciseInput = z.input<typeof exerciseInputSchema>;
export type ExerciseData = z.output<typeof exerciseInputSchema>;
