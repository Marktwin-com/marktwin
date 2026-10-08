import { z } from "zod";

const secretSchema = z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const collaborationTransportSchema = z.enum(["direct", "relay"]);
export type CollaborationTransport = z.infer<typeof collaborationTransportSchema>;

export const invitePayloadSchema = z.object({
  v: z.literal(1),
  role: z.enum(["edit", "view"]),
  documentSecret: secretSchema,
  roomSecret: secretSchema,
  transport: collaborationTransportSchema.optional(),
}).strict();

export type InvitePayload = z.infer<typeof invitePayloadSchema>;

const iceCandidateSchema = z.object({
  candidate: z.string().max(4 * 1024),
  sdpMid: z.string().max(256).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(65_535).nullable().optional(),
  usernameFragment: z.string().max(256).nullable().optional(),
}).strict();

const negotiationIdSchema = z.string().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/);

export const peerSignalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ready"), negotiationId: negotiationIdSchema }).strict(),
  z.object({ kind: z.literal("direct-retry"), negotiationId: negotiationIdSchema }).strict(),
  z.object({ kind: z.literal("relay-request") }).strict(),
  z.object({ kind: z.literal("relay-approved") }).strict(),
  z.object({ kind: z.literal("relay-denied") }).strict(),
  z.object({
    kind: z.literal("offer"),
    negotiationId: negotiationIdSchema,
    description: z.object({ type: z.literal("offer"), sdp: z.string().min(1).max(32 * 1024) }).strict(),
  }).strict(),
  z.object({
    kind: z.literal("answer"),
    negotiationId: negotiationIdSchema,
    description: z.object({ type: z.literal("answer"), sdp: z.string().min(1).max(32 * 1024) }).strict(),
  }).strict(),
  z.object({ kind: z.literal("candidate"), negotiationId: negotiationIdSchema, candidate: iceCandidateSchema }).strict(),
]);

export type PeerSignal = z.infer<typeof peerSignalSchema>;
