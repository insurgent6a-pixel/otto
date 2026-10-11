import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { signIn } from "./helpers";

export default async function globalSetup(config: FullConfig) {
  const { baseURL, channel } = config.projects[0].use;
  mkdirSync("e2e/.auth", { recursive: true });
  const browser = await chromium.launch({ channel });
  const page = await browser.newPage({ baseURL, timezoneId: "Asia/Makassar" });
  await signIn(page);
  await page.context().storageState({ path: "e2e/.auth/state.json" });
  await browser.close();
}
