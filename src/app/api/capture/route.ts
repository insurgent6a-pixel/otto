import { connection } from "next/server";
import { admin, safeEqual } from "@/lib/server";
import { parseQuickAdd } from "@/engine/parse";
import { fixNames } from "@/engine/fuzzy";
import { DEFAULT_SETTINGS } from "@/engine/types";

// Siri Shortcut target (phase 2): same contract as the otto_capture RPC, plus the parser and name fixer.
export async function POST(req: Request) {
  await connection();
  const body = (await req.json().catch(() => ({}))) as { p_secret?: string; p_text?: string; secret?: string; text?: string };
  const secret = body.p_secret ?? body.secret;
  const raw = (body.p_text ?? body.text ?? "").toString();
  const db = admin();
  const { data: s } = await db.from("otto_settings").select("owner_id, capture_secret, timezone").eq("id", 1).maybeSingle();
  if (!s?.capture_secret || !safeEqual(secret, s.capture_secret)) {
    return new Response("Wrong capture key. Check the Otto Shortcut.", { status: 401 });
  }
  const clean = raw.replace(/^\s*(hey\s+)?otto[,.\s]*(please\s+)?(add\s+)?/i, "").trim();
  if (!clean) return new Response("Didn't catch that. Try again.");

  const tz = (s.timezone as string) || DEFAULT_SETTINGS.timezone;
  const { data: open } = await db.from("tasks").select("id, title").eq("user_id", s.owner_id).in("status", ["todo", "waiting"]);
  const parsed = parseQuickAdd(fixNames(clean), { now: new Date(), tz, openTasks: open ?? [] });
  const title = parsed.title || fixNames(clean);
  const { error } = await db.from("tasks").insert({ ...parsed.fields, title, user_id: s.owner_id, source: "siri", raw_text: raw });
  if (error) return new Response(`Couldn't save it: ${error.message}`, { status: 500 });
  const extras = parsed.chips.map((c) => c.label.charAt(0).toLowerCase() + c.label.slice(1)).slice(0, 2);
  return new Response(`Added to Otto: ${title}${extras.length ? `, ${extras.join(", ")}` : ""}.`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
