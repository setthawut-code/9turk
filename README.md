# Progress Notes (Local-first) — Netlify ZIP

**สองไฟล์หลัก**
- `index.html` — โหลด React/Tailwind/Babel/CDN
- `App.js` — แอปหลัก (responsive + กลุ่มแชร์ผ่าน Netlify Functions)

**แชร์เป็นกลุ่ม**
- ใช้ Function: `netlify/functions/group.js` (ต้อง deploy ด้วย Git/CLI)
- ต้องมีไฟล์: `netlify.toml`, `_redirects`, `package.json` (มี @netlify/blobs)
- คำสั่ง:
  ```bash
  npm i
  npx netlify login
  npx netlify init        # เลือกสร้าง/ผูกไซต์
  npm run deploy          # หรือ: npx netlify deploy --prod --dir=.
  ```

ทดสอบฟังก์ชัน:
- `GET /api/group` → {"error":"Missing id"}
- `POST /api/group` → {"id":"...","writeKey":"..."}
- `PUT /api/group?id=<id>` + header `x-write-key` + body `{"version":1,"payload":{}}` → {"ok":true}

> ถ้าใช้ Drag & Drop บน Netlify: **Functions ใช้ไม่ได้** — แอปจะทำงาน local-only
