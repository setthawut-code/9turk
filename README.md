# Progress Notes (Local-first) — Simple Group (custom name + password)

## Files
- `index.html` — CDN React + Tailwind
- `App.js` — compact app (patients, CC/U-D, multi-history, attachments, progress notes, responsive, group share)
- `netlify/functions/group.js` — Netlify Functions v2 using @netlify/blobs (name + password)
- `netlify.toml`, `_redirects`, `package.json`

## Deploy (CLI/Git only — functions required)
```bash
npm i
npx netlify login
npx netlify init
npx netlify deploy --prod --dir=.
```

## API
- `POST /api/group` body `{ "id":"med-ward-a", "pass":"my-secret" }` → `201`
- `GET  /api/group?id=med-ward-a` header `x-pass: my-secret`
- `PUT  /api/group?id=med-ward-a` header `x-pass: my-secret` body `{ "version":1, "payload":{...} }`
