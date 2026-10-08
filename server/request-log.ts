import type { Request } from "express";

export function requestLogLine(req: Pick<Request, "method" | "path">, timestamp = new Date()) {
  return `[${timestamp.toISOString()}] ${req.method} ${req.path}`;
}
