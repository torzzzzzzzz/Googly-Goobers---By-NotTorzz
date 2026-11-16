import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

// One fresh data directory per run (inherited by workers through the environment).
process.env.TORZ_E2E_DATA ??= path.join(os.tmpdir(), `torz-e2e-${Date.now()}`);
const DATA = process.env.TORZ_E2E_DATA;
const PORT = Number(process.env.TORZ_E2E_PORT ?? 8790);
const FAKE_PORT = 11500;
const LIVE = process.env.TORZ_E2E_LIVE === "1"; // use the real local Ollama instead of the fake model
const PY = process.env.TORZ_PYTHON ?? path.resolve(__dirname, "../backend/.venv/bin/python");
const BACKEND = path.resolve(__dirname, "../backend");

export default defineConfig({
  testDir: "./tests",
  timeout: LIVE ? 600_000 : 60_000,
  expect: { timeout: LIVE ? 300_000 : 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "off",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  webServer: [
    ...(LIVE
      ? []
      : [{ command: `${PY} tests/fake_ollama_server.py --port ${FAKE_PORT}`, cwd: BACKEND, url: `http://127.0.0.1:${FAKE_PORT}/api/version`, reuseExistingServer: false }]),
    {
      command: `${PY} -m torz.launcher run --no-browser`,
      cwd: BACKEND,
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        TORZ_DATA_DIR: DATA,
        TORZ_PORT: String(PORT),
        TORZ_DISABLE_KEYRING: "1",
        ...(LIVE ? {} : { TORZ_OLLAMA_URL: `http://127.0.0.1:${FAKE_PORT}` }),
      },
    },
  ],
  projects: [
    { name: "app", testIgnore: /extension\.spec\.ts/ },
    { name: "extension", testMatch: /extension\.spec\.ts/ },
  ],
});
