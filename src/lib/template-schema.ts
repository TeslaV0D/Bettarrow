import { z } from "zod";

const optInt = (min: number, max: number) =>
  z
    .preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(min).max(max).nullable())
    .optional()
    .transform((v) => v ?? null);

export const templateItemSchema = z
  .object({
    exerciseId: z.string().min(1).max(120),
    targetSets: z.preprocess((v) => Number(v), z.number().int().min(1, "Mind. 1 Satz").max(20, "Max. 20 Sätze")),
    repMin: optInt(1, 100),
    repMax: optInt(1, 100),
    restSeconds: optInt(0, 3600),
    notes: z.string().trim().max(1000).nullable().default(null),
  })
  .refine((v) => v.repMin == null || v.repMax == null || v.repMin <= v.repMax, { message: "Wdh.-Bereich ungültig", path: ["repMax"] });

export const templateInputSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(80, "Name ist zu lang"),
  description: z.string().trim().max(500).nullable().default(null),
  notes: z.string().trim().max(3000).nullable().default(null),
  items: z.array(templateItemSchema).max(40, "Max. 40 Übungen"),
});

export type TemplateInput = z.input<typeof templateInputSchema>;
export type TemplateData = z.output<typeof templateInputSchema>;
