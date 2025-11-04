# Progress Notes — Netlify (AutoSync)
- เข้ากลุ่มแล้ว **ซิงก์อัตโนมัติ** ทั้งรับ (pull on change) และส่ง (push on local change) — ไม่มีปุ่ม Push/Pull
- ใช้ polling GET /api/group_meta ทุก 4s เพื่อจับการเปลี่ยนเวอร์ชัน แล้วดึง/รวม (merge) อัตโนมัติ
- PUT /api/group ใช้ optimistic concurrency (`baseVersion`) → ถ้ามีชนกันจะได้ 409 แล้วดึงก่อนค่อยส่งใหม่
- เลือกผู้ป่วยที่จะซิงก์ได้, ออกจากกลุ่มได้ 2 แบบ (คงข้อมูล/ลบข้อมูลจากกลุ่ม)

## ขั้นตอน
npm i
npx netlify login
npx netlify init
# ถ้า dev/preview ยังไม่ bind Blobs (prod บางเคสไม่ต้อง)
netlify env:set BLOBS_SITE_ID <Site API ID>
netlify env:set BLOBS_TOKEN   <Personal Access Token>

npx netlify dev
npx netlify deploy --prod --dir=public
