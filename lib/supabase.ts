import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

/**
 * Browser Supabase client (singleton). Data access still goes through
 * lib/storage.ts — components only touch this indirectly via the auth
 * surfaces (login page, session hook, user menu).
 */
export const supabase = createClient(url, anonKey);
