import { connection } from "next/server";
import { safeEqual } from "@/lib/server";
import { tick } from "@/lib/jobs";

export const maxDuration = 60;

// pg_cron calls this every 5 minutes with the CRON_SECRET bearer token.
async function handle(req: Request) {
  await connection();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!safeEqual(token, process.env.CRON_SECRET)) return Response.json({ error: "Wrong cron secret." }, { status: 401 });
  try {
    return Response.json(await tick());
  } catch (err) {
    console.error("tick failed", err);
    return Response.json({ error: err instanceof Error ? err.message : "Tick failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
