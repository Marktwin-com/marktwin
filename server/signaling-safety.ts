type ErrorSource = {
  on(event: "error", listener: (error: unknown) => void): unknown;
};

export type SignalingErrorMetadata = {
  name: string;
  code?: string;
};

export function signalingErrorMetadata(error: unknown): SignalingErrorMetadata {
  const name = error instanceof Error && /^(?:Error|[A-Za-z][A-Za-z0-9]*Error)$/.test(error.name)
    ? error.name
    : "WebSocketError";
  const rawCode = typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  const code = typeof rawCode === "string" && /^(?:WS_ERR_[A-Z0-9_]{1,32}|ECONNRESET|EPIPE|ETIMEDOUT)$/.test(rawCode)
    ? rawCode
    : undefined;
  return code ? { name, code } : { name };
}

export function attachSignalingErrorBoundary(
  source: ErrorSource,
  scope: "server" | "socket",
  report: (scope: "server" | "socket", metadata: SignalingErrorMetadata) => void = (kind, metadata) => {
    console.error(`Signaling ${kind} error`, metadata);
  },
) {
  source.on("error", (error) => report(scope, signalingErrorMetadata(error)));
}
