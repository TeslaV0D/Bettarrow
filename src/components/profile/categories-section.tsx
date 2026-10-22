"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { addCategoryAction, deleteCategoryAction } from "@/server/actions/categories";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { fmt } from "@/lib/i18n";
import { refName } from "@/lib/i18n/reference";
import { useT } from "@/components/i18n-provider";

type Item = { id: string; name: string; isBuiltin: boolean; category?: string; parentId?: string | null };

export function CategoriesSection({ equipment, patterns, muscles }: { equipment: Item[]; patterns: Item[]; muscles: Item[] }) {
  const router = useRouter();
  const t = useT();
  const [type, setType] = useState<"equipment" | "pattern" | "muscle">("equipment");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Sonstige");
  const [parentId, setParentId] = useState("");
  const list = type === "equipment" ? equipment : type === "pattern" ? patterns : muscles;
  const parents = muscles.filter((m) => !m.parentId);

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold">{t.categories.title}</h2>
      <p className="mt-1 text-sm text-muted">{t.categories.text}</p>
      <Segmented
        className="mt-4"
        size="sm"
        aria-label={t.categories.category}
        value={type}
        onChange={setType}
        options={[
          { value: "equipment", label: t.categories.equipment },
          { value: "pattern", label: t.categories.patterns },
          { value: "muscle", label: t.categories.muscles },
        ]}
      />
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await addCategoryAction({ type, name, category, parentId: parentId || null });
          if (!res.ok) return void toast.error(res.error);
          setName("");
          toast.success(t.categories.added);
          router.refresh();
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.common.name} aria-label={t.common.name} className="min-w-40 flex-1" />
        {type === "equipment" ? (
          <Select aria-label={t.categories.group} value={category} onChange={(e) => setCategory(e.target.value)}>
            {[...new Set(equipment.map((e) => e.category ?? "Sonstige"))].map((c) => (
              <option key={c} value={c}>
                {refName(t.equipmentCategories, c, c)}
              </option>
            ))}
          </Select>
        ) : null}
        {type === "muscle" ? (
          <Select aria-label={t.categories.parent} value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">{t.categories.ownMainGroup}</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {fmt(t.categories.under, { name: p.name })}
              </option>
            ))}
          </Select>
        ) : null}
        <Button type="submit" disabled={name.trim().length < 2}>
          <Plus className="size-4" /> {t.templates.add}
        </Button>
      </form>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {list.map((i) => (
          <li key={i.id} className="inline-flex items-center gap-1 rounded-full border border-border py-1 pl-3 pr-1 text-sm">
            {i.name}
            {!i.isBuiltin ? (
              <button
                type="button"
                className="grid size-6 place-items-center rounded-full text-subtle hover:text-danger"
                aria-label={fmt(t.categories.deleteItem, { name: i.name })}
                onClick={async () => {
                  const res = await deleteCategoryAction(type, i.id);
                  if (!res.ok) return void toast.error(res.error);
                  router.refresh();
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : (
              <span className="w-2" />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
