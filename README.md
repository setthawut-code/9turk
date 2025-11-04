# Progress Notes (Local-first) — Netlify (โครงสร้างใหม่)

## โครงสร้าง
```
/public/index.html       # หน้า static (React UMD + Tailwind)
/public/app.js           # แอป local-first + แนบไฟล์ + AES (ตัวเลือก) + Group Sync
/public/_redirects       # map /api/* -> /.netlify/functions/*
/netlify/functions/group.js  # Functions v2 (ESM) ใช้ @netlify/blobs
/netlify.toml            # publish=public, functions=netlify/functions
/package.json            # @netlify/blobs + netlify-cli
```

## ตั้งค่า (ครั้งแรก)
```bash
npm i
npx netlify login
npx netlify init      # สร้าง/เชื่อมไซต์
# ตั้ง ENV สำหรับ dev/preview (กัน error "The environment has not been configured to use Netlify Blobs")
netlify env:set BLOBS_SITE_ID <YOUR_SITE_API_ID>   # ดูได้จาก Site settings → General → API ID
netlify env:set BLOBS_TOKEN   <YOUR_PERSONAL_ACCESS_TOKEN> # สร้างที่ User settings → Applications → Personal access tokens
```

## รันทดสอบ & Deploy
```bash
npx netlify dev
npx netlify deploy --prod --dir=public
```
> ใช้โครงสร้างนี้ `_redirects` อยู่ในโฟลเดอร์ **public** (publish dir) เพื่อให้ `/api/*` proxy ไป Functions ได้

## API
- POST `/api/group` body: `{ id, pass }` → 201/409
- GET  `/api/group?id=<id>` + `x-pass: <pass>` → 200/404
- PUT  `/api/group?id=<id>` + `x-pass: <pass>` body: `{ version, payload }` → 200

## หมายเหตุ
- ชื่อกรุ๊ปอนุญาต `A–Z a–z 0–9 _ -` ยาว 3–40 ตัว (แก้ regex ใน `group.js` ได้ถ้าต้องการใช้ภาษาไทย)
- ถ้ารัน `netlify dev` หรือ deploy preview แล้วเจอ error Blobs ให้ตรวจ ENV ตามด้านบน
- ฝั่งแอปมี fallback เมื่อ `/api` 404/502 จะลอง `/.netlify/functions/*` ให้อัตโนมัติ
