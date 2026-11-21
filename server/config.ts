import { readFileSync } from "node:fs";
import { createServer as createHttpServer, type RequestListener } from "node:http";
import { createServer as createHttpsServer } from "node:https";

if (process.argv.includes("--prod")) {
  (process.env as Record<string, string>).NODE_ENV = "production";
}

export const config = {
  dev: process.env.NODE_ENV !== "production",
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || "0.0.0.0",
  trustProxy: process.env.TRUST_PROXY === "true",
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  httpsKeyFile: process.env.HTTPS_KEY_FILE,
  httpsCertFile: process.env.HTTPS_CERT_FILE,
};

export function createServer(handler: RequestListener) {
  if (config.httpsKeyFile && config.httpsCertFile) {
    return {
      protocol: "https",
      server: createHttpsServer(
        { key: readFileSync(config.httpsKeyFile), cert: readFileSync(config.httpsCertFile) },
        handler,
      ),
    };
  }
  return { protocol: "http", server: createHttpServer(handler) };
}
