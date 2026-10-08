import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/contexts/i18n-context";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText,
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[hsl(var(--obsidian-sidebar))] border-[hsl(var(--obsidian-border))]">
        <DialogHeader>
          <DialogTitle className="text-[hsl(var(--obsidian-text))]">{title}</DialogTitle>
          <DialogDescription className="text-[hsl(var(--obsidian-text-muted))]">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex space-x-2 justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-[hsl(var(--obsidian-border))] text-[hsl(var(--obsidian-text))] hover:border-[hsl(var(--primary)/0.65)] hover:bg-[hsl(var(--primary)/0.1)] hover:text-[hsl(var(--primary))]"
          >
            {cancelText || t("common.cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className={destructive ? undefined : "bg-primary hover:bg-primary/90 text-primary-foreground"}
          >
            {confirmText || t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
