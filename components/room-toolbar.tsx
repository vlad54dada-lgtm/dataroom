"use client";

import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RoomToolbarProps {
  onNewFolder: () => void;
  /** Upload button lands here with the upload feature — no dead controls. */
  children?: React.ReactNode;
}

export function RoomToolbar({ onNewFolder, children }: RoomToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button variant="outline" onClick={onNewFolder}>
        <FolderPlus /> New folder
      </Button>
      {children}
    </div>
  );
}
