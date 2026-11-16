import path from "node:path";
import { api, expect, MATERIAL, test } from "./fixtures";

const PDF = path.join(__dirname, "..", "files", "photosynthesis.pdf");
const DOCX = path.join(__dirname, "..", "files", "cells.docx");

test("summarizer: pasted text, uploaded PDF, offline engine and export", async ({ page }) => {
  await page.goto("/summarizer");
  await page.getByRole("textbox", { name: "Source material" }).fill(MATERIAL);
  await page.getByRole("radio", { name: "Bullet points" }).click();
  await page.getByRole("button", { name: "Summarize", exact: true }).click();
  await expect(page.locator(".prose-torz li").first()).toBeVisible();
  await expect(page.getByText(/→ \d+ words/)).toBeVisible();
  // uploaded PDF
  await page.getByRole("radio", { name: "Upload file" }).click();
  await page.locator('input[type="file"]').last().setInputFiles(PDF);
  await expect(page.getByText(/photosynthesis.pdf: \d+ words extracted/)).toBeVisible();
  await page.getByRole("radio", { name: "Short", exact: true }).click();
  await page.getByRole("button", { name: "Summarize", exact: true }).click();
  await expect(page.locator(".prose-torz").first()).toContainText(/Photosynthesis|Calvin/);
  // offline engine
  await page.getByRole("radio", { name: "Offline engine" }).click();
  await page.getByRole("radio", { name: "Key vocabulary" }).click();
  await page.getByRole("button", { name: "Summarize", exact: true }).click();
  await expect(page.getByText("Offline engine").first()).toBeVisible();
  await expect(page.locator(".prose-torz strong").first()).toBeVisible();
  // download as Word
  await page.getByRole("button", { name: "Download" }).last().click();
  const dl = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Word document (.docx)" }).click();
  expect((await dl).suggestedFilename()).toMatch(/\.docx$/);
});

test("smart notes: generate, edit, persist after reload, export and library", async ({ page }) => {
  await page.goto("/notes");
  await page.getByRole("textbox", { name: "Source material" }).fill(MATERIAL);
  await page.getByRole("button", { name: "Generate notes" }).click();
  await expect(page).toHaveURL(/\/notes\/\d+/);
  await expect(page.locator(".ProseMirror")).toContainText("Key concepts");
  await page.getByRole("textbox", { name: "Note title" }).fill("Photosynthesis notes");
  await page.getByRole("textbox", { name: "Tags" }).fill("biology, unit 3");
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" My own addition.");
  await expect(page.getByText(/^Saved/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Note title" })).toHaveValue("Photosynthesis notes");
  await expect(page.locator(".ProseMirror")).toContainText("My own addition.");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "Markdown (.md)" }).click();
  expect((await dl).suggestedFilename()).toBe("Photosynthesis notes.md");
  await page.getByRole("button", { name: "Back to notes" }).click();
  await expect(page.getByText("#biology").first()).toBeVisible();
  await page.getByPlaceholder("Search notes").fill("own addition");
  await expect(page.getByText("Photosynthesis notes")).toBeVisible();
});

test("document workspace: create, autosave, reload, rename, folders, trash, restore, export", async ({ page }) => {
  await page.goto("/documents");
  await page.getByRole("button", { name: "New document" }).first().click();
  await expect(page).toHaveURL(/\/documents\/\d+/);
  const url = page.url();
  await page.getByRole("textbox", { name: "Document title" }).fill("Term paper");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("The first paragraph of my term paper.");
  await page.getByRole("button", { name: "Bold (Ctrl+B)" }).click();
  await page.keyboard.type(" Bold point.");
  await expect(page.getByText(/Saved just now/)).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Document title" })).toHaveValue("Term paper");
  await expect(page.locator(".ProseMirror")).toContainText("The first paragraph of my term paper.");
  await expect(page.locator(".ProseMirror strong")).toContainText("Bold point.");
  // version history after explicit save
  await page.keyboard.press("Control+s");
  await expect(page.getByText("Saved — a version snapshot was kept")).toBeVisible();
  await page.getByRole("button", { name: "Versions" }).click();
  await expect(page.getByRole("button", { name: "Restore" }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  // export
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "PDF (.pdf)" }).click();
  expect((await dl).suggestedFilename()).toBe("Term paper.pdf");
  // library operations
  await page.goto("/documents");
  page.once("dialog", () => undefined);
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByRole("textbox", { name: "Folder name" }).fill("History class");
  await page.getByRole("button", { name: "Create" }).click();
  const row = page.locator(".card", { hasText: "Term paper" });
  await row.getByRole("button", { name: "Document options" }).click();
  await page.getByRole("menuitem", { name: "Move to History class" }).click();
  await page.getByRole("button", { name: /History class/ }).click();
  await expect(page.getByText("Term paper", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Document options" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("Final term paper");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByText("Final term paper")).toBeVisible();
  await page.locator(".card", { hasText: "Final term paper" }).getByRole("button", { name: "Document options" }).click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.getByText("Final term paper")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await page.getByRole("button", { name: "All documents" }).click();
  await expect(page.getByText("Final term paper")).toBeVisible();
  await page.goto(url);
  await expect(page.locator(".ProseMirror")).toContainText("Bold point.");
});

test("import a Word document into the workspace", async ({ page }) => {
  await page.goto("/documents");
  await page.locator('input[type="file"]').setInputFiles(DOCX);
  await expect(page).toHaveURL(/\/documents\/\d+/);
  await expect(page.locator(".ProseMirror")).toContainText("The nucleus contains DNA");
  await expect(page.locator(".ProseMirror h1")).toContainText("Cell Biology");
});

test("PDF reader: upload, render pages, extracted text, send to study tools", async ({ page }) => {
  await page.goto("/pdf");
  await page.locator('input[type="file"]').setInputFiles(PDF);
  await expect(page).toHaveURL(/\/pdf\/\d+/);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("1 / 2")).toBeVisible();
  const h = await page.locator("canvas").evaluate((c: HTMLCanvasElement) => c.height);
  expect(h).toBeGreaterThan(200);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("2 / 2")).toBeVisible();
  await page.getByRole("tab", { name: "Extracted text" }).click();
  await expect(page.getByText(/Chapter 2/)).toBeVisible();
  await page.getByRole("tab", { name: "Study tools" }).click();
  await page.getByRole("button", { name: "Flashcards" }).click();
  await expect(page).toHaveURL(/\/flashcards$/);
  await expect(page.getByRole("button", { name: /photosynthesis.pdf/ })).toBeVisible(); // file preselected
  await page.goto("/pdf");
  await expect(page.getByText("photosynthesis.pdf")).toBeVisible();
});

test("autotyper: preview typing, choose text, send job, Google Docs setup screen", async ({ page }) => {
  const doc = await api(page, "POST", "/api/documents", { title: "Typing source", content_html: "<p>Type this text please.</p>" });
  await page.goto("/autotyper");
  await page.getByRole("button", { name: "Choose from TORZ AI" }).click();
  await page.getByRole("button", { name: /Typing source/ }).click();
  await expect(page.getByRole("textbox", { name: "Text to type" })).toHaveValue("Type this text please.");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.locator(".stream-caret")).toContainText("Type", { timeout: 10_000 });
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Not detected in this browser")).toBeVisible(); // no extension in this project
  await page.getByRole("button", { name: "Send to extension" }).click();
  await expect(page.getByText("Sent to the TORZ AI extension")).toBeVisible();
  const latest = await api(page, "GET", "/api/autotyper/jobs/latest");
  expect(latest.job.text).toBe("Type this text please.");
  await page.getByRole("radio", { name: "Google Docs API" }).click();
  await expect(page.getByText("Connect Google Docs (one-time setup, free)")).toBeVisible();
  expect(doc.id).toBeGreaterThan(0);
});
