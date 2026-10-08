import { useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Awareness } from "y-protocols/awareness";
import UserAvatar from "@/components/user-avatar";
import { resolveUserAvatarPreferences, resolveUserIdentity, type UserAvatarPreferences } from "@/lib/user-identity";

interface CollaborationIndicatorProps {
  awareness?: Awareness;
  myName?: string;
  onNameChange?: (name: string) => void;
  avatar?: UserAvatarPreferences;
}

export default function CollaborationIndicator({ awareness, myName, onNameChange, avatar: myAvatar }: CollaborationIndicatorProps) {
  const [users, setUsers] = useState<Array<{ clientId: number; stateClientId?: number; name: string; color?: string; avatar?: UserAvatarPreferences }>>([]);
  const userSignatureRef = useRef("");

  useEffect(() => {
    if (!awareness) return;

    const updateUsers = () => {
      const states = Array.from(awareness.getStates().entries());
      const activeUsers = states
        .filter(([_, state]) => state.user && state.user.name)
        .map(([clientId, state]) => {
          const sharedAvatar = state.user?.avatar && typeof state.user.avatar === "object"
            ? resolveUserAvatarPreferences({
                avatarColorIndex: state.user.avatar.colorIndex,
              })
            : undefined;
          return {
            ...state.user,
            clientId,
            stateClientId: typeof state.user?.clientId === "number" ? state.user.clientId : undefined,
            avatar: sharedAvatar,
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) || left.clientId - right.clientId);

      const signature = activeUsers
        .map((user) => `${user.clientId}:${user.name}:${user.color || ""}:${user.avatar ? JSON.stringify(user.avatar) : ""}`)
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

  const participantSlotClassName = "relative flex h-6 w-6 shrink-0 items-center justify-center";

  return (
    <div className="flex min-h-9 min-w-9 items-center justify-center">
      <div className="flex items-center gap-1">
        {users.slice(0, 5).map((user) => {
          // Awareness providers normally preserve the map key as the local
          // client id, but a relayed state can arrive with the explicit id we
          // put in `state.user`. Honor both forms so the local participant
          // keeps the session-name control after peers join or reconnect.
          const isMe = user.clientId === awareness.clientID || user.stateClientId === awareness.clientID;
          const identity = resolveUserIdentity({ displayName: user.name }, `awareness:${user.clientId}`);
          const effectiveAvatar = isMe && myAvatar?.configured ? myAvatar : user.avatar;
          const avatar = (
            <UserAvatar
              identity={identity}
              color={user.color}
              avatar={effectiveAvatar}
              className="h-6 w-6 border-2 border-white text-xs"
            />
          );

          if (isMe && onNameChange) {
            return (
              <div key={user.clientId} className={participantSlotClassName}>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--obsidian-accent))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--obsidian-sidebar))]"
                      aria-label="Change your name"
                      title={user.name || "You"}
                    >
                      {avatar}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="end"
                    sideOffset={2}
                    collisionPadding={8}
                    className="w-48 p-2 bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))]"
                  >
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
              </div>
            );
          }

          return (
            <div key={user.clientId} className={participantSlotClassName}>
              <Tooltip>
                <TooltipTrigger asChild>{avatar}</TooltipTrigger>
                <TooltipContent>
                  <p>{user.name || "Anonymous"}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
        {users.length > 5 && (
          <div className={`${participantSlotClassName} rounded-full border border-[hsl(var(--obsidian-panel))] bg-gray-600 text-xs font-bold text-white`}>
            +{users.length - 5}
          </div>
        )}
      </div>
    </div>
  );
}
