"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import type { TemplateInput } from "@/lib/template-schema";
import { deleteTemplate, duplicateTemplate, saveTemplate } from "@/server/services/templates";
import { msg } from "@/lib/i18n";
import { run, UserError } from "./_util";

const id = z.uuid(msg("validation.invalidId"));

export async function saveTemplateAction(templateId: string | null, input: TemplateInput) {
  return run(async () => {
    const saved = await saveTemplate(db, templateId ? id.parse(templateId) : null, input);
    revalidatePath("/templates", "layout");
    return { id: saved };
  });
}

export async function duplicateTemplateAction(templateId: string) {
  return run(async () => {
    const copy = await duplicateTemplate(db, id.parse(templateId));
    revalidatePath("/templates", "layout");
    return { id: copy };
  });
}

export async function deleteTemplateAction(templateId: string) {
  return run(async () => {
    if (!(await deleteTemplate(db, id.parse(templateId)))) throw new UserError(msg("templates.notFound"));
    revalidatePath("/templates", "layout");
  });
}
