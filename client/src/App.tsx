import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/theme-context";
import MyCabinets from "@/pages/my-cabinets";
import { lazy, Suspense } from "react";

const ManualPairPage = lazy(() => import("@/pages/manual-pair"));
const VaultPage = lazy(() => import("@/pages/vault"));
const FAQPage = lazy(() => import("@/pages/faq"));
const ContactPage = lazy(() => import("@/pages/contact"));
const NotFound = lazy(() => import("@/pages/not-found"));
const GitHubCallbackPage = lazy(() => import("@/pages/github-callback"));
const PrivacyPage = lazy(() => import("@/pages/privacy"));
const TermsPage = lazy(() => import("@/pages/terms"));

function Router() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background p-6 text-sm text-muted-foreground">Loading Marktwin…</div>}><Switch>
      <Route path="/" component={MyCabinets} />
      <Route path="/faq" component={FAQPage} />
      <Route path="/contact" component={ContactPage} />
      <Route path="/app" component={MyCabinets} />
      <Route path="/my-cabinets" component={MyCabinets} />

      <Route path="/join" component={VaultPage} />
      <Route path="/manual-pair" component={ManualPairPage} />
      <Route path="/cabinet/:slug" component={VaultPage} />
      <Route path="/github/callback" component={GitHubCallbackPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route component={NotFound} />
    </Switch></Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
