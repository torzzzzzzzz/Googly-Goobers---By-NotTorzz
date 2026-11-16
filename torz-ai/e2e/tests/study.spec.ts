import { api, expect, MATERIAL, test } from "./fixtures";

test("quiz: generate, answer one at a time, score, review, retake, new questions", async ({ page }) => {
  await page.goto("/quiz");
  await page.getByRole("textbox", { name: "Source material" }).fill(MATERIAL);
  await page.getByPlaceholder("Uses the material's title if empty").fill("Photosynthesis quiz");
  await page.getByRole("radio", { name: "5", exact: true }).click();
  await page.getByRole("button", { name: "Generate quiz" }).click();
  await expect(page).toHaveURL(/\/quiz\/\d+$/);
  const quizId = Number(page.url().split("/").pop());
  const quiz = await api(page, "GET", `/api/quizzes/${quizId}`);
  expect(quiz.questions.length).toBe(5);
  expect(quiz.questions.every((q: any) => !q.question.includes("Mars"))).toBe(true); // ungrounded question removed
  await page.getByRole("switch", { name: "Auto-advance when correct" }).click(); // manual advance for the test
  for (let i = 0; i < quiz.questions.length; i++) {
    const q = quiz.questions[i];
    await expect(page.getByText(`Question ${i + 1} of 5`)).toBeVisible();
    const wrong = i === 0;
    if (q.options.length) {
      const pick = wrong ? q.options.find((o: string) => o !== q.answer) : q.answer;
      await page.getByRole("button", { name: new RegExp(`^\\d ${pick.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).click();
    } else {
      await page.getByPlaceholder(/Type the missing word|Type your answer/).fill(wrong ? "nonsense" : q.answer);
      await page.getByRole("button", { name: "Submit answer" }).click();
    }
    await expect(page.getByText(wrong ? "Not quite" : "Correct!")).toBeVisible();
    if (q.explanation) await expect(page.getByText(q.explanation).first()).toBeVisible();
    if (i < 4) await page.getByRole("button", { name: "Next question" }).click();
  }
  await page.getByRole("button", { name: "See results" }).click();
  await expect(page.getByText("80%")).toBeVisible();
  await page.getByRole("button", { name: "Review incorrect (1)" }).click();
  await expect(page.getByText("Correct answer:")).toHaveCount(1);
  await page.getByRole("button", { name: "Retake quiz" }).click();
  await expect(page.getByText("Question 1 of 5")).toBeVisible();
  const attempts = await api(page, "GET", `/api/quizzes/${quizId}/attempts`);
  expect(attempts.attempts[0].percent).toBe(80);
  // library + new questions from the same material
  await page.goto("/quiz");
  await page.getByRole("tab", { name: /My quizzes/ }).click();
  await expect(page.getByText("Best 80%")).toBeVisible();
  await page.getByRole("button", { name: "Options" }).first().click();
  await page.getByRole("menuitem", { name: "New questions from same material" }).click();
  await expect(page).toHaveURL(/\/quiz\/\d+$/);
  expect(Number(page.url().split("/").pop())).not.toBe(quizId);
});

test("flashcards: generate, flip, mark known/difficult, difficult-only, quiz mode, edit", async ({ page }) => {
  await page.goto("/flashcards");
  await page.getByRole("textbox", { name: "Source material" }).fill(MATERIAL);
  await page.getByRole("spinbutton", { name: "Number of cards" }).fill("5");
  await page.getByRole("button", { name: "Generate flashcards" }).click();
  await expect(page).toHaveURL(/\/flashcards\/\d+$/);
  await expect(page.getByText("1 / 5")).toBeVisible();
  const card = page.getByRole("button", { name: "Show answer" });
  await card.click();
  await expect(page.locator(".flip-card.is-flipped")).toBeVisible();
  await page.getByRole("button", { name: /Know it/ }).click();
  await expect(page.getByText("2 / 5")).toBeVisible();
  await page.getByRole("button", { name: /Difficult/ }).click();
  await expect(page.getByText(/1 known · 1 difficult/)).toBeVisible();
  await page.keyboard.press("k");
  await expect(page.getByText(/2 known · 1 difficult/)).toBeVisible();
  await page.getByRole("button", { name: "Shuffle" }).click();
  await page.getByRole("switch", { name: "Only difficult cards" }).click();
  await expect(page.getByText("1 / 1")).toBeVisible();
  // quiz mode with shuffled answers
  await page.getByRole("radio", { name: "Quiz mode" }).click();
  const options = page.locator(".card .grid button");
  await expect(options).toHaveCount(4);
  await options.first().click();
  await expect(page.locator(".card .grid button svg").first()).toBeVisible();
  // edit mode: add a card
  await page.getByRole("radio", { name: "Edit cards" }).click();
  await page.getByRole("textbox", { name: "Front", exact: true }).first().fill("What pigment is green?");
  await page.getByRole("textbox", { name: "Back", exact: true }).first().fill("Chlorophyll");
  await page.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByText("What pigment is green?")).toBeVisible();
  // decks list with progress and export
  await page.goto("/flashcards");
  await page.getByRole("tab", { name: /My decks/ }).click();
  await expect(page.getByText(/6 cards/)).toBeVisible();
  await page.getByRole("button", { name: "Deck options" }).first().click();
  const dl = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export CSV" }).click();
  expect((await dl).suggestedFilename()).toMatch(/\.csv$/);
});

test("study guide: generate, quick review and detailed study", async ({ page }) => {
  await page.goto("/study-guide");
  await page.getByRole("textbox", { name: "Source material" }).fill(MATERIAL);
  await page.getByPlaceholder("e.g. Unit 4: Cell Biology").fill("Unit 3: Plants");
  await page.getByRole("button", { name: "Build study guide" }).click();
  await expect(page).toHaveURL(/\/study-guide\/\d+$/);
  await expect(page.getByRole("heading", { name: "Unit 3: Plants" })).toBeVisible();
  await expect(page.getByText("Unit overview")).toBeVisible();
  await expect(page.getByText("Self-check (tap to reveal)")).toBeVisible();
  await page.getByRole("radio", { name: /Detailed study/ }).click();
  await expect(page.getByText("Important vocabulary")).toBeVisible();
  await expect(page.getByText("Common mistakes")).toBeVisible();
  await expect(page.getByText("Review questions")).toBeVisible();
  await page.getByRole("button", { name: "Make flashcards" }).click();
  await expect(page).toHaveURL(/\/flashcards$/);
  await expect(page.getByRole("textbox", { name: "Source material" })).not.toBeEmpty();
});

test("practice test: timed test, written answers graded, review and history", async ({ page }) => {
  await page.goto("/practice-test");
  await page.getByRole("textbox", { name: "Source material" }).fill(MATERIAL);
  await page.getByRole("radio", { name: "5", exact: true }).click();
  for (const t of ["Multiple choice", "Short answer"]) await page.getByLabel(t).uncheck();
  await page.getByLabel("True / false").check();
  await page.getByLabel("Written response").check();
  await page.getByRole("combobox", { name: "Time limit" }).selectOption("10");
  await page.getByRole("button", { name: "Generate practice test" }).click();
  await expect(page).toHaveURL(/\/practice-test\/\d+$/);
  const id = Number(page.url().split("/").pop());
  const test = await api(page, "GET", `/api/quizzes/${id}`);
  await expect(page.getByRole("heading", { name: test.title })).toBeVisible();
  await page.getByRole("button", { name: "Start test" }).click();
  await expect(page.getByText("remaining")).toBeVisible();
  for (const q of test.questions) {
    const card = page.locator(`#q-${q.id}`);
    if (q.type === "true_false") await card.getByLabel(q.answer).check();
    else await card.locator("textarea").fill(q.answer);
  }
  await expect(page.getByText(`${test.questions.length} of ${test.questions.length} answered`)).toBeVisible();
  await page.getByRole("button", { name: "Submit test" }).click();
  await expect(page).toHaveURL(/\/attempts\/\d+$/);
  await expect(page.getByText("100%")).toBeVisible();
  await expect(page.getByText("Compared with the model answer.").first()).toBeVisible(); // AI written-answer feedback
  await page.goto("/practice-test");
  await page.getByRole("tab", { name: "Test history" }).click();
  await expect(page.getByRole("cell", { name: /100%/ })).toBeVisible();
});

test("question answering cites passages from the chosen sources", async ({ page }) => {
  await api(page, "POST", "/api/documents", { title: "Plant biology", content_html: `<p>${MATERIAL}</p>` });
  await page.goto("/qa");
  await page.getByRole("button", { name: "Add from library" }).click();
  await page.getByRole("tab", { name: "Documents" }).click();
  await page.getByText("Plant biology").click();
  await page.getByRole("button", { name: "Add 1", exact: true }).click();
  await page.getByRole("textbox", { name: "Question" }).fill("Where does the Calvin cycle take place?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.locator("sup", { hasText: "[1]" })).toBeVisible();
  await expect(page.getByText("Plant biology").last()).toBeVisible();
  await page.getByRole("radio", { name: "Offline engine" }).click();
  await page.getByRole("textbox", { name: "Question" }).fill("Who discovered the Calvin cycle?");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Most relevant passages from your documents/)).toBeVisible();
  await expect(page.getByText(/Melvin Calvin/).last()).toBeVisible();
});
