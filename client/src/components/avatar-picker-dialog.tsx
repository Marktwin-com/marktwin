import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import UserAvatar from "@/components/user-avatar";
import { appearanceColorOptions } from "@/lib/appearance-preferences";
import type { ResolvedUserIdentity, UserAvatarPreferences } from "@/lib/user-identity";

interface AvatarPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  identity: ResolvedUserIdentity;
  avatar: UserAvatarPreferences;
  onSave: (avatar: UserAvatarPreferences) => Promise<boolean>;
}

export default function AvatarPickerDialog({ open, onOpenChange, identity, avatar, onSave }: AvatarPickerDialogProps) {
  const [colorIndex, setColorIndex] = useState(avatar.colorIndex);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) { setColorIndex(avatar.colorIndex); setError(""); }
  }, [open, avatar.colorIndex]);

  async function save() {
    setSaving(true);
    try {
      if (await onSave({ colorIndex })) onOpenChange(false);
      else setError("Could not save your color. Check browser storage permissions.");
    } finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Profile color</DialogTitle><DialogDescription>Your initial and color identify you in shared Cabinets.</DialogDescription></DialogHeader>
      <UserAvatar identity={identity} avatar={{ colorIndex }} className="mx-auto h-16 w-16" />
      <div className="flex flex-wrap justify-center gap-2">
        {appearanceColorOptions.map((color, index) => <button key={color.name} type="button" aria-label={`${color.name} profile color`} aria-pressed={colorIndex === index} onClick={() => setColorIndex(index)} className="rounded-md border px-3 py-2 text-sm aria-pressed:ring-2 aria-pressed:ring-primary">{color.name}</button>)}
      </div>
      <p role="status" className="text-sm text-destructive">{error}</p>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save color"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
