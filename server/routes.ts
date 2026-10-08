import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { peerSignalSchema } from "../shared/collaboration";
import { attachSignalingErrorBoundary } from "./signaling-safety";
type SignalSocket = WebSocket & {
  roomHash?: string;
  peerId?: string;
  peerRole?: "owner" | "guest";
  lastSeenAt?: number;
  messageWindowStartedAt?: number;
  messageCount?: number;
  joinDeadline?: ReturnType<typeof setTimeout>;
};

export async function registerRoutes(app: Express): Promise<Server> {
  app.all("/api/*", (_req, res) => res.status(404).json({ message: "Not found" }));
  const httpServer = createServer(app);
  const signalServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  attachSignalingErrorBoundary(signalServer, "server");
  const rooms = new Map<string, Map<string, SignalSocket>>();
  const MAX_SIGNAL_CONNECTIONS = 500;
  const MAX_PEERS_PER_ROOM = 12;
  const MAX_SIGNAL_ROOMS = 500;

  function removePeer(ws: SignalSocket) {
    if (!ws.roomHash || !ws.peerId) return;
    const room = rooms.get(ws.roomHash);
    if (!room) return;
    if (room.get(ws.peerId) !== ws) return;
    room.delete(ws.peerId);
    for (const peer of room.values()) {
      if (peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify({ type: "peer-left", peerId: ws.peerId }));
      }
    }
    if (room.size === 0) rooms.delete(ws.roomHash);
  }

  signalServer.on("connection", (ws: SignalSocket) => {
    // Install this before any early return. Protocol/maxPayload failures emit an
    // EventEmitter `error`; logging is deliberately metadata-only.
    attachSignalingErrorBoundary(ws, "socket");
    if (signalServer.clients.size > MAX_SIGNAL_CONNECTIONS) {
      ws.terminate();
      return;
    }
    ws.lastSeenAt = Date.now();
    ws.messageWindowStartedAt = Date.now();
    ws.messageCount = 0;
    ws.joinDeadline = setTimeout(() => {
      if (!ws.roomHash || !ws.peerId) ws.close(1008, "Join deadline exceeded");
    }, 10_000);
    ws.joinDeadline.unref();

    ws.on("message", (raw) => {
      const now = Date.now();
      ws.lastSeenAt = now;
      if (!ws.messageWindowStartedAt || now - ws.messageWindowStartedAt >= 60_000) {
        ws.messageWindowStartedAt = now;
        ws.messageCount = 0;
      }
      ws.messageCount = (ws.messageCount || 0) + 1;
      if (ws.messageCount > 180) {
        ws.close(1008, "Signaling rate limit exceeded");
        return;
      }
      let message: unknown;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        ws.close(1003, "Invalid JSON");
        return;
      }

      const parsed = z
        .discriminatedUnion("type", [
          z.object({
            type: z.literal("join"),
            roomHash: z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/),
            peerId: z.string().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/),
            peerRole: z.enum(["owner", "guest"]).optional(),
          }).strict(),
          z.object({
            type: z.literal("signal"),
            targetPeerId: z.string().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/),
            payload: peerSignalSchema,
          }).strict(),
        ])
        .safeParse(message);

      if (!parsed.success) {
        ws.close(1008, "Invalid signaling message");
        return;
      }

      if (parsed.data.type === "join") {
        if (ws.roomHash || ws.peerId) {
          ws.close(1008, "A signaling connection may join only once");
          return;
        }
        if (!rooms.has(parsed.data.roomHash) && rooms.size >= MAX_SIGNAL_ROOMS) {
          ws.close(1013, "Signaling room capacity reached");
          return;
        }
        removePeer(ws);
        ws.roomHash = parsed.data.roomHash;
        ws.peerId = parsed.data.peerId;
        ws.peerRole = parsed.data.peerRole || (/-(?:e|v)$/.test(ws.peerId) ? "owner" : "guest");
        if (ws.joinDeadline) {
          clearTimeout(ws.joinDeadline);
          ws.joinDeadline = undefined;
        }
        const room = rooms.get(ws.roomHash) || new Map<string, SignalSocket>();
        if (!room.has(ws.peerId) && room.size >= MAX_PEERS_PER_ROOM) {
          ws.close(1008, "Collaboration room is full");
          return;
        }
        rooms.set(ws.roomHash, room);
        const existing = room.get(ws.peerId);
        if (existing && existing !== ws) {
          existing.roomHash = undefined;
          existing.peerId = undefined;
          existing.close(4001, "Peer replaced by a newer connection");
        }
        const existingPeers = Array.from(room.entries())
          .filter(([peerId, peer]) => peerId !== ws.peerId && peer.peerRole !== ws.peerRole)
          .map(([peerId]) => peerId);
        room.set(ws.peerId, ws);
        ws.send(JSON.stringify({ type: "peers", peers: existingPeers }));
        for (const [peerId, peer] of room.entries()) {
          if (peerId !== ws.peerId && peer.peerRole !== ws.peerRole && peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({ type: "peer-joined", peerId: ws.peerId }));
          }
        }
        return;
      }

      if (!ws.roomHash || !ws.peerId) {
        ws.close(1008, "Join required");
        return;
      }

      const target = rooms.get(ws.roomHash)?.get(parsed.data.targetPeerId);
      if (target?.peerRole !== ws.peerRole && target?.readyState === WebSocket.OPEN) {
        target.send(
          JSON.stringify({
            type: "signal",
            fromPeerId: ws.peerId,
            payload: parsed.data.payload,
          }),
        );
      }
    });

    ws.on("close", () => {
      if (ws.joinDeadline) clearTimeout(ws.joinDeadline);
      removePeer(ws);
    });
  });

  setInterval(() => {
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const peer of signalServer.clients) {
      const socket = peer as SignalSocket;
      if ((socket.lastSeenAt || 0) < cutoff) socket.terminate();
    }
  }, 60 * 1000).unref();

  httpServer.on("upgrade", (request, socket, head) => {
    const url = request.url || "";
    const pathname = new URL(url, "http://localhost").pathname;
    if (pathname === "/signal") {
      signalServer.handleUpgrade(request, socket as any, head, (ws) => {
        signalServer.emit("connection", ws, request);
      });
    } else if (process.env.NODE_ENV !== "development") {
      socket.destroy();
    }
  });

  return httpServer;
}
