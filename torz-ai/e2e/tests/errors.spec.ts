import { api, expect, MATERIAL, test } from "./fixtures";

test.describe("when no AI model is reachable", () => {
  let original = "";
  test.beforeEach(async ({ page }) => {
    const s = await api(page, "GET", "/api/settings");
    original = s.settings.ai.providers.ollama.base_url;
    await api(page, "PATCH", "/api/settings", { patch: { ai: { providers: { ollama: { base_url: "http://127.0.0.1:9" } } } } });
  });
  test.afterEach(async ({ page }) => {
    await api(page, "PATCH", "/api/settings", { patch: { ai: { providers: { ollama: { base_url: original } } } } });
  });

  test("AI tools show a setup screen instead of pretending to work", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /No AI model/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Set up AI" })).toBeVisible();
    await page.goto("/humanizer");
    await page.getByRole("textbox", { name: "Your text" }).fill("This text needs a model to be rewritten properly.");
    await page.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(page.getByText("No AI model is connected")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Ollama is not running|Could not connect/)).toBeVisible();
    await expect(page.getByText("Preservation check")).toHaveCount(0); // no fake result
    await page.getByRole("link", { name: "Set up AI" }).click();
    await expect(page).toHaveURL(/\/settings\/ai$/);
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText("Connection failed")).toBeVisible({ timeout: 20_000 });
  });

  test("tools with an offline engine offer it and work without AI", async ({ page }) => {
    await page.goto("/summarizer");
    await page.getByRole("radio", { name: "AI model" }).click();
    await page.getByRole("textbox", { name: "Source material" }).fill(MATERIAL);
    await page.getByRole("button", { name: "Summarize", exact: true }).click();
    await expect(page.getByText("No AI model is connected")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Use offline engine instead" }).click();
    await expect(page.getByText("Offline engine").first()).toBeVisible();
    await expect(page.locator(".prose-torz li").first()).toBeVisible();
    // quiz generation also works offline
    await page.goto("/quiz");
    await expect(page.getByRole("radio", { name: "Offline engine" })).toHaveAttribute("aria-checked", "true"); // auto-selected when AI is down
    await page.getByRole("textbox", { name: "Source material" }).fill(MATERIAL);
    await page.getByRole("button", { name: "Generate quiz" }).click();
    await expect(page).toHaveURL(/\/quiz\/\d+$/);
    await expect(page.getByText("Offline engine").first()).toBeVisible();
  });
});

test("invalid uploads show clear error messages", async ({ page }) => {
  await page.goto("/pdf");
  await page.locator('input[type="file"]').setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("not really a pdf") });
  await expect(page.getByText("The file content does not match its .pdf extension.")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "program.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") });
  await expect(page.getByText(/Unsupported file type '\.exe'/)).toBeVisible();
  await page.goto("/humanizer");
  await expect(page.getByRole("button", { name: "Rewrite", exact: true })).toBeDisabled(); // nothing to do without text
});

test("server data survives a full page reload and history is browsable", async ({ page }) => {
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  const before = await api(page, "GET", "/api/history");
  expect(before.total).toBeGreaterThan(0);
  await page.getByPlaceholder("Search inputs, outputs and titles").fill("Photosynthesis");
  await expect(page.locator(".card").first()).toBeVisible();
  await page.locator(".card a").first().click();
  await expect(page).toHaveURL(/\/history\/\d+$/);
  await expect(page.getByText("Input", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reuse input" }).click();
  await expect(page).not.toHaveURL(/\/history/);
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
});
