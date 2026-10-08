import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./static";
import { requestLogLine } from "./request-log";

const app = express();
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "base-uri 'none'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "img-src 'self' data: blob:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com https://esm.sh",
        "script-src 'self'",
        "connect-src 'self' https://api.github.com https://github.com ws: wss:",
      ].join("; "),
    );
  }
  next();
});
// Log only request metadata. Private V1 payloads and signaling messages must never be logged.
app.use((req, res, next) => {
  console.log(requestLogLine(req));
  next();
});

(async () => {

  const server = await registerRoutes(app);

  if (app.get("env") === "development") {
    // Dynamic import: vite.ts is NEVER bundled into the production image.
    // esbuild only sees ./static in the static import graph.
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // No HTTP endpoint accepts private workspace data. Never echo or log error
  // objects: parser/static errors can contain request bodies or sensitive URLs.
  app.use((err: { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = Number.isInteger(err.status) && err.status! >= 400 && err.status! < 600 ? err.status! : 500;
    res.status(status).json({ message: status < 500 ? "Invalid request" : "Internal server error" });
  });

  const port = Number.parseInt(process.env.PORT ?? "5001", 10);
  server.listen(port, () => {
    log(`serving on port ${port}`);
  });
})();
