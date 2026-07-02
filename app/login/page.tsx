"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "sign-in" | "sign-up";

/** Maps raw Supabase auth errors to specific, non-apologetic copy. */
function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Incorrect email or password";
  if (m.includes("already registered"))
    return "An account with this email already exists";
  if (m.includes("at least 6 characters"))
    return "Password must be at least 6 characters";
  if (m.includes("valid email")) return "Enter a valid email address";
  return message;
}

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in (or just signed in) → go to the app.
  useEffect(() => {
    if (session.status === "signed-in") router.replace("/");
  }, [session.status, router]);

  const canSubmit =
    email.trim().length > 0 && password.length >= 6 && !submitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    if (mode === "sign-in") {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(authErrorMessage(err.message));
        setSubmitting(false);
      }
      // Success: the session effect above redirects.
    } else {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(authErrorMessage(err.message));
        setSubmitting(false);
      } else if (!data.session) {
        // A database trigger auto-confirms new accounts, so signing in with
        // the same credentials succeeds immediately — no email round-trip.
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInErr) {
          setNotice("Account created. Sign in with your email and password.");
          setMode("sign-in");
          setSubmitting(false);
        }
        // Success: the session effect above redirects.
      }
      // If a session came straight back, the redirect effect handles it.
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand">
            <FileText className="size-4.5 text-white" strokeWidth={2} />
          </span>
          <span className="text-lg font-semibold">DataRoom</span>
        </div>
        <div className="mt-6 rounded-card border bg-card p-6">
          <h1 className="text-base font-semibold">
            {mode === "sign-in" ? "Sign in" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "sign-in"
              ? "Access your datarooms and documents."
              : "Datarooms you create are private to your account."}
          </p>
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete={
                  mode === "sign-in" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
              />
              {mode === "sign-up" && (
                <p className="text-xs text-muted-foreground">
                  At least 6 characters
                </p>
              )}
            </div>
            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="text-sm text-muted-foreground" role="status">
                {notice}
              </p>
            )}
            <Button type="submit" disabled={!canSubmit} className="w-full">
              {mode === "sign-in" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "sign-in" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="font-medium text-brand hover:underline"
                onClick={() => switchMode("sign-up")}
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="font-medium text-brand hover:underline"
                onClick={() => switchMode("sign-in")}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
