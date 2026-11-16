import { api, expect, test } from "./fixtures";

const ROBOTIC =
  "It is important to note that the utilization of renewable energy is very important. Furthermore, solar power (Smith, 2020) is cheaper every year.\n\n" +
  "Wind power is also growing in order to meet demand.";

test("humanizer rewrites, highlights changes, compares, copies and saves", async ({ page }) => {
  await page.goto("/humanizer");
  await page.getByRole("radio", { name: "Enhanced" }).click();
  await page.getByRole("radio", { name: "More formal" }).click();
  await page.getByRole("textbox", { name: "Your text" }).fill(ROBOTIC);
  await expect(page.getByText(/\d+ words · \d+ characters/).first()).toContainText("words");
  await page.getByRole("button", { name: "Rewrite", exact: true }).click();
  await expect(page.getByText("Preservation check")).toBeVisible();
  await expect(page.locator(".sent-changed").first()).toBeVisible(); // changed sentences highlighted
  await expect(page.getByText(/of \d+ sentences changed/)).toBeVisible();
  await expect(page.getByText("fake-model:latest").first()).toBeVisible(); // model badge
  await page.getByRole("radio", { name: "Side-by-side comparison" }).click();
  await expect(page.getByText("Original", { exact: true })).toBeVisible();
  await expect(page.locator(".diff-add").first()).toBeVisible();
  await page.getByRole("radio", { name: "Clean" }).click();
  await page.getByRole("button", { name: "Copy" }).last().click();
  await expect(page.getByText("Copied to clipboard")).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("crucial");
  await page.getByRole("button", { name: "Save to Documents" }).click();
  await expect(page.getByText("Saved to Documents.")).toBeVisible();
  const docs = await api(page, "GET", "/api/documents");
  expect(docs.documents[0].title).toBe("humanizer result");
  // history drawer restores the previous run
  await page.reload();
  await page.getByRole("button", { name: "History" }).click();
  await page.getByRole("button", { name: /It is important to note/ }).first().click();
  await expect(page.getByRole("textbox", { name: "Your text" })).toHaveValue(ROBOTIC);
});

test("paraphraser, rewriter and simplifier produce results", async ({ page }) => {
  await page.goto("/paraphraser");
  await page.getByRole("radio", { name: "Academic" }).click();
  await page.getByRole("textbox", { name: "Your text" }).fill(ROBOTIC);
  await page.getByRole("button", { name: "Paraphrase", exact: true }).click();
  await expect(page.getByText("Preservation check")).toBeVisible();

  await page.goto("/rewriter");
  await page.getByRole("combobox").first().selectOption("friendly");
  await page.getByRole("radio", { name: "Shorter" }).click();
  await page.getByRole("textbox", { name: "Your text" }).fill(ROBOTIC);
  await page.keyboard.press("Control+Enter");
  await expect(page.getByText(/of \d+ sentences changed/)).toBeVisible();

  await page.goto("/simplifier");
  await page.getByRole("radio", { name: "Middle school" }).click();
  await page.getByRole("textbox", { name: "Your text" }).fill(ROBOTIC);
  await page.getByRole("button", { name: "Simplify", exact: true }).click();
  await expect(page.getByText("Readability, before → after")).toBeVisible();
});

test("grammar checker: accept, reject, accept all, offline engine", async ({ page }) => {
  await page.goto("/grammar");
  const text = "i think teh results dont matter. Their is a lot of data and recieve more.";
  await page.getByRole("textbox", { name: "Your text" }).fill(text);
  await page.getByRole("button", { name: "Check text" }).click();
  await expect(page.getByText(/\d+ suggestions?/)).toBeVisible();
  const count = async () => Number((await page.getByText(/^\d+ suggestions?$/).textContent())!.split(" ")[0]);
  const before = await count();
  await page.getByRole("button", { name: "Accept", exact: true }).first().click();
  await expect.poll(count).toBe(before - 1);
  await page.getByRole("button", { name: "Reject", exact: true }).first().click();
  await expect.poll(count).toBe(before - 2);
  await page.getByRole("button", { name: "Accept all" }).click();
  await expect(page.getByText(/All done — \d+ fix/)).toBeVisible();
  await page.getByRole("button", { name: "Edit text" }).click();
  const fixed = await page.getByRole("textbox", { name: "Your text" }).inputValue();
  expect(fixed.startsWith("I think teh")).toBe(true); // first fix accepted, second ("teh") rejected
  expect(fixed).toContain("doesn't"); // applied by Accept all
  expect(fixed).toContain("receive");
  // offline engine
  await page.getByRole("radio", { name: "Offline engine" }).click();
  await page.getByRole("textbox", { name: "Your text" }).fill("We could of went to the the park on monday.");
  await page.getByRole("button", { name: "Check text" }).click();
  await expect(page.getByText("Offline engine").first()).toBeVisible();
  await expect(page.getByText("Repeated word", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Accept all" }).click();
  await page.getByRole("button", { name: "Edit text" }).click();
  await expect(page.getByRole("textbox", { name: "Your text" })).toHaveValue(/could have gone to the park on Monday/);
});

test("essay improver gives scored feedback and an improved version", async ({ page }) => {
  await page.goto("/essay");
  await page.getByRole("textbox", { name: "Your essay" }).fill(ROBOTIC);
  await page.getByRole("button", { name: "Get feedback" }).click();
  await expect(page.getByText("Strengths")).toBeVisible();
  await expect(page.getByText("7/10").first()).toBeVisible();
  await page.getByRole("button", { name: "Improve essay" }).click();
  await expect(page.getByText(/of \d+ sentences changed/)).toBeVisible();
  await page.getByRole("button", { name: "Use as my essay" }).click();
  await expect(page.getByRole("textbox", { name: "Your essay" })).toHaveValue(/crucial/);
});

test("writing assistant edits a selection, explains, composes and saves", async ({ page }) => {
  await page.goto("/assistant");
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  // compose an essay into the empty draft
  await page.getByRole("button", { name: "Write an essay for me…" }).click();
  await page.getByPlaceholder(/Should schools start later/).fill("Why sleep matters for students");
  await page.getByRole("button", { name: "Write draft" }).click();
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(editor).toContainText("This is a short essay written by the fake model.");
  // select everything and shorten it, with an explanation
  await page.getByRole("switch", { name: /Explain major changes/ }).click();
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.locator(".flex-wrap button", { hasText: /^Shorten$/ }).first().click();
  await expect(page.getByText("Why these changes")).toBeVisible();
  await page.getByRole("button", { name: /Replace selection/ }).click();
  await expect(page.getByText("Applied — press Ctrl+Z to undo").last()).toBeVisible();
  await expect(editor).toContainText("clearly");
  // explain mistakes
  await page.getByRole("button", { name: "Explain my writing mistakes" }).click();
  await expect(page.getByText("Writing feedback")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).last().click();
  // save as a document
  await page.getByRole("textbox", { name: "Document title" }).fill("Sleep essay");
  await page.getByRole("button", { name: "Save as document" }).click();
  await expect(page).toHaveURL(/\/documents\/\d+/);
  await expect(page.getByRole("textbox", { name: "Document title" })).toHaveValue("Sleep essay");
  await expect(page.locator(".ProseMirror")).toContainText("clearly");
});
