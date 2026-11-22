# NIFPass by GoGentik

Customers in Portugal share their NIF with a store without saying it out loud:

**Store shows its permanent QR → Customer scans → NIF appears on the store's screen instantly.**

| Route    | Who      | Device                  |
| -------- | -------- | ----------------------- |
| `/store` | Store    | Laptop, tablet or phone |
| `/`      | Customer | Mobile phone            |

## Architecture: pay per scan, nothing running while idle

```
 Store screen (/store)                    Vercel (Next.js API routes)                Customer phone (/)
 ─────────────────────                    ───────────────────────────                ──────────────────────
 POST /api/store/token ─────────────────► verify store secret, issue Ably token
 subscribe + presence on                                                              scan QR ─► storeId
 "nifpass:store:<id>"  ◄══ Ably ══╗       GET  /api/stores/:id ◄───────────────────── "is this store open?"
                                  ║          └ Ably presence ─► store name
                                  ║       POST /api/share ◄────────────────────────── { storeId, nif }
   NIF shown instantly ◄══════════╝          └ Ably publish (only to that store)
```

- **Next.js 15 + TypeScript + Tailwind CSS 4**, deployable as-is to **Vercel**, with no custom server.
- **Ably** holds the store screens' live connections. Our code (three small API routes) only runs when a store screen signs in, when it renews its token (hourly), and when a customer scans.
- Customers' phones **never connect to Ably**, so only store screens count toward Ably's monthly active users.
- **qrcode.react** generates the QR codes and **html5-qrcode** scans them in the browser.

```
src/
  app/api/store/token/route.ts    Verifies store ownership, issues a scoped Ably token
  app/api/stores/[storeId]/route.ts  Is the store open? (Ably presence) + store name
  app/api/share/route.ts          Validates the NIF and publishes it to that store's channel
  app/page.tsx, app/store         Pages (customer app on the home page; /user redirects to /)
  components/merchant/*           Store sign-in and dashboard
  components/user/*               Customer mobile app
  lib/server/ably.ts              Server-side Ably client and ownership check
  lib/useStoreChannel.ts          Store screen's Ably subscription + presence
  lib/storeAuth.ts                Store account derivation (PBKDF2) and device storage
  shared/protocol.ts              Shared types, validation, channel naming
```

### Store accounts without a database

- A store signs up with a **store name**, optional location, **email** and **password**. In the browser, these are stretched with PBKDF2-SHA256 (310,000 iterations) into a 256-bit **store secret**.
- The **store id** in the QR is the first 22 characters of `SHA-256("nifpass-store-id:v1:" + secret)`.
  - Each store gets a different, **permanent** id. The QR never expires.
  - The same email and password give the same QR on any device.
- `POST /api/store/token` only issues an Ably token if the secret hashes to the store id. The token can only **subscribe** and **enter presence** on that store's own channel. So knowing a QR (the public id) is not enough to receive a store's NIFs.
- Several screens can be signed in to one store, and they all receive the NIFs.
- The store's **name and location** are saved in **Vercel Blob** (private) by `POST/PUT /api/store/profile`, which only works with the store's secret. This lets the same email and password open the same store on any phone or browser. Emails, passwords and NIFs are never stored there. Without `BLOB_READ_WRITE_TOKEN`, a new device just asks for the store name once.
- There's no password reset. A forgotten password means creating a new store (and a new QR).

### How a share works

1. The store screen gets a token and subscribes to `nifpass:store:<storeId>`. It enters presence with its store name, which marks the store as "open".
2. The customer scans the QR (`https://<domain>/?s=<storeId>`; older `/user?s=` codes redirect). The phone calls `GET /api/stores/<storeId>`, which returns the store name, or *Store not available* if no screen is open.
3. After **Confirm and Share**, or straight away if the customer turned on *Share automatically*, the phone calls `POST /api/share`. The server checks the NIF format, checks that the store is open, and publishes the NIF **only to that store's channel**.
4. The store screen shows it at once, large, with a pop-up. In testing, delivery takes about 130–160 ms.

### Privacy and security

- NIFs are never put in the QR code or a URL, never stored in a database, and never logged. Make sure **message persistence is off** in Ably (it is by default).
- On the store screen, received NIFs (last 100) are saved on that device (`localStorage`), so they're still there after closing and reopening the app. They are removed by **Clear** or **Sign out**.
- Two home-screen apps: **NIFPass** (customers, `/manifest.webmanifest`) and **NIFPass Store** (store owners, `/store-app.webmanifest`, opens `/store`).
- The customer's NIF is saved only on their own device (`localStorage`), so it survives closing the app. It is never stored on a server. It is sent only when they scan a store's QR (automatic sharing, on by default) or after they confirm.
- `ABLY_API_KEY` is server-only. Store screens get short-lived tokens limited to their own channel.
- The API routes have basic per-instance rate limiting. On serverless, use Vercel's firewall or an Upstash rate limiter for stronger limits.

> This is a prototype, not a certified GDPR-compliant production system. Password-derived keys can be brute-forced offline if a weak password is used. Before commercial use, add real store accounts (server-side auth, password reset, MFA) and get a privacy and security review.

## Setup

Requirements: Node.js 20+ and an [Ably](https://ably.com) account.

1. In Ably, create an app and an API key with **Publish, Subscribe, Presence and Channel metadata**, restricted to channels `nifpass:*`.
2. Create `.env.local` (git-ignored):
   ```
   ABLY_API_KEY=your-ably-key
   # NEXT_PUBLIC_APP_URL=https://nifpass.gogentik.com   # base URL printed in store QR codes
   ```
3. Run:
   ```bash
   npm install
   make start      # build + production server on http://localhost:3000
   # or: npm run dev
   ```

Phone cameras and store sign-in need **HTTPS**. To test with a real phone, expose port 3000 with VS Code port forwarding (set to Public), `cloudflared tunnel --url http://localhost:3000`, or ngrok. Open the HTTPS address on both devices.

### Walkthrough

1. **Store A**: open `/store` → **Create store**. You get a dashboard with the store on the left, its permanent QR in the middle and *Received NIFs* on the right, with the status *Open · receiving NIFs*.
2. **Store B**: in another browser, create a second store. It gets a different QR.
3. **Customer**: open the home page `/` → **My NIF** → `123456789` → **Scan Store QR** → scan Store A's QR → *"Pastelaria A will receive the NIF below."* → **Confirm and Share**.
4. Only Store A shows the NIF, large, with a Europe/Lisbon time and a pop-up.
5. Close all of Store A's screens and scan again: the phone shows *Store not available*.
6. **Show QR code** off: hides the on-screen QR (for stores with a printed QR). **Download QR to print** saves a poster PNG.

## Deployment (Vercel)

1. Import the GitHub repo in Vercel (framework: Next.js; defaults are fine).
2. **Settings → Environment Variables**:
   - `ABLY_API_KEY`: your Ably key (Production + Preview)
   - `NEXT_PUBLIC_APP_URL`: `https://nifpass.gogentik.com`
3. Redeploy. `NEXT_PUBLIC_*` values are baked in at build time.
4. Add the domain under **Settings → Domains**.

Printed QR codes contain `NEXT_PUBLIC_APP_URL`, so keep that domain stable.

### Costs

- **Vercel:** about 3 function calls per scan (lookup + share), plus one token call per store screen per hour.
- **Ably free tier:** 500 monthly active users (store screens; give each store one id), 500 concurrent connections and 6M messages a month, roughly 1.5M+ scans.
- Nothing is billed while nobody scans.
