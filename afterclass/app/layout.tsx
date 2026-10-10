import type { Metadata } from "next";
import { Navigation } from "@/components/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "AfterClass — Discover what drives you",
  description: "Reflect on your day, discover possible interests, and explore a small next step.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <Navigation />
        <main id="main" className="shell">{children}</main>
        <footer className="shell">Reflect → Discover → Explore. A starting point, not a career verdict.</footer>
      </body>
    </html>
  );
}
