import { test } from "@playwright/test";

// Screenshot pass for visual review: npx playwright test shoot
const PAGES = ["/", "/calendar", "/calendar?view=week", "/waiting", "/goals", "/all", "/settings"];

for (const path of PAGES) {
  test(`shot ${path}`, async ({ page }, info) => {
    await page.goto(path);
    await page.waitForTimeout(1500);
    const name = path === "/" ? "today" : path.slice(1).replace(/[^a-z]+/g, "-");
    await page.screenshot({ path: `test-results/shots/${info.project.name}-${name}.png`, fullPage: true });
  });
}
