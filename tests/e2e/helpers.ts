import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.E2E_PASSWORD ?? "devpassword123";

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Collects console errors and uncaught exceptions of a page. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    // Resource errors are reported with their URL via the response listener below.
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && r.status() !== 401) errors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}
