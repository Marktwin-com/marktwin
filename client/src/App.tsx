import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/theme-context";
import { LocalProfileProvider } from "@/contexts/local-profile-context";
import { FontProvider } from "@/contexts/font-context";
import { I18nProvider } from "@/contexts/i18n-context";
import { loadRoute } from "@/lib/navigation-recovery";

const MyCabinets = lazy(() => loadRoute(() => import("@/pages/my-cabinets")));
const ManualPairPage = lazy(() => loadRoute(() => import("@/pages/manual-pair")));
const WorkspaceVaultPage = lazy(() => loadRoute(() => import("@/pages/workspace-vault")));
const FAQPage = lazy(() => loadRoute(() => import("@/pages/faq")));
const ContactPage = lazy(() => loadRoute(() => import("@/pages/contact")));
const NotFound = lazy(() => loadRoute(() => import("@/pages/not-found")));
const User = lazy(() => loadRoute(() => import("@/pages/user")));
const GitHubCallbackPage = lazy(() => loadRoute(() => import("@/pages/github-callback")));
const PrivacyPage = lazy(() => loadRoute(() => import("@/pages/privacy")));
const TermsPage = lazy(() => loadRoute(() => import("@/pages/terms")));

function RouteLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-muted-foreground" role="status" aria-live="polite">
      Marktwin…
    </main>
  );
}

function Router() {
  const [location] = useLocation();

  return (
    <Suspense key={location} fallback={<RouteLoading />}>
      <Switch location={location}>
        <Route path="/" component={MyCabinets} />
        <Route path="/faq" component={FAQPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/app" component={MyCabinets} />
        <Route path="/my-cabinets" component={MyCabinets} />

        <Route path="/join" component={WorkspaceVaultPage} />
        <Route path="/manual-pair" component={ManualPairPage} />
        <Route path="/cabinet/documentation" component={WorkspaceVaultPage} />
        <Route path="/cabinet/documentation-read" component={WorkspaceVaultPage} />
        <Route path="/cabinet/:slug" component={WorkspaceVaultPage} />
        <Route path="/github/callback" component={GitHubCallbackPage} />
        <Route path="/user" component={User} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  useEffect(() => {
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["saved-repos"] }); };
    const stored = (event: StorageEvent) => { if (event.key === "marktwin:saved-repos" || event.key === null) refresh(); };
    window.addEventListener("marktwin:cabinets-changed", refresh);
    window.addEventListener("storage", stored);
    return () => { window.removeEventListener("marktwin:cabinets-changed", refresh); window.removeEventListener("storage", stored); };
  }, []);
  return (
    <FontProvider>
      <LocalProfileProvider>
        <I18nProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <TooltipProvider>
                <Toaster />
                <Router />
              </TooltipProvider>
            </ThemeProvider>
          </QueryClientProvider>
        </I18nProvider>
      </LocalProfileProvider>
    </FontProvider>
  );
}

export default App;
