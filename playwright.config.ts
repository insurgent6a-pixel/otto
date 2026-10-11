import { defineConfig } from "@playwright/test";

// Runs against a local Supabase stack (npx supabase start) and the dev server.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.OTTO_URL ?? "http://localhost:3000",
    storageState: "e2e/.auth/state.json",
    channel: process.env.PW_CHANNEL ?? "msedge",
    timezoneId: "Asia/Makassar",
    locale: "en-GB",
  },
  projects: [
    { name: "phone", use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
