// Browser tests against the REAL local model (run with: npm run test:live, Ollama running with llama3.2:3b).
import { api, expect, LIVE, MATERIAL, test } from "./fixtures";

test.skip(!LIVE, "set TORZ_E2E_LIVE=1 to run against a real local model");

test("live: humanizer rewrites with the real model", async ({ page }) => {
  await page.goto("/humanizer");
  await page.getByRole("textbox", { name: "Your text" }).fill(
    "It is important to note that the utilization of renewable energy is very important for our planet. Furthermore, solar power is becoming more cheaper every year.",
  );
  await page.getByRole("button", { name: "Rewrite", exact: true }).click();
  await expect(page.getByText(/of \d+ sentences changed/)).toBeVisible();
  await expect(page.getByText(/llama3\.2:3b|qwen2\.5/).first()).toBeVisible();
});

test("live: quiz and flashcards from material with the real model", async ({ page }) => {
  await page.goto("/quiz");
  await page.getByRole("textbox", { name: "Source material" }).fill(MATERIAL);
  await page.getByRole("radio", { name: "5", exact: true }).click();
  await page.getByRole("button", { name: "Generate quiz" }).click();
  await expect(page).toHaveURL(/\/quiz\/\d+$/);
  await expect(page.getByText(/Question 1 of \d+/)).toBeVisible();
  const id = Number(page.url().split("/").pop());
  const quiz = await api(page, "GET", `/api/quizzes/${id}`);
  expect(quiz.questions.length).toBeGreaterThanOrEqual(3);
  await page.goto("/flashcards");
  await page.getByRole("textbox", { name: "Source material" }).fill(MATERIAL);
  await page.getByRole("spinbutton", { name: "Number of cards" }).fill("5");
  await page.getByRole("button", { name: "Generate flashcards" }).click();
  await expect(page).toHaveURL(/\/flashcards\/\d+$/);
  await page.getByRole("button", { name: "Show answer" }).click();
  await expect(page.locator(".flip-card.is-flipped")).toBeVisible();
});
