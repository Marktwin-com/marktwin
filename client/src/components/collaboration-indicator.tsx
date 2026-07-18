import { useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Awareness } from "y-protocols/awareness";

interface CollaborationIndicatorProps {
  awareness?: Awareness;
  myName?: string;
  onNameChange?: (name: string) => void;
}

export default function CollaborationIndicator({ awareness, myName, onNameChange }: CollaborationIndicatorProps) {
  const [users, setUsers] = useState<any[]>([]);
  const userSignatureRef = useRef("");

  useEffect(() => {
    if (!awareness) return;

    const updateUsers = () => {
      const states = Array.from(awareness.getStates().entries());
      const activeUsers = states
        .filter(([_, state]) => state.user && state.user.name)
        .map(([clientId, state]) => ({
          ...state.user,
          clientId
        }));

      const signature = activeUsers
        .map((user) => `${user.clientId}:${user.name}:${user.color || ""}:${user.role || ""}:${user.viewingFilePath || ""}`)
        .join("|");
      if (signature === userSignatureRef.current) return;

      userSignatureRef.current = signature;
      setUsers(activeUsers);
    };

    awareness.on("change", updateUsers);
    updateUsers();

    return () => {
      awareness.off("change", updateUsers);
    };
  }, [awareness]);

  if (!awareness || users.length === 0) return null;

  return (
    <div className="flex items-center space-x-2">
      <div className="flex -space-x-1">
        {users.slice(0, 5).map((user, index) => {
          const isMe = user.clientId === awareness.clientID;
          const label = `${user.name || "Anonymous"}${user.role ? `, ${user.role}` : ""}${user.viewingFilePath ? `, viewing ${user.viewingFilePath}` : ""}`;
          const avatar = (
            <button
              type="button"
              className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold border border-[hsl(var(--obsidian-panel))] ${isMe ? 'cursor-pointer ring-2 ring-[hsl(var(--obsidian-accent))]' : ''}`}
              style={{ backgroundColor: user.color || '#10B981' }}
              aria-label={label}
            >
              {user.name ? user.name.charAt(0).toUpperCase() : '?'}
            </button>
          );

          if (isMe && onNameChange) {
            return (
              <Popover key={index}>
                <PopoverTrigger asChild>
                  {avatar}
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2 bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[hsl(var(--obsidian-text-muted))]">Change your name</p>
                    <Input 
                      value={myName || user.name}
                      onChange={(e) => onNameChange(e.target.value)}
                      className="h-8 text-sm bg-transparent border-[hsl(var(--obsidian-border))] focus:ring-1 focus:ring-[hsl(var(--obsidian-accent))]"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            );
          }

          return (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                {avatar}
              </TooltipTrigger>
              <TooltipContent>
                <p>{label}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
        {users.length > 5 && (
          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gray-600 text-white text-xs font-bold border border-[hsl(var(--obsidian-panel))]">
            +{users.length - 5}
          </div>
        )}
      </div>
    </div>
  );
}
