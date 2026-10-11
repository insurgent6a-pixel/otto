"use client";

import { useState } from "react";
import { sb } from "@/lib/supabase";
import { Button, inputClass } from "./ui";
import { OttoMark } from "./Icons";
import { useOtto } from "@/lib/store";

export function Login() {
  const error = useOtto((s) => s.error);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "sent">("email");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(error);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return setMsg("Enter your email to get a sign-in link.");
    setBusy(true);
    setMsg(null);
    const { error: err } = await sb().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (err) return setMsg(`Couldn't send the link: ${err.message}`);
    setStage("sent");
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length < 6) return setMsg("Enter the 6-digit code from the email.");
    setBusy(true);
    setMsg(null);
    const { error: err } = await sb().auth.verifyOtp({ email: email.trim(), token, type: "email" });
    setBusy(false);
    if (err) setMsg("That code didn't work. Check the newest email or send a new one.");
  };

  return (
    <main className="safe-top flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex items-center gap-3">
          <OttoMark size={44} />
          <span className="brand text-[26px] text-ink">OTTO</span>
        </div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">
          {stage === "email" ? "Sign in to Otto" : "Check your email"}
        </h1>
        <p className="mt-2 text-[16px] text-muted">
          {stage === "email"
            ? "Otto sends a sign-in link. No password."
            : `Tap the link in the email to ${email}, or type the 6-digit code here. On iPhone, use the code so you stay signed in on your home screen.`}
        </p>

        {stage === "email" ? (
          <form onSubmit={send} className="mt-8 space-y-3">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email"
            />
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy ? "Sending link..." : "Send sign-in link"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-8 space-y-3">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className={`${inputClass} num text-center text-[22px] tracking-[0.3em]`}
              value={code}
              maxLength={10}
              onChange={(e) => setCode(e.target.value)}
              aria-label="6-digit code"
            />
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy ? "Checking code..." : "Sign in with code"}
            </Button>
            <button type="button" className="min-h-11 w-full text-[15px] text-muted" onClick={() => setStage("email")}>
              Use a different email
            </button>
          </form>
        )}
        {msg && <p className="mt-4 text-[15px] text-late" role="alert">{msg}</p>}
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
