export const productEventNames = [
  "landing_viewed",
  "signup_completed",
  "cabinet_created",
  "cabinet_opened",
  "markdown_created",
  "markdown_edited",
  "canvas_created",
  "canvas_edited",
  "drawing_created",
  "drawing_edited",
  "asset_created",
  "asset_edited",
  "chat_opened",
  "chat_message_sent",
  "decision_captured",
  "checkpoint_completed",
  "collaborator_invited",
  "collaborator_joined",
  "user_returned",
] as const;

export type ProductEventName = typeof productEventNames[number];
export type ProductEventMetadata = {
  artifactType?: "markdown" | "canvas" | "drawing" | "image" | "asset";
  source?: "homepage" | "workspace" | "chat" | "demo" | "onboarding" | "template";
  route?: string;
  returning?: boolean;
};

const installationStorageKey = "marktwin-installation-id";

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `installation-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function getInstallationId() {
  if (typeof window === "undefined") return "server-rendered-installation";
  const existing = window.localStorage.getItem(installationStorageKey);
  if (existing) return existing;
  const created = randomId();
  window.localStorage.setItem(installationStorageKey, created);
  return created;
}

export function scrubProductEventMetadata(metadata: ProductEventMetadata = {}) {
  const safe: ProductEventMetadata = {};
  if (metadata.artifactType) safe.artifactType = metadata.artifactType;
  if (metadata.source) safe.source = metadata.source;
  if (typeof metadata.route === "string") safe.route = metadata.route.slice(0, 120);
  if (typeof metadata.returning === "boolean") safe.returning = metadata.returning;
  return safe;
}

/** The self-hosted edition does not collect product telemetry. */
export function trackProductEvent(_eventName: ProductEventName, _options: { cabinetId?: number; metadata?: ProductEventMetadata } = {}) {}
