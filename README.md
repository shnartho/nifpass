# NIFPass by GoGentik

Customers in Portugal share their NIF with a store without saying it out loud:

**Store shows its permanent QR → Customer scans → NIF appears on the store's screen instantly.**

| Route    | Who      | Device                    |
| -------- | -------- | ------------------------- |
| `/store` | Store    | Laptop, tablet or phone   |
| `/user`  | Customer | Mobile phone              |

## Architecture

```
┌──────────── Store (/store) ──────────────┐        ┌──────── Phone (/user) ────────┐
│ sign in: email+password ─► PBKDF2 secret │        │ scans QR ─► storeId           │
│ storeId = hash(secret) ─► permanent QR   │        │ customer:join  (storeId)      │
│ store:open {storeId, secret, name}       │        │ customer:share (nif)          │
│ ◄─ store:nif {nif, receivedAt} + ack     │        │                               │
└──────────────────┬───────────────────────┘        └──────────────┬────────────────┘
                   │      WebSocket (Socket.IO, wss:// in prod)    │
                   └──────────────► Node.js server ◄───────────────┘
                          no database · in-memory presence only
```

- **Next.js 15 (App Router) + TypeScript + Tailwind CSS 4** – UI.
- **Node.js + Socket.IO** – realtime backend (`server/`). By default it runs in the **same process and origin** as Next.js, so one deployment serves everything and the browser connects back to the page origin.
- **qrcode.react** – QR generation. **html5-qrcode** – in-browser camera scanning.

```
server/
  index.ts          Combined server (Next.js + Socket.IO)   ← default
  standalone.ts     Socket.IO-only backend (optional split deployment)
  realtime.ts       Socket event handlers, ownership checks, delivery acks
  storeRegistry.ts  Which stores are online + recent NIFs (memory only)
  rateLimiter.ts    In-memory rate limiting
  config.ts         Environment variables, optional HTTPS
src/
  shared/protocol.ts     Event contract + validation shared by client and server
  app/store, app/user    Routes
  components/merchant/*  Store sign-in and dashboard
  components/user/*      Customer mobile app
  lib/storeAuth.ts       Store account derivation (PBKDF2) and device storage
  lib/*                  Socket client, QR payload, formatting, error messages
```

### Store accounts without a backend database

- A store signs up with a **store name**, optional location, **email** and **password**.
- In the browser, email + password are stretched with **PBKDF2-SHA256** (310,000 iterations) into a 256-bit **store secret**.
- The **store id** printed in the QR is the first 22 characters of `SHA-256("nifpass-store-id:v1:" + secret)`.
  - Every store gets a different id, and the id is **permanent**. The QR never expires, so it can be printed.
  - Signing in with the same email + password on any device gives the same id, and therefore the same QR.
  - The server checks ownership without storing anything: when a screen opens a store, it must present a secret whose hash equals the store id. Knowing the QR (the public id) isn't enough to receive that store's NIFs.
- Several devices (e.g. counter laptop and kitchen tablet) can be signed in to the same store at once, and they all receive the NIFs.
- The account (and secret) is remembered in the device's `localStorage` until **Sign out**. There is no password reset: a forgotten password means creating a new store (and a new QR).

### How a share works

1. The store's screen emits `store:open`. The server verifies the secret against the store id, marks the store online and joins the screen to that store's private room.
2. The QR encodes only the store id: `https://<your-domain>/user?s=<storeId>`. On localhost it falls back to `NIFPASS:<storeId>` and never uses a localhost URL.
3. The phone scans it and emits `customer:join`. The server replies with the store name, or "store not available" if no screen is open for it.
4. The phone emits `customer:share`. This happens after **Confirm and Share**, or straight away if the customer turned on *Share automatically*. The server checks the NIF (exactly 9 digits) and that this phone joined **this** store. It forwards the NIF **only to that store's room** and waits for a screen to acknowledge it.
5. The customer sees *"Your NIF was sent to <store name>"* **only after the store's screen confirms receipt**.

### Privacy and security

- NIFs are never put in the QR code or a URL, never written to a database, and never logged. Server logs include only shortened store ids.
- Recent NIFs are kept in server memory so a page reload doesn't lose them. They are deleted 10 minutes after all of a store's screens go offline, on **Clear**, or on server restart.
- The customer's NIF stays in that tab's `sessionStorage`. It is sent only after confirmation, or after the customer's one-time opt-in to automatic sharing.
- Customers can only share to stores they have scanned, and each store receives only its own NIFs.
- Rate limiting applies per IP for store opening, joins and shares, plus a per-socket event cap. Payloads are capped at 10 KB.
- Security headers are set, and `Permissions-Policy` allows the camera only on the app's own origin.
- No server secrets are shipped to the browser. Only `NEXT_PUBLIC_*` variables are exposed, and they contain URLs only.

> This is a prototype, not a certified GDPR-compliant production system. Password-derived keys can be brute-forced offline if a weak password is used. Before commercial use, add real merchant accounts (server-side auth, password reset, MFA) and get a privacy and security review (DPIA, retention policy, audit logging).

## Requirements

- Node.js 20+ (tested with Node 22)
- npm

## Install

```bash
npm install
cp .env.example .env   # optional, all variables have sensible defaults
```

## Run

### Combined (recommended): frontend + backend on one port

```bash
npm run dev            # development, http://localhost:3000
# or
npm run build
npm start              # production
```

### Separately (optional)

```bash
# Terminal 1 – backend only (Socket.IO), e.g. on port 4000
PORT=4000 CORS_ORIGINS=http://localhost:3000 npm run backend

# Terminal 2 – frontend only (Next.js dev server) pointing at that backend
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000 npm run frontend
```

On Windows PowerShell set variables with `$env:PORT=4000; $env:CORS_ORIGINS="http://localhost:3000"; npm run backend`.

## Environment variables

| Variable                 | Where    | Default                 | Description |
| ------------------------ | -------- | ----------------------- | ----------- |
| `PORT`                   | server   | `3000`                  | Port to listen on. |
| `HOST`                   | server   | `0.0.0.0`               | Interface to bind. |
| `TRUST_PROXY`            | server   | `false`                 | `true` behind a proxy/PaaS/tunnel so rate limiting uses `X-Forwarded-For`. |
| `HTTPS_KEY_FILE` / `HTTPS_CERT_FILE` | server | –           | Serve HTTPS directly, e.g. with mkcert certificates for LAN testing. |
| `CORS_ORIGINS`           | server   | –                       | Comma-separated allowed origins. Only needed when the frontend is on another origin. |
| `NEXT_PUBLIC_APP_URL`    | frontend | page origin             | Public base URL embedded in merchant QR codes. Must not be localhost. Set it at **build** time. |
| `NEXT_PUBLIC_SOCKET_URL` | frontend | page origin             | Backend URL, only for split deployments. Set it at **build** time. |

## Testing with a laptop and a mobile phone

Mobile browsers allow camera access only on **HTTPS** pages, and the phone must be able to reach the server. Pick one of these options:

**Option A – HTTPS tunnel (easiest)**

```bash
npm run dev
# in another terminal, e.g. with Cloudflare Tunnel (no account needed):
cloudflared tunnel --url http://localhost:3000
# or: ngrok http 3000
```

Open the `https://…trycloudflare.com` (or ngrok) URL on **both** devices:

- Laptop: `https://<tunnel>/store`
- Phone: `https://<tunnel>/user`

Both tools support WebSockets. Set `TRUST_PROXY=true` for accurate rate limiting.

**Option B – deploy** (see below) and use your domain on both devices.

**Option C – LAN with local certificates**: create certificates for your laptop's LAN IP with [mkcert](https://github.com/FiloSottile/mkcert). Set `HTTPS_KEY_FILE` and `HTTPS_CERT_FILE`, then install the mkcert root CA on the phone.

### Acceptance walkthrough

1. **Store A**: open `/store` on the laptop → **Create store** (e.g. *Pastelaria A*, `a@store.pt`, a password). The dashboard shows the store on the left, its permanent QR in the middle and *Received NIFs* on the right, with the status *Open · receiving NIFs*.
2. **Store B**: in another browser or device, create a second store (e.g. *Café B*). It gets a different QR.
3. **Customer**: open `/user` → **My NIF** → enter `123456789` → **Save NIF** → **Scan Store QR** → scan Store A's QR. You'll see *"Pastelaria A will receive the NIF below."*
   (Scanning the QR with the phone's native camera app also works. It opens `/user` and connects automatically.)
4. **Confirm and Share** → only Store A shows the NIF, large, at the top of the right panel with a Europe/Lisbon time and a pop-up. Store B receives nothing.
5. **Repeats**: share again. The new NIF becomes the large one and the previous ones move to *Earlier*.
6. **Same QR everywhere**: sign out, then sign in with the same email and password (also works on another device). The QR is identical.
7. **Store closed**: sign out (or close the tab) on all of Store A's screens and scan its QR. The phone shows *Store not available*.
8. **NFC**: click **NFC**. A *Coming soon* message appears and nothing else happens.
9. **Print**: **Download QR to print** saves a poster PNG with the store name and QR.

## Deployment

The server keeps live WebSocket connections and in-memory state, so deploy it as a **single long-running Node.js instance**. Serverless platforms such as Vercel functions are not suitable for the Socket.IO backend.

### Single service (recommended) – Render, Railway, Fly.io, a VPS, etc.

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Environment: `TRUST_PROXY=true`, and optionally `NEXT_PUBLIC_APP_URL=https://your-domain` (set before building).
- The platform terminates TLS, so pages are served over HTTPS and Socket.IO automatically uses `wss://`.
- Then open `https://your-domain/store` on the store's device and `https://your-domain/user` on the phone.

> Store QR codes contain your domain. If you print them, keep that domain (or set `NEXT_PUBLIC_APP_URL`) so printed codes keep working.

### Split deployment

- Backend (any WebSocket-capable host): start `npm run start:backend` with `CORS_ORIGINS=https://your-frontend-domain` and `TRUST_PROXY=true`. Health check: `GET /health`.
- Frontend (e.g. Vercel): build with `NEXT_PUBLIC_SOCKET_URL=https://your-backend-domain` and `NEXT_PUBLIC_APP_URL=https://your-frontend-domain`.

### Scaling note

Store presence, recent NIFs and rate limits are in memory, so run **one instance**. To scale horizontally, use the Socket.IO Redis adapter and move the store registry to Redis.
