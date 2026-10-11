import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Signed-in screens Lighthouse can't reach. WCAG 2.1 AA, light and dark.
const PAGES = ["/", "/calendar", "/calendar?view=week", "/waiting", "/all", "/goals", "/settings"];

for (const scheme of ["light", "dark"] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });
    for (const path of PAGES) {
      test(`axe ${scheme} ${path}`, async ({ page }) => {
        await page.goto(path);
        await page.waitForTimeout(1200);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}x ${v.nodes[0]?.target.join(" ")} :: ${v.nodes[0]?.failureSummary?.split("\n")[1] ?? ""}`);
        expect(summary, summary.join("\n")).toEqual([]);
      });
    }
  });
}
