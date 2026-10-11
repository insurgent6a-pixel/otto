import { expect, test, type Page } from "@playwright/test";
import { admin, ownerId } from "./helpers";
import { addDays, localDate, zonedInstant, hm, localMinutes } from "../src/engine/time";

// The spec's "Done when" list, phase by phase. Runs against local Supabase + dev server.
// Data-changing tests run once (phone project); layout checks run on both sizes.

const TZ = "Asia/Makassar";
const stamp = () => Date.now().toString(36).slice(-5);

async function openToday(page: Page) {
  await page.goto("/");
  await page.getByRole("heading", { level: 1, name: /(Morning|Afternoon|Evening), / }).waitFor();
  await page.evaluate(() => {
    const otto = (window as unknown as { __otto: { setFocusMode: (v: boolean) => void } }).__otto;
    otto.setFocusMode(false);
  });
}

async function insertTask(fields: Record<string, unknown>) {
  const { data, error } = await admin()
    .from("tasks")
    .insert({ user_id: await ownerId(), ...fields })
    .select()
    .single();
  if (error) throw error;
  return data as { id: string; title: string };
}

async function dropAll(ids: string[]) {
  if (ids.length) await admin().from("tasks").update({ status: "dropped", forced: false }).in("id", ids);
}

test.describe("Phase 0", () => {
  test("Claude's ramble shows up live in Today and Calendar", async ({ page }, info) => {
    test.skip(info.project.name !== "phone");
    await openToday(page);
    const waitingFold = page.getByRole("button", { name: /Waiting on others/ });
    const before = Number((await waitingFold.innerText()).match(/\d+/)?.[0] ?? 0);

    const id = stamp();
    const today = localDate(new Date(), TZ);
    const tomorrow = addDays(today, 1);
    const thursday = (() => {
      let d = addDays(today, 1);
      while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 4) d = addDays(d, 1);
      return d;
    })();
    // Exactly what the Claude Project would write through the Supabase connector.
    const meeting = await insertTask({
      title: `Meeting with Demian ${id}`,
      project: "omnisync",
      scheduled_at: zonedInstant(tomorrow, "14:00", TZ).toISOString(),
      estimate_min: 30,
      source: "claude",
      raw_text: "Demian meeting tomorrow at 2 for 30 minutes",
    });
    const chase = await insertTask({
      title: `Chase Pak Arief on the Sultan DP ${id}`,
      project: "omnisync",
      status: "waiting",
      waiting_on: "Pak Arief",
      follow_up: thursday,
      source: "claude",
      raw_text: "chase Pak Arief about the Sultan DP Thursday",
    });

    // No reload: realtime pushes both rows in.
    await expect(waitingFold).toContainText(String(before + 1), { timeout: 15_000 });
    await waitingFold.click();
    await expect(page.getByText(chase.title)).toBeVisible();
    await expect(page.getByText("From Claude").first()).toBeVisible();

    await page.getByRole("link", { name: "Calendar" }).first().click();
    await page.waitForURL(/calendar/);
    // Month view is the phone default; open tomorrow's agenda.
    await page.getByRole("grid", { name: "Month" }).getByRole("gridcell", { name: /^Tomorrow/ }).click();
    await expect(page.locator("li", { hasText: meeting.title }).first()).toBeVisible({ timeout: 10_000 });
    await dropAll([meeting.id, chase.id]);
  });

  test("Siri capture lands in Unsorted", async ({ page, request }, info) => {
    test.skip(info.project.name !== "phone");
    const { data } = await admin().from("otto_settings").select("capture_secret").single();
    const word = stamp();
    const res = await request.post("/api/capture", { data: { p_secret: data!.capture_secret, p_text: `Hey Otto, buy compost bags ${word}` } });
    expect(await res.text()).toBe(`Added to Otto: Buy compost bags ${word}.`);
    await page.goto("/all");
    const unsorted = page.locator("section", { has: page.getByRole("heading", { name: /Unsorted/ }) });
    await expect(unsorted.getByText(`Buy compost bags ${word}`)).toBeVisible();
  });

  test("Tapping Low changes the next card to a 5 minute task", async ({ page }, info) => {
    test.skip(info.project.name !== "phone");
    const small = await insertTask({ title: `Reply to Sundari ${stamp()}`, project: "omnisync", estimate_min: 10 });
    await openToday(page);
    const change = page.getByRole("button", { name: "Change" });
    if (await change.isVisible()) await change.click();
    await page.getByRole("button", { name: /^Okay$/ }).click();
    const card = page.getByRole("region", { name: "Do this next" });
    await expect(card).not.toContainText(small.title);
    await page.getByRole("button", { name: "Change" }).click();
    await page.getByRole("button", { name: /^Low$/ }).click();
    await expect(card).toContainText(small.title);
    await expect(card).toContainText("Low energy pick: 5 minutes, easy win");
    await expect(page.getByText("Low battery is fine.")).toBeVisible();
    await dropAll([small.id]);
  });

  test("Saving a goal with 50jt shows a progress bar", async ({ page }, info) => {
    test.skip(info.project.name !== "phone");
    await admin().from("goals").delete().eq("user_id", await ownerId());
    await openToday(page);
    const goal = page.getByRole("region", { name: "Goal" });
    await goal.getByRole("button", { name: "Trip to Japan" }).click();
    await goal.getByPlaceholder("50jt").fill("50jt");
    await expect(goal.getByText("Rp 50.000.000")).toBeVisible();
    await goal.getByRole("button", { name: "Save goal" }).click();
    await expect(goal.getByRole("progressbar")).toBeVisible();
    await expect(goal.getByText("0% of Rp 50.000.000")).toBeVisible();
    await goal.getByRole("button", { name: "Add saved amount" }).click();
    await goal.getByLabel("Amount saved").fill("18,5jt");
    await goal.getByRole("button", { name: "Add", exact: true }).click();
    await expect(goal.getByText("Rp 18.500.000")).toBeVisible();
    await expect(goal.getByText("37% of Rp 50.000.000")).toBeVisible();
  });

  test("Just this one hides everything and survives a reload", async ({ page }) => {
    await openToday(page);
    await page.getByRole("button", { name: "Just this one" }).click();
    await expect(page.getByText("Everything else is hidden. Just this one.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Up next" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Your day" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("Everything else is hidden. Just this one.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Do this next" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Up next" })).toHaveCount(0);
    await page.getByRole("button", { name: "Show everything" }).click();
    await expect(page.getByRole("region", { name: "Up next" })).toBeVisible();
  });

  test("Pulse bar stays visible while scrolling", async ({ page }) => {
    await openToday(page);
    await page.mouse.wheel(0, 3000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    const streak = page.getByRole("status", { name: /day streak/ });
    await expect(streak).toBeInViewport();
    const box = await streak.boundingBox();
    expect(box!.y).toBeLessThan(80);
  });
});

test.describe("Phase 2", () => {
  test("A task postponed 3 times locks into the next high-energy slot", async ({ page }, info) => {
    test.skip(info.project.name !== "phone");
    const task = await insertTask({ title: `Navaho payments follow-up ${stamp()}`, project: "omnisync", priority: 2, postpone_count: 2, estimate_min: 30 });
    await page.goto(`/t/${task.id}`);
    await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
    await expect(page.getByText(/Postponed 3 times\. Locked in for \d{2}:\d{2}\./)).toBeVisible({ timeout: 15_000 });

    const db = admin();
    const { data: row } = await db.from("tasks").select("forced, postpone_count").eq("id", task.id).single();
    expect(row).toMatchObject({ forced: true, postpone_count: 3 });
    const { data: blocks } = await db.from("schedule_blocks").select("*").eq("task_id", task.id);
    expect(blocks).toHaveLength(1);
    expect(blocks![0]).toMatchObject({ pinned: true, source: "force" });
    const minute = localMinutes(blocks![0].start_at, TZ);
    expect(minute).toBeGreaterThanOrEqual(hm("08:30"));
    expect(minute).toBeLessThan(hm("11:30"));
    await dropAll([task.id]);
  });
});

test.describe("Phase 3", () => {
  test("Moving Sultan DP moves Sultan agreement after it, with a toast", async ({ page }, info) => {
    test.skip(info.project.name !== "phone");
    const id = stamp();
    const dp = await insertTask({ title: `Follow up Pak Arief on the Sultan down payment ${id}`, project: "omnisync", priority: 1, estimate_min: 30 });
    const agreement = await insertTask({ title: `Sultan agreement ${id}`, project: "omnisync", priority: 1, estimate_min: 60, depends_on: [dp.id] });
    await openToday(page);
    const db = admin();
    const blockOf = async (taskId: string) => {
      for (let i = 0; i < 30; i++) {
        const { data } = await db.from("schedule_blocks").select("*").eq("task_id", taskId).order("start_at");
        if (data?.length) return data;
        await page.waitForTimeout(500);
      }
      throw new Error(`No block for ${taskId}`);
    };
    const [dpBlock] = await blockOf(dp.id);
    const [agBefore] = await blockOf(agreement.id);
    expect(new Date(agBefore.start_at).getTime()).toBeGreaterThanOrEqual(new Date(dpBlock.end_at).getTime());

    // Drag equivalent: pin the DP block two working days later at 15:00.
    let day = addDays(localDate(agBefore.start_at, TZ), 2);
    while (new Date(`${day}T00:00:00Z`).getUTCDay() === 0) day = addDays(day, 1);
    const start = zonedInstant(day, "15:00", TZ).toISOString();
    const end = zonedInstant(day, "15:30", TZ).toISOString();
    await page.evaluate(([bid, s, e]) => (window as unknown as { __otto: { pinBlock: (a: string, b: string, c: string) => Promise<void> } }).__otto.pinBlock(bid, s, e), [dpBlock.id, start, end] as const);

    await expect(page.getByText(/Moved 1 task after Follow up Pak Arief/)).toBeVisible({ timeout: 15_000 });
    const [agAfter] = await blockOf(agreement.id);
    expect(new Date(agAfter.start_at).getTime()).toBeGreaterThanOrEqual(new Date(end).getTime());
    await dropAll([dp.id, agreement.id]);
  });
});

test.describe("Phase 4", () => {
  test("A notification link opens the exact task with Done, Tomorrow and Too big?", async ({ page }) => {
    const task = await insertTask({ title: `Send the Sundari live link ${stamp()}`, project: "omnisync", priority: 1 });
    await page.goto(`/t/${task.id}`);
    await expect(page.getByRole("heading", { level: 1, name: task.title })).toBeVisible();
    await expect(page.getByRole("button", { name: "Done" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Tomorrow", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Too big?" }).first()).toBeVisible();
    await dropAll([task.id]);
  });
});

test.describe("Phase 5", () => {
  test("Done rewards, credits the goal from value_idr, and Undo takes it back", async ({ page }, info) => {
    test.skip(info.project.name !== "phone");
    const db = admin();
    const owner = await ownerId();
    await db.from("goals").delete().eq("user_id", owner);
    await db.from("goals").insert({ user_id: owner, name: "Own studio", target_idr: 10_000_000, is_current: true });
    const task = await insertTask({ title: `Invoice Demian ${stamp()}`, project: "omnisync", priority: 0, value_idr: 2_000_000, estimate_min: 10 });
    await page.goto(`/t/${task.id}`);
    await page.getByRole("button", { name: "Done" }).first().click();
    const toast = page.getByRole("status").filter({ hasText: /Big one, done\.|Daily goal hit/ });
    await expect(toast).toBeVisible();

    const saved = async () => Number((await db.from("goals").select("saved_idr").eq("user_id", owner).eq("is_current", true).single()).data!.saved_idr);
    await expect.poll(saved).toBe(2_000_000);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(saved).toBe(0);
    const { data: events } = await db.from("task_events").select("kind").eq("task_id", task.id).order("at");
    expect(events!.map((e) => e.kind)).toEqual(["created", "done", "undone"]);

    await page.getByRole("button", { name: "Done" }).first().click();
    await page.getByRole("link", { name: "Back to Today" }).click();
    await expect(page.getByText(/Nice\. One step closer to Own studio\.|Daily goal hit\./)).toBeVisible();
    await dropAll([task.id]);
  });

  test("Changing the timezone moves the whole day", async ({ page }, info) => {
    test.skip(info.project.name !== "phone");
    await admin().from("otto_settings").update({ timezone: TZ }).eq("id", 1);
    await page.goto("/settings");
    await page.getByRole("radio", { name: /WIB/ }).click();
    await expect(page.getByText("Switched to WIB. Your day now runs on WIB time.")).toBeVisible();
    await page.goto("/");
    await expect(page.getByText(/· WIB$/)).toBeVisible();
    const { data } = await admin().from("otto_settings").select("timezone").single();
    expect(data!.timezone).toBe("Asia/Jakarta");
    await page.goto("/settings");
    await page.getByRole("radio", { name: /WITA/ }).click();
    await expect(page.getByText("Switched to WITA. Your day now runs on WITA time.")).toBeVisible();
  });
});
