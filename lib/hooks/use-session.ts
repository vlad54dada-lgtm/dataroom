"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: User };

/** Tracks the Supabase session; updates on sign-in/out in any tab. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setState(
        data.session
          ? { status: "signed-in", user: data.session.user }
          : { status: "signed-out" },
      );
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // A recovery link can land anywhere (the email's redirect falls back
      // to the site root) — always finish the flow on the reset screen.
      if (
        event === "PASSWORD_RECOVERY" &&
        window.location.pathname !== "/reset-password"
      ) {
        window.location.assign("/reset-password");
        return;
      }
      setState(
        session
          ? { status: "signed-in", user: session.user }
          : { status: "signed-out" },
      );
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
