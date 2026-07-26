import { defineConfig } from "@playwright/test";

/**
 * Smallest maintainable Playwright setup for the startup-critical smoke
 * flow (阶段：release-blocking repair). No E2E framework existed in the
 * repo before this — this is deliberately narrow: fresh-load the three
 * edition URLs, confirm real content and branding, confirm no uncaught
 * console errors, confirm the Operator advertising destination. Not a
 * general UI test suite.
 *
 * Assumes the frontend dev server is already running on :5173 (e.g. via
 * `npm run bootstrap` from the repo root) — `reuseExistingServer` means
 * this does not spawn a second server if one is already up, and does
 * not manage the backend/launchd services at all, consistent with
 * "the launcher and npm bootstrap must use the same underlying
 * orchestration logic" — Playwright is a verifier, not a second
 * bootstrap implementation.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
