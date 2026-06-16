import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { completeGitHubOAuthFromLocation } from "@/lib/github-oauth-pkce";

export default function GitHubCallbackPage() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState("");

  useEffect(() => {
    completeGitHubOAuthFromLocation()
      .then((returnTo) => setLocation(returnTo))
      .catch((err) => setError(err instanceof Error ? err.message : "GitHub OAuth failed."));
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-[hsl(var(--obsidian-bg))] flex items-center justify-center p-4">
      <Card className="max-w-md bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
        <CardHeader>
          <CardTitle className="text-foreground">{error ? "GitHub OAuth Failed" : "Connecting GitHub"}</CardTitle>
          <CardDescription className="text-gray-400">
            {error || "Finishing the browser-only OAuth PKCE flow."}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
