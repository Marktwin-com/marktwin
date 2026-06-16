import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import pdfRouter from "./routes/pdf.js";

type SignalSocket = WebSocket & {
  roomHash?: string;
  peerId?: string;
  lastSeenAt?: number;
};

export async function registerRoutes(app: Express): Promise<Server> {
  app.use("/api/pdf", pdfRouter);

  app.all("/api/*", (_req, res) => res.status(404).json({ message: "Not found" }));

  const httpServer = createServer(app);
  const signalServer = new WebSocketServer({ noServer: true });
  const rooms = new Map<string, Map<string, SignalSocket>>();

  function removePeer(ws: SignalSocket) {
    if (!ws.roomHash || !ws.peerId) return;
    const room = rooms.get(ws.roomHash);
    if (!room) return;
    room.delete(ws.peerId);
    for (const peer of room.values()) {
      if (peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify({ type: "peer-left", peerId: ws.peerId }));
      }
    }
    if (room.size === 0) rooms.delete(ws.roomHash);
  }

  signalServer.on("connection", (ws: SignalSocket) => {
    ws.lastSeenAt = Date.now();

    ws.on("message", (raw) => {
      ws.lastSeenAt = Date.now();
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
          }),
          z.object({
            type: z.literal("signal"),
            targetPeerId: z.string().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/),
            payload: z.unknown(),
          }),
        ])
        .safeParse(message);

      if (!parsed.success) {
        ws.close(1008, "Invalid signaling message");
        return;
      }

      if (parsed.data.type === "join") {
        removePeer(ws);
        ws.roomHash = parsed.data.roomHash;
        ws.peerId = parsed.data.peerId;
        const room = rooms.get(ws.roomHash) || new Map<string, SignalSocket>();
        rooms.set(ws.roomHash, room);
        const existingPeers = Array.from(room.keys());
        room.set(ws.peerId, ws);
        ws.send(JSON.stringify({ type: "peers", peers: existingPeers }));
        for (const [peerId, peer] of room.entries()) {
          if (peerId !== ws.peerId && peer.readyState === WebSocket.OPEN) {
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
      if (target?.readyState === WebSocket.OPEN) {
        target.send(
          JSON.stringify({
            type: "signal",
            fromPeerId: ws.peerId,
            payload: parsed.data.payload,
          }),
        );
      }
    });

    ws.on("close", () => removePeer(ws));
  });

  setInterval(() => {
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const room of rooms.values()) {
      for (const peer of room.values()) {
        if ((peer.lastSeenAt || 0) < cutoff) peer.terminate();
      }
    }
  }, 60 * 1000).unref();

  httpServer.on("upgrade", (request, socket, head) => {
    const url = request.url || "";
    if (url.startsWith("/signal")) {
      signalServer.handleUpgrade(request, socket as any, head, (ws) => {
        signalServer.emit("connection", ws, request);
      });
    } else if (process.env.NODE_ENV !== "development") {
      socket.destroy();
    }
  });

  return httpServer;
}
