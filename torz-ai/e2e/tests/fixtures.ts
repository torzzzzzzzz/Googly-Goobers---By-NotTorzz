import { test as base, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export const DATA = process.env.TORZ_E2E_DATA!;
export const LIVE = process.env.TORZ_E2E_LIVE === "1";

export function token(): string {
  return fs.readFileSync(path.join(DATA, "token"), "utf8").trim();
}

export async function api(page: Page, method: string, url: string, data?: unknown) {
  const r = await page.request.fetch(url, { method, data, headers: { "X-TORZ-Token": token() } });
  expect(r.ok(), `${method} ${url} -> ${r.status()} ${await r.text()}`).toBeTruthy();
  const ct = r.headers()["content-type"] ?? "";
  return ct.includes("json") ? r.json() : r.text();
}

export const MATERIAL =
  "Photosynthesis is the process by which green plants use sunlight to make food from carbon dioxide and water. " +
  "It takes place mainly in the chloroplasts of leaf cells, which contain a green pigment called chlorophyll. " +
  "Chlorophyll absorbs light energy, mostly in the blue and red wavelengths. " +
  "The light-dependent reactions occur in the thylakoid membranes and produce ATP and NADPH. " +
  "The Calvin cycle takes place in the stroma and converts carbon dioxide into glucose. " +
  "The Calvin cycle was discovered by Melvin Calvin in 1950.";

/** Every test fails if the page logs a console error or throws. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      await use(errors);
      const real = errors.filter((e) => !/Failed to load resource: the server responded with a status of (404|400|413|422)/.test(e));
      expect(real, "console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
