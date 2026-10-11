import { connection } from "next/server";
import { admin, safeEqual } from "@/lib/server";
import { buildIcs } from "@/engine/ics";
import type { ScheduleBlock, Task } from "@/engine/types";

// Subscribed calendar feed: /cal/<ics_secret>.ics
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  await connection();
  const { file } = await ctx.params;
  const secret = file.replace(/\.ics$/i, "");
  const db = admin();
  const { data: s } = await db.from("otto_settings").select("owner_id, ics_secret, timezone").eq("id", 1).maybeSingle();
  if (!s?.ics_secret || !safeEqual(secret, s.ics_secret)) return new Response("Not found", { status: 404 });
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [tasks, blocks] = await Promise.all([
    db.from("tasks").select("*").eq("user_id", s.owner_id).in("status", ["todo", "waiting"]),
    db.from("schedule_blocks").select("*").eq("user_id", s.owner_id).gte("start_at", since),
  ]);
  const ics = buildIcs({ tasks: (tasks.data ?? []) as Task[], blocks: (blocks.data ?? []) as ScheduleBlock[], tz: s.timezone, now: new Date(), name: "Otto" });
  return new Response(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
}
