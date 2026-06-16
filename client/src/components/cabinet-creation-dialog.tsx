import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CabinetCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CabinetCreationDialog({
  open,
  onOpenChange,
}: CabinetCreationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[hsl(var(--obsidian-bg))] border-[hsl(var(--obsidian-border))] text-white">
        <DialogHeader>
          <DialogTitle>Server Cabinets Disabled</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm text-gray-300">
          <p>
            Creating private server-backed cabinets is disabled in Marktwin V1.
            Open the private workspace to load GitHub markdown directly from the
            owner browser.
          </p>
          <Button onClick={() => onOpenChange(false)} className="w-full">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
