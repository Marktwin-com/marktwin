import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, X } from "lucide-react";
import * as Y from "yjs";

interface ChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  onWidthChange: (width: number) => void;
  ydoc: Y.Doc;
  username?: string;
  userColor?: string;
  clientId?: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  username: string;
  message: string;
  timestamp: number;
  color: string;
}

const MAX_VISIBLE_CHAT_MESSAGES = 200;

function createMessageId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function appendVisibleMessage(messages: ChatMessage[], message: ChatMessage) {
  return [...messages, message].slice(-MAX_VISIBLE_CHAT_MESSAGES);
}

export default function ChatPanel({ open, onOpenChange, width, onWidthChange, ydoc, username: propUsername, userColor: propUserColor, clientId }: ChatPanelProps) {
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [username] = useState(`User${Math.random().toString(36).substring(2, 6)}`);
  const [userColor] = useState(`#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`);
  const chatRef = useRef<HTMLDivElement>(null);
  const fallbackSessionId = useRef(createMessageId());
  const scrollFrameRef = useRef<number | null>(null);
  const sessionId = clientId || fallbackSessionId.current;

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

  // P2P Yjs Chat
  useEffect(() => {
    if (!open || !ydoc) return;
    
    const messagesArray = ydoc.getArray<ChatMessage>('chat-messages');
    
    const updateMessages = () => {
      setChatMessages(messagesArray.toArray().slice(-MAX_VISIBLE_CHAT_MESSAGES));
      scrollToBottom();
    };

    messagesArray.observe(updateMessages);
    updateMessages();

    return () => {
      messagesArray.unobserve(updateMessages);
    };
  }, [open, ydoc]);

  const sendChatMessage = () => {
    if (!chatMessage.trim()) return;

    const message: ChatMessage = {
      id: createMessageId(),
      sessionId,
      username: propUsername || username,
      message: chatMessage.trim(),
      timestamp: Date.now(),
      color: propUserColor || userColor
    };

    const messagesArray = ydoc.getArray<ChatMessage>('chat-messages');
    ydoc.transact(() => {
      messagesArray.push([message]);
    }, 'chat-message');

    setChatMessage("");
  };

  if (!open) return null;

  return (
    <>
      {/* Resizer */}
      <div 
        className="resizer"
        style={{ 
          position: 'fixed',
          right: `${width}px`,
          top: 0,
          bottom: 0,
          width: '4px',
          cursor: 'col-resize',
          backgroundColor: 'transparent',
          zIndex: 50,
          marginRight: '-2px'
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = width;
          const minWidth = 200;
          const maxWidth = Math.min(600, window.innerWidth * 0.75);
          const closeThreshold = window.innerWidth * 0.75;

          const handleMouseMove = (e: MouseEvent) => {
            const calculatedWidth = startWidth - (e.clientX - startX);
            
            // Check close threshold first
            if (calculatedWidth > closeThreshold) {
              onOpenChange(false);
              document.removeEventListener("mousemove", handleMouseMove);
              document.removeEventListener("mouseup", handleMouseUp);
              return;
            }
            
            // Then clamp the width
            const clampedWidth = Math.max(minWidth, Math.min(maxWidth, calculatedWidth));
            onWidthChange(clampedWidth);
          };

          const handleMouseUp = () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
          };

          document.addEventListener("mousemove", handleMouseMove);
          document.addEventListener("mouseup", handleMouseUp);
        }}
      />

      <div 
        className="chat-panel fixed right-0 top-0 h-screen bg-[hsl(var(--obsidian-bg))] border-l border-[hsl(var(--obsidian-border))] flex flex-col z-40 transition-all duration-300"
        style={{ 
          width: `${width}px`,
          minWidth: '200px',
          maxWidth: '600px',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div className="p-4 border-b border-[hsl(var(--obsidian-border))] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Chat</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Chat Messages */}
        <div 
          ref={chatRef} 
          className="flex-1 overflow-y-auto space-y-3 p-4"
        >
          {chatMessages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2">
              <div 
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" 
                style={{ backgroundColor: msg.color }}
              >
                {msg.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium">{msg.username}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm break-words">{msg.message}</p>
              </div>
            </div>
          ))}
          {chatMessages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">
              No messages yet. Start a conversation!
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div className="p-4 border-t border-[hsl(var(--obsidian-border))]">
          <div className="flex gap-2">
            <Input
              value={chatMessage}
              onChange={e => setChatMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendChatMessage();
                }
              }}
              placeholder="Type a message..."
              className="bg-[hsl(var(--obsidian-panel))] border-[hsl(var(--obsidian-border))] text-white"
            />
            <Button
              onClick={sendChatMessage}
              disabled={!chatMessage.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
} 
