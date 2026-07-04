"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authErrorMessage } from "@/lib/auth-errors";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useSession } from "@/lib/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Lands here from the reset email: the recovery link signs the user into a
 * temporary session (supabase-js exchanges the token on load), and this
 * page turns it into a new password. Without a session the link is spent
 * or malformed — say so instead of showing a form that can't work.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const session = useSession();
  useDocumentTitle("Reset password — Acme Corp. Data Room");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = password.length >= 6 && !submitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(authErrorMessage(err.message));
      setSubmitting(false);
      return;
    }
    toast.success("Password updated");
    router.replace("/");
  };

  return (
    <main className="relative flex flex-1 items-center justify-center px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,_color-mix(in_srgb,_var(--brand)_8%,_transparent),_transparent_70%)]"
      />
      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-75 motion-safe:duration-300 motion-safe:ease-out-back">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/25">
            <FileText className="size-5 text-primary-foreground" strokeWidth={2} />
          </span>
          <span className="mt-1 font-heading text-2xl font-medium tracking-[-0.005em]">
            Acme Corp.
          </span>
          <span className="-mt-1.5 text-xs text-muted-foreground">
            Virtual data room
          </span>
        </div>
        <div
          className="mt-7 rounded-card border bg-card p-6 shadow-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-safe:ease-out-strong motion-safe:fill-mode-backwards"
          style={{ animationDelay: "80ms" }}
        >
          {session.status === "loading" ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-label="Loading" />
            </div>
          ) : session.status === "signed-out" ? (
            <>
              <h1 className="font-heading text-lg font-medium">
                This link has expired
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Reset links only work once and for a limited time. Request a
                new one from the sign-in screen.
              </p>
              <Button asChild className="mt-5 h-10 w-full">
                <Link href="/login">Back to sign in</Link>
              </Button>
            </>
          ) : (
            <>
              <h1 className="font-heading text-lg font-medium">
                Set a new password
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {session.user.email
                  ? `Signed in as ${session.user.email}.`
                  : "Choose a new password for your account."}
              </p>
              <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-password">New password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      className="h-10 pr-10"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError(null);
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
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
                  <p className="text-xs text-muted-foreground">
                    At least 6 characters
                  </p>
                </div>
                {error && (
                  <p className="text-sm text-danger" role="alert">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="h-10 w-full"
                >
                  {submitting && <Loader2 className="animate-spin" />}
                  Update password
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
