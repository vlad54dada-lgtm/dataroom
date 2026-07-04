"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import { shake } from "@/lib/shake";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useSession } from "@/lib/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";

type Mode = "sign-in" | "sign-up" | "forgot";

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  useDocumentTitle("Sign in — Acme Corp. Data Room");
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  // Already signed in (or just signed in) → back to where the user was
  // headed (?next= set by the auth guard), or the app root.
  useEffect(() => {
    if (session.status !== "signed-in") return;
    const next = new URLSearchParams(window.location.search).get("next");
    router.replace(
      next && next.startsWith("/") && !next.startsWith("//") ? next : "/",
    );
  }, [session.status, router]);

  const canSubmit =
    email.trim().length > 0 &&
    (mode === "forgot" || password.length >= 6) &&
    !submitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    if (mode === "forgot") {
      const { error: err } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/reset-password` },
      );
      if (err) setError(authErrorMessage(err.message));
      else
        setNotice(
          `Check ${email.trim()} for a link to reset your password.`,
        );
      setSubmitting(false);
    } else if (mode === "sign-in") {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(authErrorMessage(err.message));
        shake(passwordRef.current);
        passwordRef.current?.focus();
        passwordRef.current?.select();
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
    <main className="relative flex flex-1 items-center justify-center px-6 py-12">
      {/* Theme toggle, mirrored top-right — the login screen gets the same
          light/dark control as the rest of the app. */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      {/* One quiet entrance on the whole column — a document is simply
          there; no three-beat choreography. */}
      <div className="relative w-full max-w-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        <div className="flex flex-col items-center gap-2">
          <span className="flex size-11 items-center justify-center rounded-lg bg-primary shadow-card">
            <FileText className="size-5 text-primary-foreground" strokeWidth={2} />
          </span>
          <span className="mt-1 font-heading text-2xl font-medium tracking-[-0.005em]">
            Acme Corp.
          </span>
          <span className="-mt-1.5 text-xs text-muted-foreground">
            Virtual data room
          </span>
        </div>
        <div className="mt-7 rounded-card border bg-card p-6 shadow-card">
          {/* Keyed on mode so switching sign-in ⇄ sign-up morphs the copy in
              instead of hard-cutting — the only snap on an animated screen. */}
          <div
            key={mode}
            className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-safe:ease-out-strong"
          >
            <h1 className="font-heading text-lg font-medium">
              {mode === "sign-in"
                ? "Sign in"
                : mode === "sign-up"
                  ? "Create your account"
                  : "Reset your password"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "sign-in"
                ? "Access your datarooms and documents."
                : mode === "sign-up"
                  ? "Datarooms you create are private to your account."
                  : "We'll email you a link to set a new one."}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                className="h-10"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                autoFocus
              />
            </div>
            {mode !== "forgot" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="login-password">Password</Label>
                {mode === "sign-in" && (
                  <button
                    type="button"
                    className="text-xs font-medium text-brand hover:underline"
                    onClick={() => switchMode("forgot")}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  id="login-password"
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "sign-in" ? "current-password" : "new-password"
                  }
                  className="h-10 pr-10"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  aria-invalid={mode === "sign-in" && error ? true : undefined}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {mode === "sign-up" && (
                <p className="text-xs text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
                  At least 6 characters
                </p>
              )}
            </div>
            )}
            {error && (
              <p
                className="text-sm text-danger motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
                role="alert"
              >
                {error}
              </p>
            )}
            {notice && (
              <p className="text-sm text-muted-foreground" role="status">
                {notice}
              </p>
            )}
            <Button type="submit" disabled={!canSubmit} className="h-10 w-full">
              {submitting && <Loader2 className="animate-spin" />}
              {mode === "sign-in"
                ? "Sign in"
                : mode === "sign-up"
                  ? "Create account"
                  : "Send reset link"}
            </Button>
          </form>
        </div>
        <p className="mt-5 text-center text-sm text-muted-foreground">
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
          ) : mode === "sign-up" ? (
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
          ) : (
            <>
              Remembered it?{" "}
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
