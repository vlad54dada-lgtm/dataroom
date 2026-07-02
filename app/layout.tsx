import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Acme Corp. Data Room",
  description:
    "Acme Corp.'s virtual data room for organizing and reviewing due-diligence documents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          {/* Offset above the trash FAB (right-6 bottom-6, 48px) so toasts
              never cover its badge, the fly-to-trash landing, or the peek. */}
          <Toaster
            position="bottom-right"
            closeButton
            offset={{ bottom: 88 }}
            mobileOffset={{ bottom: 88 }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
