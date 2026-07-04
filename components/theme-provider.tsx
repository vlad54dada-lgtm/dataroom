"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Class-strategy theme provider: `.dark` on <html>. LIGHT by default —
 * the first impression of a legal tool is the light ledger register; dark
 * stays one toggle away and the choice persists per browser.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
