# Progress Notes (Local-first) — Netlify (FIX)
- Push ส่ง payload เป็น raw state (ไม่ห่อ) หรือ ciphertext ถ้าเปิด AES
- Pull รองรับ payload เก่า/ใหม่
- ฟังก์ชันใช้ @netlify/blobs v8: get(key,{type:'json'}) + setJSON()

## โครงสร้าง
/public/index.html
/public/app.js
/public/_redirects
/netlify/functions/group.js
/netlify.toml
/package.json
