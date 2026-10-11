import { expect, test } from "@playwright/test";

// Spec 19: first load under 2 seconds on 4G. Run against a production build:
//   npm run build && npx next start -p 3001 & OTTO_URL=http://localhost:3001 npx playwright test perf --project phone
test("signed-in first load shows the green card fast on 4G", async ({ page, context }, info) => {
  test.skip(info.project.name !== "phone");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 100,
    downloadThroughput: (4 * 1024 * 1024) / 8,
    uploadThroughput: (3 * 1024 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const measure = async () => {
    const start = Date.now();
    await page.goto("/", { waitUntil: "commit" });
    await page.getByRole("region", { name: "Do this next" }).waitFor({ timeout: 20_000 });
    return Date.now() - start;
  };

  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("otto.cache"));
  // First visit: nothing in the HTTP cache and no saved state.
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const first = await measure();
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
  await page.evaluate(() => localStorage.removeItem("otto.cache"));
  const cold = await measure();
  const warm = await measure();
  console.log(`first visit ${first}ms, data-cold ${cold}ms, warm ${warm}ms`);
  expect(first).toBeLessThan(2000);
  expect(warm).toBeLessThan(1000);
});
