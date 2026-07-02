"use client";

import { useCallback } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadDropzoneProps {
  /**
   * Receives EVERY dropped/picked file — including ones the dropzone's
   * `accept` filter rejected. Validation is done in code (partitionPdfs),
   * never trusted to the picker: drag&drop bypasses `accept`.
   */
  onFiles: (files: File[]) => void;
  /** Render prop exposing `open` so the toolbar Upload button owns the picker. */
  children: (controls: { open: () => void }) => React.ReactNode;
}

/**
 * Full-area drop target for the room content. The drop overlay is the app's
 * one deliberate motion moment: a short fade with a dashed accent border.
 * `noClick` keeps row clicks from opening the picker.
 */
export function UploadDropzone({ onFiles, children }: UploadDropzoneProps) {
  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      onFiles([...accepted, ...rejections.map((r) => r.file)]);
    },
    [onFiles],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    accept: { "application/pdf": [".pdf"] }, // picker happy path only
  });

  return (
    <div
      {...getRootProps({
        className: "relative flex flex-1 flex-col outline-none",
      })}
    >
      <input {...getInputProps()} />
      {children({ open })}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-card border-2 border-dashed border-brand bg-folder-bg/80 opacity-0 transition-opacity duration-150 motion-reduce:transition-none",
          isDragActive && "opacity-100",
        )}
      >
        {/* dark:brand-hover — plain brand blue reads 4.3:1 on the tinted
            dark wash, just under AA; the lighter step clears it. */}
        <div className="flex flex-col items-center gap-2 text-brand dark:text-brand-hover">
          <Upload className="size-8" strokeWidth={1.75} />
          <p className="text-sm font-medium">Drop PDF files to upload</p>
        </div>
      </div>
    </div>
  );
}
