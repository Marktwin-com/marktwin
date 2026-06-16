import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function SharedNotePage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--obsidian-bg))] flex items-center justify-center p-4">
      <Card className="max-w-md bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Legacy Sharing Removed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-gray-300">
          <p>
            Plaintext shared-note links are not part of Marktwin V1 private
            collaboration.
          </p>
          <p>
            Join links now use <Link href="/join" className="text-primary underline">/join#invite-secret</Link>,
            so the invite secret stays in the URL fragment and is not sent to the server.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
