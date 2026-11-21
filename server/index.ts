// Combined server: Next.js frontend + Socket.IO backend on a single origin/port.
import { config, createServer } from "./config";
import { attachRealtime } from "./realtime";

async function main() {
  const { default: next } = await import("next");
  const app = next({ dev: config.dev, hostname: config.host, port: config.port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const { server, protocol } = createServer((req, res) => handle(req, res));
  attachRealtime(server, { trustProxy: config.trustProxy, corsOrigins: config.corsOrigins });

  server.listen(config.port, config.host, () => {
    console.log(`NIFPass ready on ${protocol}://${config.host}:${config.port} (${config.dev ? "development" : "production"})`);
    console.log(`  Merchant: ${protocol}://localhost:${config.port}/store`);
    console.log(`  Customer: ${protocol}://localhost:${config.port}/user`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
