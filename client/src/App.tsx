import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/theme-context";
import MyCabinets from "@/pages/my-cabinets";

import ManualPairPage from "@/pages/manual-pair";
import VaultPage from "@/pages/vault";
import FAQPage from "@/pages/faq";
import ContactPage from "@/pages/contact";
import NotFound from "@/pages/not-found";
import GitHubCallbackPage from "@/pages/github-callback";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import { FontProvider } from "@/contexts/font-context";

function Router() {
  return (
    <Switch>
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
    </Switch>
  );
}

function App() {
  return (
    <FontProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </FontProvider>
  );
}

export default App;
