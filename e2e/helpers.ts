import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

export const EMAIL = process.env.OTTO_EMAIL ?? "electra@otto.test";
export const PASSWORD = process.env.OTTO_PASSWORD!;

export const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });

const greeting = (page: Page) => page.getByRole("heading", { level: 1, name: /(Morning|Afternoon|Evening), / });

/** Signs in with email and password; on a fresh database it creates the account first. */
export async function signIn(page: Page, email = EMAIL, password = PASSWORD) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const outcome = await Promise.race([
    greeting(page).waitFor({ timeout: 30_000 }).then(() => "in" as const),
    page.getByRole("alert").filter({ hasText: "Wrong email or password" }).waitFor({ timeout: 30_000 }).then(() => "no-account" as const),
  ]);
  if (outcome === "no-account") {
    await page.getByRole("button", { name: "First time? Create your account" }).click();
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await greeting(page).waitFor({ timeout: 30_000 });
  }
}

export async function ownerId(): Promise<string> {
  const { data } = await admin().from("otto_settings").select("owner_id").eq("id", 1).single();
  return data!.owner_id as string;
}
