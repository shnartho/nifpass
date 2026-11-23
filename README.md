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
  app/api/store/account/route.ts  Store registration (PUT) and sign-in (POST), saved permanently
  app/api/store/qr/route.ts       Replaces a store's QR code with a new one
  app/api/store/token/route.ts    Verifies the store account, issues an Ably token for its current QR
  app/api/stores/[storeId]/route.ts  Is the store open? (Ably presence) + store name
  app/api/share/route.ts          Validates the NIF and publishes it to that store's channel
  app/page.tsx, app/store         Pages (customer app on the home page; /user redirects to /)
  components/merchant/*           Store sign-in and dashboard
  components/user/*               Customer mobile app
  lib/server/ably.ts              Server-side Ably client and API helpers
  lib/server/storeAccounts.ts     Permanent store registry (Vercel Blob; local files in dev)
  lib/useStoreChannel.ts          Store screen's Ably subscription + presence
  lib/storeAuth.ts                Password stretching (PBKDF2) and device storage
  shared/protocol.ts              Shared types, validation, channel naming
```

### Store accounts (saved permanently in Vercel Blob)

- A store signs up with a **store name**, optional location, **email** and **password**. In the browser, email + password are stretched with PBKDF2-SHA256 (310,000 iterations) into a 256-bit **store secret**. The password never leaves the device.
- `PUT /api/store/account` saves the store **permanently** as one private JSON file in the project's **Vercel Blob** store: `accounts/<SHA-256 of email>.json` with the QR id, a hash of the secret, the name, the location and timestamps. Emails, passwords and NIFs are never stored.
  - **One store per email.** Registering an email that already exists with another password is refused (*Email already registered*); with the same password it just signs in.
  - **Sign in** (`POST /api/store/account`) returns the same store and QR on any device. A wrong password or unknown email is an error; it never silently creates a new store.
- The **QR id** (22 base64url characters) stays the same **until the owner taps _Generate new QR code_** (`POST /api/store/qr`). That gives the store a new random id; the old QR, including printed copies, stops working, and the store's other open screens switch to the new QR automatically.
- **Each QR reaches only its own store.** `POST /api/store/token` only issues an Ably token after checking the store's secret, and only for the store's *current* QR id. The token can only **subscribe** and **enter presence** on that one channel, `nifpass:store:<id>`. A customer's NIF is published only to the channel of the QR they scanned, so knowing a QR (the public id) is not enough to receive a store's NIFs, and no other store can receive them.
- Several screens can be signed in to one store, and they all receive the NIFs.
- Cost: customer scans never touch Blob. Blob is only read on sign-in, when a store screen opens, and on hourly token renewals; it's only written on registration and QR regeneration.
- Stores created before the registry keep their QR: their first sign-in (or an already signed-in screen) registers them with the same QR id.
- With no Blob store configured, `npm run dev` / `make start` keep the registry in `.data/` (git-ignored). On Vercel, a connected Blob store is required.
- There's no password reset. A forgotten password means creating a new store (with another email) and a new QR.

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
6. **Show QR code** off: hides the on-screen QR (for stores with a printed QR). **Download QR to print** saves an A4 landscape poster: on the left, steps and a small QR to the website for customers who don't have NIFPass yet; on the right, the store's QR in large size for customers who already have it. **Generate new QR code** replaces the QR; the old one stops working.

## Deployment (Vercel)

1. Import the GitHub repo in Vercel (framework: Next.js; defaults are fine).
2. **Storage → Blob**: create a Blob store (or use the existing one) and **connect it to this project** for Production and Preview. This adds `BLOB_STORE_ID` (or `BLOB_READ_WRITE_TOKEN`) automatically. Store accounts are saved there; without it, store sign-in fails on Vercel.
3. **Settings → Environment Variables**:
   - `ABLY_API_KEY`: your Ably key (Production + Preview)
   - `NEXT_PUBLIC_APP_URL`: `https://nifpass.gogentik.com`
4. Redeploy. `NEXT_PUBLIC_*` values are baked in at build time.
5. Add the domain under **Settings → Domains**.

Printed QR codes contain `NEXT_PUBLIC_APP_URL`, so keep that domain stable.

### Costs

- **Vercel:** about 3 function calls per scan (lookup + share), plus one token call per store screen per hour.
- **Vercel Blob:** a few KB in total; about one read per open store screen per hour, and a write only on registration or a new QR. Well within the free tier for a small number of stores.
- **Ably free tier:** 500 monthly active users (store screens; give each store one id), 500 concurrent connections and 6M messages a month, roughly 1.5M+ scans.
- Nothing is billed while nobody scans.
