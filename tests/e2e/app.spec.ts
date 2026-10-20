import { expect, test } from "@playwright/test";
import { login, trackErrors } from "./helpers";

test.describe.configure({ mode: "serial" });

test("rejects a wrong password and protects pages and APIs", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Passwort").fill("definitely-wrong");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("Passwort ist nicht korrekt.")).toBeVisible();
  const api = await request.post("/api/workouts/00000000-0000-4000-8000-000000000000/sync", { data: {} });
  expect(api.status()).toBe(401);
  expect((await request.get("/api/export")).status()).toBe(401);
  expect((await request.get("/api/health")).status()).toBe(200);
});

test("full training flow: template → workout → autosave → finish → prefill", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);

  // Create a template
  await page.goto("/templates/new");
  await page.getByLabel("Name", { exact: true }).fill("E2E Push");
  await page.getByRole("button", { name: "Hinzufügen" }).first().click();
  const search = page.getByRole("searchbox", { name: "Übungen durchsuchen" });
  await search.fill("bench press");
  await page.getByRole("button", { name: /Bankdrücken \(Langhantel\)/ }).click();
  await search.fill("seitheben kurzhantel");
  await page.getByRole("button", { name: /Seitheben \(Kurzhantel\)/ }).click();
  await page.getByRole("button", { name: "Hinzufügen (2)" }).click();
  await page.getByRole("button", { name: "Vorlage speichern" }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByRole("heading", { name: "E2E Push" })).toBeVisible();

  // Start it
  await page.getByRole("button", { name: "Starten", exact: true }).first().click();
  await expect(page).toHaveURL(/\/workout$/);
  await expect(page.getByRole("heading", { name: "Bankdrücken (Langhantel)" })).toBeVisible();

  const weight = page.getByLabel("Gewicht", { exact: true });
  const reps = page.getByLabel("Wiederholungen", { exact: true });
  await weight.nth(0).fill("60");
  await reps.nth(0).fill("8");
  await page.getByRole("button", { name: "Satz 1 abhaken" }).first().click();
  await weight.nth(1).fill("62,5");
  await reps.nth(1).fill("6");
  // Any number of sets can be added
  await page.getByRole("button", { name: "Satz hinzufügen" }).first().click();
  await page.getByRole("button", { name: "Satz hinzufügen" }).first().click();
  await expect(page.getByLabel("Gewicht", { exact: true })).toHaveCount(5 + 3); // 5 bench, 3 lateral raise
  await page.waitForResponse((r) => r.url().includes("/sync") && r.ok());
  await expect(page.getByRole("status").filter({ hasText: "Gespeichert" })).toBeAttached({ timeout: 10_000 });

  // Reload: nothing is lost
  await page.reload();
  await expect(weight.nth(0)).toHaveValue("60");
  await expect(weight.nth(1)).toHaveValue("62,5");
  await expect(page.getByRole("button", { name: "Satz 1 als offen markieren" })).toBeVisible();

  // Finish
  await page.getByRole("button", { name: "Beenden" }).click();
  await page.getByRole("button", { name: "Abschließen" }).click();
  await expect(page).toHaveURL(/\/history\/.+finished=1/);
  await expect(page.getByText("Training abgeschlossen")).toBeVisible();
  await expect(page.getByText("480 kg").first()).toBeVisible(); // only the completed set counts

  // Start the same template again → values prefilled from the last completed session
  await page.goto("/templates");
  await page.getByRole("button", { name: "Starten", exact: true }).first().click();
  await expect(page).toHaveURL(/\/workout$/);
  await expect(page.getByLabel("Gewicht", { exact: true }).nth(0)).toHaveValue("60");
  await expect(page.getByLabel("Wiederholungen", { exact: true }).nth(0)).toHaveValue("8");
  await expect(page.getByText("60 × 8").first()).toBeVisible(); // "previous" column

  // Discard with undo option
  await page.getByRole("button", { name: "Training verwerfen" }).click();
  await page.getByRole("button", { name: "Verwerfen" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Training verworfen")).toBeVisible();

  expect(errors).toEqual([]);
});

test("autosave survives going offline", async ({ page, context }) => {
  await login(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Training starten" }).first().click();
  await page.getByRole("button", { name: /Freies Training/ }).click();
  await expect(page).toHaveURL(/\/workout$/);
  await page.getByRole("button", { name: "Übung hinzufügen" }).click();
  await page.getByRole("searchbox", { name: "Übungen durchsuchen" }).fill("kniebeuge langhantel");
  await page.getByRole("button", { name: /Kniebeuge \(Langhantel\)/ }).click();
  await page.getByRole("button", { name: "Hinzufügen (1)" }).click();
  await expect(page.getByRole("heading", { name: "Kniebeuge (Langhantel)" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Gespeichert" })).toBeAttached({ timeout: 10_000 });

  await context.setOffline(true);
  await page.getByLabel("Gewicht", { exact: true }).first().fill("100");
  await page.getByLabel("Wiederholungen", { exact: true }).first().fill("5");
  await expect(page.getByRole("status").filter({ hasText: "Offline" })).toBeVisible({ timeout: 10_000 });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("status").filter({ hasText: "Gespeichert" })).toBeAttached({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByLabel("Gewicht", { exact: true }).first()).toHaveValue("100");

  // Clean up: discard
  await page.getByRole("button", { name: "Training verwerfen" }).click();
  await page.getByRole("button", { name: "Verwerfen" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("reloading immediately after an edit loses nothing", async ({ page }) => {
  await login(page);
  await page.goto("/templates");
  await page.getByRole("button", { name: "Starten", exact: true }).first().click();
  await expect(page).toHaveURL(/\/workout$/);
  const weight = page.getByLabel("Gewicht", { exact: true }).nth(2);
  await weight.fill("72,5");
  await page.reload(); // within the autosave debounce window
  await expect(page.getByLabel("Gewicht", { exact: true }).nth(2)).toHaveValue("72,5");
  await page.getByRole("button", { name: "Training verwerfen" }).click();
  await page.getByRole("button", { name: "Verwerfen" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("calendar: plan a rest day and switch views", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Ruhetag", exact: true }).click();
  await expect(page.getByText("Ruhetag eingetragen")).toBeVisible();
  await expect(page.getByText("Geplanter Ruhetag").first()).toBeVisible();
  await page.getByRole("radio", { name: "Woche" }).click();
  await expect(page).toHaveURL(/view=week/);
  await page.getByRole("link", { name: "Nächste Woche" }).click();
  await page.getByRole("link", { name: "Vorherige Woche" }).click();
  expect(errors).toEqual([]);
});

test("statistics, exercise progress, profile and export render", async ({ page, request }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.goto("/stats?period=this_year");
  await expect(page.getByText("Arbeitssätze").first()).toBeVisible();
  await page.goto("/exercises/bench-press-barbell");
  await expect(page.getByText("Höchstes Gewicht")).toBeVisible();
  await page.goto("/profile?tab=gewicht");
  await page.getByLabel(/Gewicht \(kg\)/).fill("81,4");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gewicht eingetragen")).toBeVisible();
  const res = await page.request.get("/api/export");
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.format).toBe("bettarrow-export");
  expect(data.workouts.filter((w: { status: string }) => w.status === "completed")).toHaveLength(1);
  void request;
  expect(errors).toEqual([]);
});
