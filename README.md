# Progress Notes (Local-first) — Group + ENV fix

## Includes
- `index.html` — CDN React + Tailwind
- `App.js` — app (patients, CC/U-D, histories, attachments, notes, responsive, group share)
  - Safer `api(url, init)` with fallback to `/.netlify/functions/*` and structured `{ok,status,body}`
- `netlify/functions/group.js` — Functions v2 using `@netlify/blobs` with env fallbacks (`STORE_OPTS`)
- `netlify.toml`, `_redirects`, `package.json`

## Setup (CLI/Git — required for Functions)
```bash
npm i
npx netlify login
npx netlify init
# set env for Blobs (works for dev/preview too)
netlify env:set BLOBS_SITE_ID <YOUR_SITE_API_ID>
netlify env:set BLOBS_TOKEN   <YOUR_PERSONAL_ACCESS_TOKEN>
# run locally
npx netlify dev
# deploy
npx netlify deploy --prod --dir=.
```

Where to get values:
- **Site API ID**: Site settings → General → Site details → API ID
- **Personal Access Token**: User settings → Applications → Personal access tokens (must allow Blobs)

## API quick test
- `POST /api/group` body `{ "id":"med-ward-a", "pass":"your-secret" }` → expect **201**
- `GET  /api/group?id=med-ward-a` with header `x-pass: your-secret`
- `PUT  /api/group?id=med-ward-a` with header `x-pass: your-secret` and body `{ "version":1, "payload":{...} }`
