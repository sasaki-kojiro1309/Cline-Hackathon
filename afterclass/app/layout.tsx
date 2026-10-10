import type { Metadata } from "next";
import { Navigation } from "@/components/navigation";
import { AccountPanel } from "@/components/account-panel";
import { AuthGate } from "@/components/auth-gate";
import { PaperShapes } from "@/components/paper-shapes";
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
        <main id="main" className="stage">
          <PaperShapes />
          <div className="shell content-layer"><AuthGate>{children}<AccountPanel /></AuthGate></div>
        </main>
        <footer><div className="shell footer-inner"><span className="footer-brand">AfterClass.</span><p>Reflect → Discover → Explore.<br />A starting point, not a career verdict.</p><p className="small">Your curiosity belongs here.<br />Essential sign-in cookies only.</p></div></footer>
      </body>
    </html>
  );
}
