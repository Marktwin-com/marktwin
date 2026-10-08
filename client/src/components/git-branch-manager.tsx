import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch } from "lucide-react";
import type { Vault } from "@shared/schema";

interface GitBranchManagerProps {
  vault: Vault;
}

export default function GitBranchManager({ vault }: GitBranchManagerProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Git Branch Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          Server-side branch sync and merge flows are disabled for Marktwin V1 private
          documents.
        </p>
        <p>
          {vault.name} can still be used as legacy demo/documentation context, but
          private GitHub edits now load and commit from the owner browser only.
        </p>
      </CardContent>
    </Card>
  );
}
