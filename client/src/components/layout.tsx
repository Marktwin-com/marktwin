import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { FolderOpen, Github } from "lucide-react";
import Logo from "@/assets/Logo.jsx";
import React from "react";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();

  const handleContactClick = (e: React.MouseEvent) => {
    if (location === "/faq") {
      e.preventDefault();
      document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
      window.history.replaceState(null, "", "/faq#contact");
    }
  };

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-[hsl(var(--obsidian-bg))] text-[hsl(var(--obsidian-text))] relative flex flex-col">
      {/* Background Watermark */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.015] z-0 flex items-center justify-center">
        <Logo className="w-2/3 max-w-3xl h-auto object-contain text-[hsl(var(--primary))]" />
      </div>

      {/* Header Navigation */}
      <nav className="w-full bg-transparent border-b border-[hsl(var(--obsidian-border))]/20 relative z-10">
        <div className="container mx-auto flex min-w-0 items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 cursor-pointer">
            <Logo className="h-6 w-6 text-[hsl(var(--primary))]" />
            <span className="text-lg font-semibold text-[hsl(var(--obsidian-text))]">Marktwin</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2 text-sm sm:gap-5">
            <Link href="/faq" className="hidden text-[hsl(var(--obsidian-text-muted))] hover:text-[hsl(var(--obsidian-text))] sm:block">FAQ</Link>
            <Link href="/faq#contact" onClick={handleContactClick} className="hidden text-[hsl(var(--obsidian-text-muted))] hover:text-[hsl(var(--obsidian-text))] md:block">Contact Us</Link>
            <a
              href="https://github.com/OptimAI-labs/marktwin"
              target="_blank"
              rel="noreferrer"
              className="text-[hsl(var(--obsidian-text-muted))] hover:text-[hsl(var(--obsidian-text))]"
              title="View source on GitHub"
              aria-label="View Marktwin source on GitHub"
            >
              <Github className="h-5 w-5" />
            </a>
            <Button
              onClick={() => setLocation("/my-cabinets")}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <FolderOpen className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Workspaces</span>
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto min-w-0 px-4 pb-8 pt-8 relative z-10 flex-1 sm:pt-12">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-transparent border-t border-[hsl(var(--obsidian-border))]/20 mt-8 relative z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-center">
          <p className="text-[hsl(var(--obsidian-text-muted))] text-xs text-center">
            Marktwin is a product of{' '}
            <a
              href="https://www.optimailabs.cl/"
              target="_blank"
              rel="noreferrer"
              className="no-underline hover:no-underline hover:text-[hsl(var(--obsidian-text))]"
            >
              OptimAI Labs
            </a>
            . © 2026 OptimAI Labs Ltda. All rights reserved. |{" "}
            <Link href="/privacy" className="hover:text-[hsl(var(--obsidian-text))] hover:underline">Privacy Policy</Link>
            {" "} | {" "}
            <Link href="/terms" className="hover:text-[hsl(var(--obsidian-text))] hover:underline">Terms of Service</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
