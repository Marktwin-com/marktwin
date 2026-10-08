import { useState } from "react";
import { Copy, Loader2, RotateCw } from "lucide-react";

import type { CollaborationTransport } from "@shared/collaboration";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { copyText } from "@/lib/clipboard";
import { useI18n } from "@/contexts/i18n-context";

interface PrivateCollaborationDialogProps {
  open: boolean;
  editLink: string;
  viewLink: string;
  rotating: boolean;
  transport: CollaborationTransport;
  onOpenChange: (open: boolean) => void;
  onStop: () => void;
  onRotate: () => void;
  onTransportChange: (transport: CollaborationTransport) => void;
}

export default function PrivateCollaborationDialog({
  open,
  editLink,
  viewLink,
  rotating,
  transport,
  onOpenChange,
  onStop,
  onRotate,
  onTransportChange,
}: PrivateCollaborationDialogProps) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [copying, setCopying] = useState("");
  const links = [{ id: "edit", label: t("collab.editLink"), value: editLink }, { id: "view", label: t("collab.viewLink"), value: viewLink }];

  const copyLink = async (id: string, label: string, value: string) => {
    setCopying(label);
    try {
      await copyText(value);
      toast({ title: t("collab.linkCopied", { label }), description: t("collab.linkCopiedDescription") });
    } catch {
      const input = document.getElementById(`share-${id}`) as HTMLInputElement | null;
      input?.focus();
      input?.select();
      toast({
        title: t("collab.copyFailed"),
        description: t("collab.copyManually", { error: t("collab.clipboardFailed") }),
        variant: "destructive",
      });
    } finally {
      setCopying("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-sidebar))] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("collab.title")}</DialogTitle>
          <DialogDescription>{t("collab.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-md border border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-panel))] p-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="collaboration-transport" className="text-sm font-medium">{t("collab.connectionMode")}</Label>
            <div className="flex items-center gap-2 text-xs">
              <span className={transport === "direct" ? "font-semibold text-foreground" : "text-muted-foreground"}>{t("collab.directP2P")}</span>
              <Switch
                id="collaboration-transport"
                checked={transport === "relay"}
                disabled={rotating}
                onCheckedChange={(checked) => onTransportChange(checked ? "relay" : "direct")}
                aria-label={t("collab.connectionMode")}
              />
              <span className={transport === "relay" ? "font-semibold text-foreground" : "text-muted-foreground"}>{t("collab.encryptedRelay")}</span>
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {t(transport === "relay" ? "collab.encryptedRelayDescription" : "collab.directP2PDescription")}
          </p>
          <p className="text-[11px] leading-4 text-muted-foreground">{t("collab.transportChangeRotates")}</p>
        </div>
        {links.map((link) => (
          <div key={link.id} className="space-y-2">
            <Label htmlFor={`share-${link.id}`}>{link.label}</Label>
            <div className="flex gap-2">
              <Input
                id={`share-${link.id}`}
                readOnly
                value={link.value}
                onFocus={(event) => event.currentTarget.select()}
                onClick={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={!link.value || Boolean(copying)}
                aria-label={t("collab.copyLink", { label: link.label })}
                onClick={() => void copyLink(link.id, link.label, link.value)}
              >
                {copying === link.label ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{t("collab.rotateDescription")}</p>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="destructive" onClick={onStop} disabled={rotating}>{t("collab.stop")}</Button>
          <Button type="button" variant="outline" onClick={onRotate} disabled={rotating}>
            {rotating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
            {rotating ? t("collab.rotating") : t("collab.rotate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
