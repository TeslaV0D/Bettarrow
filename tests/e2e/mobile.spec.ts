import { expect, test } from "@playwright/test";
import { login, trackErrors } from "./helpers";

const PAGES = ["/", "/calendar", "/stats", "/profile", "/exercises", "/templates", "/history", "/profile?tab=gewicht", "/profile?tab=daten"];

test("main pages have no horizontal scrolling and no console errors on a phone", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).last()).toBeVisible();
  expect(errors).toEqual([]);
});

test("touch targets in the bottom navigation are large enough", async ({ page }) => {
  await login(page);
  const links = page.getByRole("navigation", { name: "Hauptnavigation" }).last().getByRole("link");
  const count = await links.count();
  for (let i = 0; i < count; i++) {
    const box = await links.nth(i).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});
