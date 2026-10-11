"use client";

import { useState } from "react";
import { sb } from "@/lib/supabase";
import { Button, inputClass } from "./ui";
import { OttoMark } from "./Icons";
import { useOtto } from "@/lib/store";

/** Supabase's messages, in Otto's words: what failed and what to do. */
function explain(message: string, mode: "signin" | "create"): string {
  if (/invalid login credentials/i.test(message)) return "Wrong email or password. Try again.";
  if (/already registered|already been registered|already exists/i.test(message)) return "That email already has an account. Sign in instead.";
  if (/signups? not allowed|signup is disabled/i.test(message)) return "New accounts are turned off. Sign in with your existing account.";
  if (/password should be at least|weak password|password is too/i.test(message)) return "Use a password of at least 8 characters.";
  if (/email not confirmed/i.test(message)) return "Email confirmation is still on in Supabase. Turn off Confirm email, then sign in.";
  if (/rate limit|too many/i.test(message)) return "Too many tries. Wait a minute, then try again.";
  if (/fetch|network/i.test(message)) return "Couldn't reach Otto. Check your connection and try again.";
  return mode === "signin" ? `Couldn't sign in: ${message}` : `Couldn't create the account: ${message}`;
}

export function Login() {
  const error = useOtto((s) => s.error);
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(error);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return setMsg("Enter your email.");
    if (password.length < (mode === "create" ? 8 : 1)) {
      return setMsg(mode === "create" ? "Use a password of at least 8 characters." : "Enter your password.");
    }
    setBusy(true);
    setMsg(null);
    const auth = sb().auth;
    if (mode === "signin") {
      const { error: err } = await auth.signInWithPassword({ email: email.trim(), password });
      if (err) setMsg(explain(err.message, mode));
    } else {
      const { data, error: err } = await auth.signUp({ email: email.trim(), password });
      if (err) setMsg(explain(err.message, mode));
      else if (!data.session) setMsg("Email confirmation is still on in Supabase. Turn off Confirm email, then sign in.");
    }
    setBusy(false);
  };

  return (
    <main className="safe-top flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex items-center gap-3">
          <OttoMark size={44} />
          <span className="brand text-[26px] text-ink">OTTO</span>
        </div>
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">
          {mode === "signin" ? "Sign in to Otto" : "Create your Otto account"}
        </h1>
        {mode === "create" && <p className="mt-2 text-[16px] text-muted">The first account becomes Otto&apos;s owner.</p>}

        <form onSubmit={submit} className="mt-8 space-y-3">
          <input
            type="email"
            name="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            placeholder="you@example.com"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email"
          />
          <input
            type="password"
            name="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="Password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Password"
          />
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
            {busy ? (mode === "signin" ? "Signing in..." : "Creating account...") : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
        {msg && (
          <p className="mt-4 text-[15px] text-late" role="alert">
            {msg}
          </p>
        )}
        <button
          type="button"
          className="mt-4 min-h-11 w-full text-[15px] text-muted"
          onClick={() => {
            setMode(mode === "signin" ? "create" : "signin");
            setMsg(null);
          }}
        >
          {mode === "signin" ? "First time? Create your account" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}

export function Unconfigured() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-md">
        <OttoMark size={40} />
        <h1 className="mt-6 text-[24px] font-semibold">Otto isn&apos;t connected to a database yet</h1>
        <p className="mt-2 text-muted">
          Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the environment, then redeploy. SETUP.md has the steps.
        </p>
      </div>
    </main>
  );
}

export function Foreign() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-md">
        <OttoMark size={40} />
        <h1 className="mt-6 text-[24px] font-semibold">This Otto belongs to someone else</h1>
        <p className="mt-2 text-muted">Sign out and use the email that set Otto up.</p>
        <Button className="mt-6" onClick={() => void sb().auth.signOut()}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
