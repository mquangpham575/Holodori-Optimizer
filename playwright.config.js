import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    viewport: { width: 1600, height: 1000 },
    trace: "retain-on-failure",
  },
  // Auto-start the backend API and the Vite dev server before running.
  webServer: [
    {
      command: "npm run dev:backend",
      port: 5000,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npx vite frontend",
      port: 5173,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
