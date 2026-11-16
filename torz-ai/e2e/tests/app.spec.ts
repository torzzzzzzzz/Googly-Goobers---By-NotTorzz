import { api, expect, test } from "./fixtures";

const ROUTES: [string, RegExp][] = [
  ["/", /Good (morning|afternoon|evening)|Working late/],
  ["/humanizer", /AI Humanizer/],
  ["/assistant", /Assistant/],
  ["/grammar", /Grammar Checker/],
  ["/paraphraser", /Paraphraser/],
  ["/rewriter", /Text Rewriter/],
  ["/essay", /Essay Improver/],
  ["/simplifier", /Sentence Simplifier/],
  ["/summarizer", /Summarizer/],
  ["/notes", /Smart Notes/],
  ["/autotyper", /AutoTyper/],
  ["/documents", /Document Workspace/],
  ["/pdf", /PDF Reader/],
  ["/quiz", /Quiz Generator/],
  ["/flashcards", /Flashcard Generator/],
  ["/study-guide", /Study Guide Generator/],
  ["/practice-test", /Practice Test Generator/],
  ["/qa", /Question Answering/],
  ["/history", /History/],
  ["/settings/profile", /Settings/],
  ["/settings/appearance", /Appearance/],
  ["/settings/ai", /Active AI model/],
  ["/settings/defaults", /Writing defaults/],
  ["/settings/privacy", /Where your data lives/],
  ["/settings/system", /Diagnostics/],
];

test("every page opens without errors", async ({ page }) => {
  for (const [route, heading] of ROUTES) {
    await page.goto(route);
    await expect(page.locator("main")).toContainText(heading);
  }
  await page.goto("/no-such-page");
  await expect(page.getByText("Page not found")).toBeVisible();
});

test("dashboard shows real status and every tool card links to its page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /fake-model/ })).toBeVisible(); // model status in the top bar
  await expect(page.getByText("Ready: fake-model:latest via Ollama (local)")).toBeVisible();
  const cards = page.locator('[data-testid^="tool-card-"]');
  await expect(cards).toHaveCount(17);
  const ids = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("tool-card-", "")));
  for (const id of ids) {
    await page.goto("/");
    await page.getByTestId(`tool-card-${id}`).click();
    await expect(page).not.toHaveURL(/\/$/);
    await expect(page.locator("main h1").first()).toBeVisible();
  }
});

test("sidebar navigation works for all tools", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const name of ["AI Humanizer", "Writing Assistant", "Grammar Checker", "Paraphraser", "Text Rewriter", "Essay Improver", "Sentence Simplifier",
    "Summarizer", "Smart Notes", "AutoTyper", "Document Workspace", "PDF Reader", "Quiz Generator", "Flashcard Generator",
    "Study Guide Generator", "Practice Test Generator", "Question Answering", "History", "Dashboard"]) {
    await nav.getByRole("link", { name, exact: true }).first().click();
    await expect(page.locator("main")).toBeVisible();
  }
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
});

test("global search finds tools and content", async ({ page }) => {
  await api(page, "POST", "/api/documents", { title: "Volcano field report", content_html: "<p>Lava</p>" });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Search" }).fill("volcano");
  await expect(page.getByRole("button", { name: /Volcano field report/ })).toBeVisible();
  await page.getByRole("button", { name: /Volcano field report/ }).click();
  await expect(page).toHaveURL(/\/documents\/\d+/);
  await page.keyboard.press("Control+k");
  await page.keyboard.type("flashcard");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/flashcards$/);
});

test("favorites appear on the dashboard and sidebar and can be reordered", async ({ page }) => {
  await page.goto("/quiz");
  await page.getByRole("button", { name: "Add to favorites" }).first().click();
  await page.goto("/summarizer");
  await page.getByRole("button", { name: "Add to favorites" }).first().click();
  await page.goto("/");
  await expect(page.getByTestId("favorite-quiz")).toBeVisible();
  await expect(page.getByTestId("favorite-summarizer")).toBeVisible();
  const sidebar = page.getByRole("navigation", { name: "Main" });
  await expect(sidebar.getByText("Favorites")).toBeVisible();
  await page.getByTestId("favorite-summarizer").hover();
  await page.getByRole("button", { name: "Move Summarizer left" }).click();
  await expect.poll(async () => (await api(page, "GET", "/api/favorites")).favorites).toEqual(["summarizer", "quiz"]);
  await page.reload();
  await expect(page.getByTestId("favorite-quiz")).toBeVisible();
  const order = await page.locator('[data-testid^="favorite-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(order).toEqual(["favorite-summarizer", "favorite-quiz"]);
});

test("appearance and profile settings persist after reload", async ({ page }) => {
  await page.goto("/settings/profile");
  await page.getByPlaceholder("e.g. Torz").fill("Torz");
  await page.getByRole("button", { name: "Save" }).click();
  await page.goto("/settings/appearance");
  await page.getByRole("radio", { name: "Light" }).click();
  await page.getByRole("button", { name: "violet accent" }).click();
  await page.getByRole("radio", { name: "Large", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "violet");
  await expect(page.locator("html")).toHaveAttribute("data-font", "large");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Torz");
  await page.getByRole("button", { name: /Switch to dark mode/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await api(page, "PATCH", "/api/settings", { patch: { appearance: { accent: "cyan", font_size: "medium" } } });
});

test("system diagnostics and AI provider test run", async ({ page }) => {
  await page.goto("/settings/system");
  await page.getByRole("button", { name: "Run diagnostics" }).click();
  await expect(page.getByText("Database integrity")).toBeVisible();
  await expect(page.getByText("Data folder writable")).toBeVisible();
  await page.goto("/settings/ai");
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText(/Connected to Ollama/)).toBeVisible();
  await expect(page.getByText("fake-model:latest").first()).toBeVisible();
  await page.getByRole("button", { name: /^Anthropic/ }).click();
  await page.getByPlaceholder("Paste your key").fill("sk-ant-e2e-123456789");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByPlaceholder(/Saved \(sk-…6789\)/)).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByPlaceholder("Paste your key")).toBeVisible();
});
