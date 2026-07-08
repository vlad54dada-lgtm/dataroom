"use client";

import Link from "next/link";
import { LogOut, Share2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/hooks/use-session";
import { clearAsyncCache } from "@/lib/hooks/use-async";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Account chip in the header: avatar initial, email, sign out. */
export function UserMenu() {
  const session = useSession();
  if (session.status !== "signed-in") return null;
  const email = session.user.email ?? "Account";
  const initial = email.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Account"
          className="rounded-full"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-folder-bg text-sm font-semibold text-brand ring-1 ring-brand/15 ring-inset">
            {initial}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate" title={email}>
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/access">
            <Share2 /> Sharing &amp; access
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            clearAsyncCache(); // never leak one account's data into the next
            void supabase.auth.signOut();
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
