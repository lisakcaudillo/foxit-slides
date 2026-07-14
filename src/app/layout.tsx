import type { Metadata, Viewport } from "next";
import NavBar from "@/components/NavBar";
import MainContent from "@/components/MainContent";
import Providers from "@/components/Providers";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Foxit Slides",
  description: "Generate beautiful presentations with AI",
};

// Explicit viewport so iPad / iOS Safari renders at device width and
// taps land on intended targets. Without this, mobile Safari falls back
// to a 980px viewport and tap coordinates get scaled, which on iPad
// presented as "Create button works, nothing else tappable" (the form
// submit path still fired, but onClick / <a href> targets missed).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full antialiased", "font-sans", geist.variable)}>
      <body className="min-h-full">
        <Providers>
          <NavBar />
          <MainContent>{children}</MainContent>
        </Providers>
      </body>
    </html>
  );
}
