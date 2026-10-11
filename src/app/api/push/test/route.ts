import { connection } from "next/server";
import { admin, userFromRequest } from "@/lib/server";
import { pushToOwner } from "@/lib/jobs";

export async function POST(req: Request) {
  await connection();
  const userId = await userFromRequest(req);
  if (!userId) return Response.json({ error: "Sign in again, then send the test." }, { status: 401 });
  if (!process.env.VAPID_PRIVATE_KEY) return Response.json({ error: "Push isn't set up on the server. Add the VAPID keys and redeploy." }, { status: 503 });
  const delivered = await pushToOwner(admin(), userId, { body: "Test from Otto. Reminders work.", url: "/settings", tag: "test" });
  if (!delivered) return Response.json({ error: "No device took the test. Turn reminders off and on, then try again." }, { status: 502 });
  return Response.json({ message: `Sent to ${delivered} ${delivered === 1 ? "device" : "devices"}.` });
}
