# SpotShare

Create and share temporary pickup / meeting-point locations. A creator picks a
place on a map, sets how long it stays available, and generates a link. Anyone
who opens the link sees the place on an interactive map with a live countdown
and one-tap directions. Every shared location is a manually chosen point by
default — SpotShare never reads a creator's real GPS for these — except for
the separate, explicitly opt-in "My Current Location" live-tracking flow (see
below), where reading real GPS is the whole point of the feature.

The UI is a mobile-first, Android-app-styled web app (bottom navigation +
drawer on phones, a fixed sidebar on desktop/tablet) built as an installable
PWA.

## Stack

- **Client**: React + TypeScript + Vite, React Router, Google Maps JavaScript
  API for the map, Recharts, hand-written CSS design system (light/dark themes).
- **Server**: Node.js + Express + TypeScript, Prisma ORM, PostgreSQL, Zod
  validation, express-rate-limit, helmet.

## Project structure

```
client/   React app (components/, pages/, layouts/, hooks/, services/, types/, styles/)
server/   Express API (routes/, controllers/, services/, middleware/, prisma/)
```

## Running locally

### 1. Database

```bash
createdb spotshare   # or: docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
```

### 2. Backend

```bash
cd server
cp .env.example .env      # edit DATABASE_URL if needed
npm install
npx prisma migrate dev
npx tsx prisma/seed.ts    # optional demo data
npm run dev                # http://localhost:4000
```

### 3. Frontend

```bash
cd client
npm install
npm run dev                # http://localhost:5173 (proxies /api to :4000)
```

Open http://localhost:5173. The public recipient view lives at `/share/:token`.

### Tests

```bash
cd server && npm test
```

## Geocoding provider

`server/src/services/geocoding.ts` abstracts place search behind a
`GeocodingProvider` interface with two implementations:

- `mock` (default, `MAP_PROVIDER=mock`) — an offline dataset plus a
  deterministic fallback geocoder, so the app runs fully without any API key
  or internet access.
- `nominatim` (`MAP_PROVIDER=nominatim`) — calls the public OpenStreetMap
  Nominatim search API for live results.
- `google` (`MAP_PROVIDER=google`) — Google Places API (New) Text Search, the
  best result coverage/quality (especially for small local place names), at
  the cost of requiring a billed `GEOCODING_API_KEY` (restricted to Places
  API (New) only, no `Application restrictions` since it's called server-side).

Search also accepts exact coordinates pasted straight in (e.g.
`22.5744, 88.4331`, the kind of thing you'd copy off Google Maps) — detected
client-side by a simple regex and sent to `POST /api/locations/reverse-geocode`
instead of a text search. That endpoint always calls the free OpenStreetMap
Nominatim *reverse* API, regardless of `MAP_PROVIDER`, since no key is needed
and the forward-search provider choice is irrelevant once you already have
exact coordinates; if Nominatim is unreachable it falls back to a generic
"Pinned location (lat, lng)" label rather than failing outright.

The map itself is rendered client-side with the Google Maps JavaScript API,
which needs its own separate, browser-restricted key: set
`VITE_GOOGLE_MAPS_API_KEY` in `client/.env` to a key restricted (in Google
Cloud) to the Maps JavaScript API and to this app's origin(s) via an HTTP
referrer restriction — this key is publicly visible in the built frontend
bundle by design, so the referrer restriction is what keeps it from being
usable elsewhere. Without this key the map area shows a "couldn't load the
map" placeholder; everything else in the app still works.

When a creator updates an active share's location (same link, new spot),
the map glides the marker along the actual route between the old and new
point — walking + public transit legs when Google has transit coverage
for that pair of points (so a walk-to-station, train, walk-from-station
trip visibly changes pace per leg), falling back to the shortest driving
route otherwise. Playback plays out at the trip's real estimated duration
— a 7-minute walk's glide takes 7 real minutes and arrives exactly on
that mark, the same number Google Maps itself would show for those two
points — rather than a fixed time regardless of distance. When updating a
location, the creator sees Google's own per-mode estimates (driving,
transit, walking, cycling — like Google Maps' own route picker) and can
pick whichever matches how they're actually getting there, which then
also decides the path drawn; "Recommended" keeps the transit-else-driving
auto-detection. They can also type an exact travel time (in minutes),
which rescales every leg's pace proportionally to match while keeping the
walk-slower/train-faster shape intact. This needs **Directions API** enabled for the same Google Cloud
project and added to that browser key's API restrictions list alongside
Maps JavaScript API (transit and driving are both just travel modes
within that one API, no separate one to enable) — without it, the marker
still moves (falls back to a fixed-time straight-line glide), just
without the route-following, realistically-paced animation.

## My Current Location (live tracking)

A separate flow from manually-picked spot shares: "My Current Location" (between "My Locations"
and "Activity" in the sidebar) lets a creator share their real, continuously-updating GPS
position from a "Share Realtime Location" button, generating a link in the same style as a
normal share. It's browser-tab-based — the creator's own tab has to stay open and
`navigator.geolocation.watchPosition` running, since browsers can't do real background GPS
tracking without a native wrapper (out of scope here) — and keeps running across in-app page
navigation (its state lives in a `LiveShareProvider` mounted once at the app root), stopping
only when the creator presses "Stop Sharing" (or the safety-net 12-hour expiry lapses). The
recipient's page polls much more frequently for a live share (every 4s vs. the normal 15s) and
shows a "🔴 Live" indicator instead of a countdown.

As the creator moves, their actual raw GPS fixes (not a fetched/estimated route — no Directions
API calls at all for this, unlike manually-updated shares) are drawn directly as a growing red
trail, throttled to roughly one point per ~5 seconds or ~8 meters moved. If they stay within
about 30 meters of one spot for 5+ minutes, that spot is auto-detected client-side and recorded
as a numbered "Wait Point" ("W.P:1", "W.P:2", ...). Both the trail and wait points are persisted
server-side (`LiveTrackPoint` rows) so a recipient reloading the page still sees the full
accumulated history, the same way a manual share's location history survives reloads.

## Deploying (hosting) SpotShare

There are three pieces to put somewhere: a **Postgres database**, the
**backend** (Express API), and the **frontend** (static build). Two hosting
patterns work:

**Pattern A — separate domains (most common, both have generous free tiers):**
DB on Neon/Supabase, API on Render/Railway/Fly.io, frontend on Vercel/Netlify.

**Pattern B — single service:** one Node process serves both the API and the
built frontend from the same origin (no cross-origin config needed at all).
Not set up in this repo by default, but easy to add later (`express.static`
on `client/dist`).

This repo is wired for **Pattern A** already. Steps:

### 1. Database

Create a free Postgres instance on [Neon](https://neon.tech) or
[Supabase](https://supabase.com) (or use your host's managed Postgres, e.g.
Render/Railway Postgres). Copy the connection string it gives you — that's
your `DATABASE_URL`. On Neon specifically, copy the **pooled** connection
string (its host contains `-pooler`), not the direct one — it reconnects
faster and handles a burst of requests right after a cold start much
better, which matters once the backend itself is on a free tier that sleeps
(see the note below).

### 2. Backend (e.g. Render / Railway / Fly.io)

- Point the service at this repo, **root directory `server`**.
- Build command: `npm install && npx prisma generate && npx prisma migrate deploy`
- Start command: `npm run build && npm start` (or `npm run dev` isn't for
  production — always run the compiled `dist/index.js` in prod)
- Environment variables (from `server/.env.example`):
  - `DATABASE_URL` — the connection string from step 1
  - `PORT` — most platforms inject this automatically; otherwise `4000`
  - `CLIENT_ORIGIN` — the exact URL your frontend will be hosted at, e.g.
    `https://spotshare.vercel.app` (comma-separate multiple origins if
    needed — this is what the API's CORS check allows)
  - `MAP_PROVIDER` — `mock` (offline, no key) or `nominatim` (live OSM search)
  - `DEMO_USER_EMAIL` / `DEMO_USER_NAME` — optional, cosmetic only
- After the first deploy, run the seed script once if you want demo data:
  `npx tsx prisma/seed.ts` (via the platform's shell/console).
- Note your backend's public URL, e.g. `https://spotshare-api.onrender.com`.

### 3. Frontend (e.g. Vercel / Netlify / Cloudflare Pages)

- Point the service at this repo, **root directory `client`**.
- Build command: `npm install && npm run build`
- Output directory: `dist`
- Environment variable:
  - `VITE_API_BASE_URL` — your backend's public URL from step 2, e.g.
    `https://spotshare-api.onrender.com` (**no trailing slash, no `/api`**)
  - Rebuild after setting this — Vite bakes env vars in at build time.
- SPA routing: this is a client-side-routed app, so the host must rewrite
  all unknown paths to `/index.html` (Vercel/Netlify do this automatically
  for Vite apps; on others add a `_redirects`/rewrite rule: `/* /index.html 200`).

### 4. Connect them

- Set the frontend's `VITE_API_BASE_URL` to the backend URL (step 3) and
  redeploy the frontend.
- Set the backend's `CLIENT_ORIGIN` to the frontend URL (step 2) and
  redeploy the backend, so CORS allows requests from it.
- Open the frontend URL — it should now load real data from the backend.
  `https://<frontend>/share/<token>` is the link recipients get.

### Notes

- **Free-tier cold starts**: Render's free web services sleep after 15
  minutes with no traffic, and the next request has to wait 10-60+ seconds
  for it to wake back up — this is almost always what "the app feels slow"
  turns out to be, not the app itself. A free, zero-code fix is an external
  uptime pinger (e.g. [cron-job.org](https://cron-job.org),
  [UptimeRobot](https://uptimerobot.com)) hitting `/api/health` every 10-14
  minutes so the service never fully idles. The other options are a paid
  Render instance (doesn't sleep at all) or moving the API to a platform
  without a sleep model.
- Both HTTPS (required for the PWA service worker and for `navigator.share`/
  clipboard APIs to work reliably) and a custom domain are usually free
  add-ons on the platforms above.
- If you deploy backend and frontend to the **same domain** instead (Pattern
  B, or a reverse proxy that maps `/api` on the frontend's domain to the
  backend), leave `VITE_API_BASE_URL` empty — the app already defaults to
  relative `/api/...` calls.
- `server/prisma/migrations/` is committed, so `prisma migrate deploy` (not
  `migrate dev`) is what production should run — it applies existing
  migrations without prompting or generating new ones.

## Key design notes

- **Server-authoritative expiration**: the client never computes whether a
  share is expired — it only renders `expiresAt`/`status` returned by the API
  and re-checks with the server when a countdown hits zero. A share is
  `active` only while `now < expiresAt` and it hasn't been revoked.
- **Privacy**: link-open analytics record a device category (Android / iPhone
  / Desktop / Other) and a one-way hash of `(shareId, IP, user agent)` — never
  raw IP addresses, precise visitor location, or other personal data. Real
  GPS is only ever read for the explicitly opt-in "My Current Location" live
  share, started by an explicit button press, stopped by an explicit button
  press, and never running otherwise.
- **Share tokens** are short, unambiguous, high-entropy public IDs (nanoid,
  custom alphabet) — practically impossible to guess.
