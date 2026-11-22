import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9338;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, ["--headless=new", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}/nifpass-edge7`, "about:blank"], { stdio: "ignore" });

const html = (size: number) => `<!doctype html><html><body style="margin:0;overflow:hidden">
<svg style="display:block" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6553f5"/><stop offset="1" stop-color="#4632c4"/></linearGradient></defs>
<rect width="100" height="100" fill="url(#g)"/>
<path d="M36 66V34l28 32V34" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
</svg></body></html>`;

async function main() {
  let targets: any[] = [];
  for (let i = 0; i < 60 && !targets.length; i++) { try { targets = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter((t: any) => t.type === "page"); } catch {} await sleep(250); }
  if (!targets.length) throw new Error("no page target");
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map<number, (v: any) => void>();
  ws.onmessage = (m) => { const d = JSON.parse(m.data as string); pending.get(d.id)?.(d.result ?? d.error); };
  const send = (method: string, params: any = {}) => new Promise<any>((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  mkdirSync("public/icons", { recursive: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 1000, deviceScaleFactor: 1, mobile: false });
  for (const [file, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]] as const) {
    await send("Page.navigate", { url: "data:text/html;base64," + Buffer.from(html(size)).toString("base64") });
    await sleep(800);
    const res = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
    if (!res?.data) throw new Error("screenshot failed: " + JSON.stringify(res));
    writeFileSync(`public/icons/${file}`, Buffer.from(res.data, "base64"));
    console.log("wrote", file);
  }
  ws.close();
}
main().catch((e) => console.error("ERROR", e)).finally(() => { proc.kill(); process.exit(0); });
