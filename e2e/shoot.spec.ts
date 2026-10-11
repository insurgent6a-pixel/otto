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

test.describe("dark", () => {
  test.use({ colorScheme: "dark" });
  for (const path of ["/", "/calendar", "/goals"]) {
    test(`shot dark ${path}`, async ({ page }, info) => {
      await page.goto(path);
      await page.waitForTimeout(1500);
      const name = path === "/" ? "today" : path.slice(1);
      await page.screenshot({ path: `test-results/shots/${info.project.name}-dark-${name}.png`, fullPage: true });
    });
  }
});

test("shot sheets", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("region", { name: "Do this next" }).waitFor();
  await page.keyboard.press("n");
  await page.getByRole("textbox", { name: "Task", exact: true }).fill("navajo payments fri? at 2pm !1 #omni ~30m Rp5jt");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-results/shots/${info.project.name}-sheet-add.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("region", { name: "Do this next" }).getByRole("heading").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-results/shots/${info.project.name}-sheet-edit.png` });
});
