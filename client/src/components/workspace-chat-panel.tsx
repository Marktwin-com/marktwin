import { useState, useEffect, useRef, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Send, X } from "lucide-react";
import type { ChatMessage, DiscussionAnchor } from "@shared/schema";
import { createClientId } from "@/lib/client-id";
import { useI18n } from "@/contexts/i18n-context";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useWorkspaceMobile } from "@/hooks/use-workspace-mobile";
import UserAvatar from "@/components/user-avatar";
import { resolveUserAvatarPreferences, resolveUserIdentity, type UserAvatarPreferences } from "@/lib/user-identity";
import { Awareness } from "y-protocols/awareness";

interface ChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  onWidthChange: (width: number) => void;
  messages: ChatMessage[];
  onSend: (message: ChatMessage) => void;
  username?: string;
  userColor?: string;
  userAvatar?: UserAvatarPreferences;
  awareness?: Awareness;
  clientId?: string;
  anchor?: DiscussionAnchor;
}

export default function ChatPanel({ open, onOpenChange, width, onWidthChange, messages, onSend, username: propUsername, userColor: propUserColor, userAvatar, awareness, clientId, anchor }: ChatPanelProps) {
  const { t, dateTime } = useI18n();
  const [chatMessage, setChatMessage] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const fallbackSessionId = useRef(createClientId());
  const scrollFrameRef = useRef<number | null>(null);
  const sessionId = clientId || fallbackSessionId.current;
  const fallbackIdentity = resolveUserIdentity(
    { displayName: `Guest ${sessionId.slice(-4)}` },
    `chat-session:${sessionId}`,
  );
  const mobile = useWorkspaceMobile();
  const [sharedAvatars, setSharedAvatars] = useState<Record<string, UserAvatarPreferences>>({});

  useEffect(() => {
    if (!awareness) {
      setSharedAvatars({});
      return;
    }

    const updateAvatars = () => {
      const next: Record<string, UserAvatarPreferences> = {};
      for (const [sharedClientId, state] of awareness.getStates()) {
        const sharedAvatar = state?.user?.avatar;
        if (!sharedAvatar || typeof sharedAvatar !== "object") continue;
        const avatar = resolveUserAvatarPreferences({
          avatarColorIndex: sharedAvatar.colorIndex,
        });
        if (avatar.configured) next[String(sharedClientId)] = avatar;
      }
      setSharedAvatars(next);
    };

    awareness.on("change", updateAvatars);
    updateAvatars();
    return () => awareness.off("change", updateAvatars);
  }, [awareness]);

  const scrollToBottom = () => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
    }
    scrollFrameRef.current = requestAnimationFrame(() => {
      if (chatRef.current) {
        chatRef.current.scrollTop = chatRef.current.scrollHeight;
      }
      scrollFrameRef.current = null;
    });
  };

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (open) scrollToBottom();
  }, [messages, open]);

  const sendChatMessage = () => {
    if (!chatMessage.trim()) return;

    const message: ChatMessage = {
      id: createClientId(),
      sessionId,
      username: propUsername || fallbackIdentity.displayName,
      message: chatMessage.trim(),
      timestamp: Date.now(),
      color: propUserColor || fallbackIdentity.color,
      anchor,
    };
    onSend(message);
    setChatMessage("");
  };

  if (!open) return null;

  const panel = (
    <>
      {/* Resizer */}
      <div
        className="resizer workspace-chat-resizer hidden touch-none sm:block"
        style={{
          "--workspace-chat-width": `${width}px`,
          position: 'fixed',
          top: 0,
          bottom: 0,
          width: '8px',
          cursor: 'col-resize',
          backgroundColor: 'transparent',
          zIndex: 50,
          marginRight: '-4px'
        } as CSSProperties}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const startX = event.clientX;
          const startWidth = width;
          const minWidth = 200;
          const maxWidth = Math.min(600, window.innerWidth * 0.75);
          const closeThreshold = 150;
          const previousCursor = document.body.style.cursor;
          const previousUserSelect = document.body.style.userSelect;

          const cleanup = () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", cleanup);
            window.removeEventListener("pointercancel", cleanup);
            document.body.style.cursor = previousCursor;
            document.body.style.userSelect = previousUserSelect;
          };
          const handlePointerMove = (moveEvent: PointerEvent) => {
            const calculatedWidth = startWidth - (moveEvent.clientX - startX);
            if (calculatedWidth <= closeThreshold) {
              cleanup();
              onOpenChange(false);
              return;
            }
            onWidthChange(Math.max(minWidth, Math.min(maxWidth, calculatedWidth)));
          };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
          window.addEventListener("pointermove", handlePointerMove);
          window.addEventListener("pointerup", cleanup);
          window.addEventListener("pointercancel", cleanup);
        }}
        role="separator"
        aria-label={t("workspace.resizeChat")}
        aria-orientation="vertical"
      />

      <div
        className={`chat-panel workspace-chat-panel flex flex-col border-l border-[hsl(var(--obsidian-border))] bg-[hsl(var(--obsidian-bg))] ${mobile ? "relative z-auto h-full w-full border-l-0" : "fixed right-0 top-0 z-40 h-screen"}`}
        style={{
          "--workspace-chat-width": `${width}px`,
          minWidth: '200px',
          maxWidth: '600px',
          overflow: 'hidden'
        } as CSSProperties}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--obsidian-border))] p-3 sm:p-4">
          <h2 className="text-lg font-semibold text-foreground">{t("nav.chat")}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="workspace-touch-control h-8 w-8 text-[hsl(var(--obsidian-text-muted))] hover:bg-[hsl(var(--obsidian-accent)/0.1)] hover:text-[hsl(var(--primary))]"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Chat Messages */}
        <div
          ref={chatRef}
          className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4"
        >
          {messages.map((msg) => {
            const messageIdentity = resolveUserIdentity(
              { displayName: msg.username },
              `chat-session:${msg.sessionId}`,
            );
            const messageAvatar = msg.sessionId === sessionId ? userAvatar : sharedAvatars[msg.sessionId];
            return (
            <div key={msg.id} className="group flex items-start gap-2">
              <UserAvatar
                identity={messageIdentity}
                color={messageAvatar ? undefined : msg.color}
                avatar={messageAvatar}
                className="h-6 w-6 text-xs"
              />
              <div className="flex-1 min-w-0">
                <div className="mb-1 flex min-h-6 items-center gap-2">
                  <span className="text-xs font-medium">{msg.username}</span>
                  <span className="text-xs text-muted-foreground">
                    {dateTime(msg.timestamp, { timeStyle: "short" })}
                  </span>
                </div>
                <p dir="auto" className="text-sm break-words">{msg.message}</p>
                {msg.anchor && (
                  <p dir="auto" className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="h-3 w-3" />{msg.anchor.filePath}{msg.anchor.heading ? ` · ${msg.anchor.heading}` : ""}
                  </p>
                )}
              </div>
            </div>
            );
          })}
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">
              {t("workspace.chatEmpty")}
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div className="safe-area-bottom border-t border-[hsl(var(--obsidian-border))] p-3 sm:p-4">
          <div className="flex gap-2">
            <Input
              dir="auto"
              ref={composerRef}
              value={chatMessage}
              onChange={e => setChatMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendChatMessage();
                }
              }}
              placeholder={t("workspace.chatPlaceholder")}
              aria-label={t("workspace.chatMessage")}
              className="bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))] text-[hsl(var(--obsidian-text))]"
            />
            <Button
              onClick={sendChatMessage}
              disabled={!chatMessage.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              aria-label={t("workspace.sendChat")}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  if (!mobile) return panel;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-dvh w-full max-w-none p-0 [&>button]:hidden"
        aria-describedby="workspace-chat-description"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          composerRef.current?.focus();
        }}
      >
        <SheetTitle className="sr-only">{t("nav.chat")}</SheetTitle>
        <SheetDescription id="workspace-chat-description" className="sr-only">{t("workspace.chatPanelDescription")}</SheetDescription>
        {panel}
      </SheetContent>
    </Sheet>
  );
}
