"use client";

import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/hooks/use-session";
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
          size="icon-sm"
          aria-label="Account"
          className="ml-auto rounded-full"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-folder-bg text-xs font-semibold text-brand">
            {initial}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate" title={email}>
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void supabase.auth.signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
