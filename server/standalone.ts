// Standalone realtime backend, for deployments where the frontend is hosted separately.
import { config, createServer } from "./config";
import { attachRealtime } from "./realtime";

const { server, protocol } = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(404).end();
});

if (!config.corsOrigins.length) {
  console.warn("[backend] CORS_ORIGINS is empty: browsers on other origins will not be able to connect.");
}
attachRealtime(server, { trustProxy: config.trustProxy, corsOrigins: config.corsOrigins });

server.listen(config.port, config.host, () => {
  console.log(`NIFPass realtime backend on ${protocol}://${config.host}:${config.port}`);
});
