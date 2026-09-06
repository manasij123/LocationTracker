# SpotShare

Create and share temporary pickup / meeting-point locations. A creator picks a
place on a map, sets how long it stays available, and generates a link. Anyone
who opens the link sees the place on an interactive map with a live countdown
and one-tap directions. SpotShare never reads or spoofs anyone's real GPS —
every shared location is a manually chosen point.

The UI is a mobile-first, Android-app-styled web app (bottom navigation +
drawer on phones, a fixed sidebar on desktop/tablet) built as an installable
PWA.

## Stack

- **Client**: React + TypeScript + Vite, React Router, Leaflet (OpenStreetMap
  tiles), Recharts, hand-written CSS design system (light/dark themes).
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

Map tiles are always fetched live from OpenStreetMap's raster tile servers
(no key required); Leaflet renders a fully interactive, pannable/zoomable map.

## Key design notes

- **Server-authoritative expiration**: the client never computes whether a
  share is expired — it only renders `expiresAt`/`status` returned by the API
  and re-checks with the server when a countdown hits zero. A share is
  `active` only while `now < expiresAt` and it hasn't been revoked.
- **Privacy**: link-open analytics record a device category (Android / iPhone
  / Desktop / Other) and a one-way hash of `(shareId, IP, user agent)` — never
  raw IP addresses, precise visitor location, or other personal data.
- **Share tokens** are short, unambiguous, high-entropy public IDs (nanoid,
  custom alphabet) — practically impossible to guess.
