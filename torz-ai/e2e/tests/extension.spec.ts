import { chromium, test as base, expect, type BrowserContext, type Worker } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { token } from "./fixtures";

const EXT = path.resolve(__dirname, "../../extension");
const EXT_ID = "ceedgmdocmecinkjffjboapgailamkcb";
const TEST_PAGE = `<!doctype html><html><head><title>Typing test</title></head><body>
<textarea id="ta" aria-label="ta" rows="6" cols="60">Hello </textarea>
<div id="ce" contenteditable="true">Start </div>
<input id="inp" value="The quick brown fox is very fast.">
</body></html>`;

const test = base.extend<{ ctx: BrowserContext; sw: Worker }>({
  ctx: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "torz-ext-"));
    const ctx = await chromium.launchPersistentContext(dir, {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    await use(ctx);
    await ctx.close();
  },
  sw: async ({ ctx }, use) => {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
    await use(sw);
  },
});

test("extension loads with its fixed ID and connects to the TORZ AI app", async ({ ctx, sw, baseURL }) => {
  expect(new URL(sw.url()).host).toBe(EXT_ID);
  await sw.evaluate((u) => chrome.storage.local.set({ baseUrl: u }), baseURL);
  const app = await ctx.newPage();
  await app.goto(`${baseURL}/autotyper`);
  await expect(app.getByText(/Connected · v1\.0\.0/)).toBeVisible();
  await app.getByRole("textbox", { name: "Text to type" }).fill("Prepared in TORZ AI.");
  await app.getByRole("button", { name: "Send to extension" }).click();
  await expect(app.getByText("Sent to the TORZ AI extension")).toBeVisible();
  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${EXT_ID}/sidepanel.html`);
  await expect(panel.locator("#conn")).toHaveText(/Connected/);
  await expect(panel.locator("#typer-text")).toHaveValue("Prepared in TORZ AI.");
});

test("keyboard engine types into textareas and rich editors; progress reaches the app", async ({ ctx, sw, baseURL }) => {
  await sw.evaluate((u) => chrome.storage.local.set({ baseUrl: u }), baseURL);
  const app = await ctx.newPage();
  await app.goto(`${baseURL}/autotyper`);
  await expect(app.getByText(/Connected · v1\.0\.0/)).toBeVisible();
  const page = await ctx.newPage();
  await page.route(`${baseURL}/__typing-test`, (r) => r.fulfill({ contentType: "text/html", body: TEST_PAGE }));
  await page.goto(`${baseURL}/__typing-test`);
  await page.click("#ta");
  await page.keyboard.press("End");
  await page.bringToFront();
  await sw.evaluate(() => (globalThis as any).__torz.startTyping({ text: "world!\nSecond line.", settings: { wpm: 240, natural_rhythm: false, pause_on_punctuation: false }, engine: "keyboard", countdown: 0 }));
  expect(await page.inputValue("#ta")).toBe("Hello world!\nSecond line.");
  const st = await sw.evaluate(() => (globalThis as any).__torz.state());
  expect(st).toMatchObject({ status: "done", typed: 19, total: 19, engine: "keyboard" });
  await page.click("#ce");
  await page.keyboard.press("End");
  await sw.evaluate(() => (globalThis as any).__torz.startTyping({ text: "in Docs-style editors", settings: { wpm: 240, natural_rhythm: false }, engine: "keyboard", countdown: 0 }));
  await expect(page.locator("#ce")).toContainText("in Docs-style editors");
  // undo sends a real Ctrl+Z
  await sw.evaluate(() => (globalThis as any).__torz.undoTyping());
  await expect(page.locator("#ce")).not.toContainText("in Docs-style editors");
  await expect(app.getByText("done", { exact: true })).toBeVisible(); // progress bridged back to the web app
});

test("compatibility engine, pause/stop, and assist replace with undo", async ({ ctx, sw, baseURL }) => {
  const page = await ctx.newPage();
  await page.route(`${baseURL}/__typing-test`, (r) => r.fulfill({ contentType: "text/html", body: TEST_PAGE }));
  await page.goto(`${baseURL}/__typing-test`);
  await page.click("#ta");
  await page.keyboard.press("End");
  await page.bringToFront();
  const tab = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]);
  await sw.evaluate((t) => (globalThis as any).__torz.handleMenu({ menuItemId: "type-here", frameId: 0 }, t), tab);
  await sw.evaluate(() => (globalThis as any).__torz.startTyping({ text: "abcdefghijklmnopqrstuvwxyz", settings: { wpm: 30, natural_rhythm: false }, engine: "compatibility", countdown: 0 }));
  await expect.poll(async () => (await page.inputValue("#ta")).length).toBeGreaterThan(8);
  await sw.evaluate(() => (globalThis as any).__torz.control("pause"));
  const paused = await page.inputValue("#ta");
  await page.waitForTimeout(800);
  expect(await page.inputValue("#ta")).toBe(paused);
  await sw.evaluate(() => (globalThis as any).__torz.control("stop"));
  await expect.poll(async () => (await sw.evaluate(() => (globalThis as any).__torz.state())).status).toBe("stopped");
  await sw.evaluate(() => (globalThis as any).__torz.undoTyping());
  expect(await page.inputValue("#ta")).toBe("Hello ");
  // assist: capture a selection, replace after confirmation, undo
  await page.evaluate(() => {
    const i = document.getElementById("inp") as HTMLInputElement;
    i.focus();
    i.setSelectionRange(4, 19);
  });
  await sw.evaluate((t) => (globalThis as any).__torz.handleMenu({ menuItemId: "assist:improve", frameId: 0, selectionText: "quick brown fox" }, t), tab);
  const { assist } = await sw.evaluate(() => chrome.storage.session.get("assist"));
  expect(assist).toMatchObject({ action: "improve", text: "quick brown fox", editable: true });
  const r = await sw.evaluate(async () => {
    const { assist } = await chrome.storage.session.get("assist");
    return chrome.tabs.sendMessage(assist.tabId, { type: "agent:replace", text: "speedy red fox" }, { frameId: 0 });
  });
  expect(r).toEqual({ ok: true });
  expect(await page.inputValue("#inp")).toBe("The speedy red fox is very fast.");
  await sw.evaluate(async () => {
    const { assist } = await chrome.storage.session.get("assist");
    return chrome.tabs.sendMessage(assist.tabId, { type: "agent:undo-replace" }, { frameId: 0 });
  });
  expect(await page.inputValue("#inp")).toBe("The quick brown fox is very fast.");
});

test("side panel assist runs an AI action through TORZ AI", async ({ ctx, sw, baseURL }) => {
  await sw.evaluate((u) => chrome.storage.local.set({ baseUrl: u }), baseURL);
  expect(token().length).toBeGreaterThan(20);
  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${EXT_ID}/sidepanel.html`);
  await panel.locator("#assist-text").fill("It is very important to utilize clear words.");
  await panel.locator("#assist-action").selectOption("improve");
  await panel.locator("#assist-run").click();
  await expect(panel.locator("#assist-result")).toContainText("crucial");
  await expect(panel.locator("#assist-model")).toHaveText("fake-model:latest");
  await panel.getByRole("tab", { name: "Settings" }).click();
  await panel.locator("#base-url").fill("https://evil.example.com");
  await panel.locator("#save-base").click();
  await expect(panel.locator("#settings-msg")).toContainText("Use a local address");
});
