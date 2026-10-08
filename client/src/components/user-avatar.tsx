import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";
import { getUserAvatarColor, type ResolvedUserIdentity, type UserAvatarPreferences } from "@/lib/user-identity";

interface UserAvatarProps extends HTMLAttributes<HTMLSpanElement> {
  identity: ResolvedUserIdentity;
  color?: string;
  avatar?: UserAvatarPreferences;
}

const UserAvatar = forwardRef<HTMLSpanElement, UserAvatarProps>(function UserAvatar(
  { identity, color, avatar, className, ...props },
  ref,
) {
  // A saved avatar includes its own color choice. The optional color prop is
  // the awareness fallback for legacy/letter avatars and must not override a
  // configured avatar in a cabinet, chat message, or presence indicator.
  const avatarColor = getUserAvatarColor(avatar, color || identity.color);
  return (
    <span
      ref={ref}
      {...props}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center font-semibold text-white shadow-xs",
        className,
        // Keep the shared avatar frame invariant across account, cabinet,
        // documentation, chat, and live-presence surfaces.
        "aspect-square overflow-hidden rounded-full border-2 border-white/80",
      )}
      style={{ ...props.style, backgroundColor: avatarColor }}
      aria-hidden="true"
    >
      {identity.initial}
    </span>
  );
});

UserAvatar.displayName = "UserAvatar";

export default UserAvatar;
