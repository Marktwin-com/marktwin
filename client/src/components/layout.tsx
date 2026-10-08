import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import Logo from "@/assets/Logo.jsx";
import React from "react";
import { useI18n } from "@/contexts/i18n-context";

interface LayoutProps {
  children: React.ReactNode;
  mainClassName?: string;
  zoom?: number;
  hideNavigation?: boolean;
  hideFooter?: boolean;
}

export default function Layout({ children, mainClassName = "pt-12", zoom, hideNavigation = false, hideFooter = false }: LayoutProps) {
  const { t } = useI18n();

  return (
    <div
      className="min-h-screen bg-[hsl(var(--obsidian-bg))] text-[hsl(var(--obsidian-text))] relative flex flex-col font-inter"
    >
      {/* Background Watermark */}
      <div className="marktwin-watermark fixed inset-0 pointer-events-none opacity-[0.006] z-0 flex items-center justify-center">
        <Logo className="w-2/3 max-w-3xl h-auto object-contain text-[hsl(var(--primary))]" />
      </div>

      {/* Header Navigation */}
      {!hideNavigation && <nav className="w-full bg-transparent relative z-10">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-x-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 cursor-pointer">
            <Logo className="h-6 w-6 text-[hsl(var(--primary))]" />
            <span className="text-lg font-semibold text-[hsl(var(--obsidian-text))]">Marktwin</span>
          </Link>
          <div className="order-3 mt-3 flex w-full items-center justify-center gap-5 pt-3 text-sm sm:order-none sm:mt-0 sm:w-auto sm:pt-0 md:gap-7">
            <Link href="/cabinet/documentation" className="text-[hsl(var(--obsidian-text-muted))] hover:text-[hsl(var(--primary))]">{t("nav.tutorial")}</Link>
            <Link href="/faq" className="text-[hsl(var(--obsidian-text-muted))] hover:text-[hsl(var(--primary))]">{t("nav.faq")}</Link>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/my-cabinets">
                {t("nav.openCabinet")}
              </Link>
            </Button>
          </div>
        </div>
      </nav>}

      {/* Main Content */}
      <main className={`container mx-auto px-4 pb-4 relative z-10 flex-1 flex flex-col ${mainClassName}`} style={zoom ? { zoom } : undefined}>
        {children}
      </main>

      {/* Footer */}
      {!hideFooter && <footer className="bg-transparent mt-8 md:mt-12 relative z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-center">
          <p className="text-[hsl(var(--obsidian-text-muted))] text-xs text-center">
            {t("footer.copyright")} |{" "}
            <Link href="/privacy" className="hover:text-[hsl(var(--primary))] hover:underline">{t("footer.privacy")}</Link>
            {" "} | {" "}
            <Link href="/terms" className="hover:text-[hsl(var(--primary))] hover:underline">{t("footer.terms")}</Link>
            {" "} | {" "}
            <Link href="/contact" className="hover:text-[hsl(var(--primary))] hover:underline">{t("footer.contact")}</Link>
            {" "} | {" "}
            <a href="https://github.com/Marktwin-com/marktwin" className="hover:underline">Source code</a>
          </p>
        </div>
      </footer>}


    </div>
  );
}
