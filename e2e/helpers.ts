import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

export const EMAIL = process.env.OTTO_EMAIL ?? "electra@otto.test";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });

export async function latestCode(email: string, after: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const body = (await res.json()) as { messages?: { ID: string; Created: string }[] };
    const fresh = (body.messages ?? []).filter((m) => new Date(m.Created).getTime() >= after - 2000);
    if (fresh.length) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${fresh[0].ID}`)).json()) as { Text?: string; HTML?: string };
      const code = `${msg.Text ?? ""} ${msg.HTML ?? ""}`.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No sign-in code arrived for ${email}`);
}

export async function signIn(page: Page, email = EMAIL) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  const sentAt = Date.now();
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  const code = await latestCode(email, sentAt);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in with code" }).click();
  await page.getByRole("heading", { level: 1, name: /(Morning|Afternoon|Evening), / }).waitFor({ timeout: 30_000 });
}

export async function ownerId(): Promise<string> {
  const { data } = await admin().from("otto_settings").select("owner_id").eq("id", 1).single();
  return data!.owner_id as string;
}
