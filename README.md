# Progress Notes — Netlify (Join+Pull, Meta Polling, 409 Conflict, Leave Group)
- บันทึก (= join) แล้วดึงทันที
- Poll meta ทุก 4s (GET /api/group_meta) → ถ้า version เปลี่ยน จะ pull+merge อัตโนมัติ
- PUT /api/group ใช้ optimistic concurrency: baseVersion mismatch → 409
- ปุ่ม **ออกกลุ่ม** 2 แบบ: (1) คงข้อมูล, (2) ออก + ลบข้อมูลที่ดึงมาจากกลุ่ม (แท็กด้วย __groupId)

## Quickstart
npm i
npx netlify login
npx netlify init
netlify env:set BLOBS_SITE_ID <Site API ID>   # เฉพาะ dev/preview
netlify env:set BLOBS_TOKEN   <Personal Access Token>

npx netlify dev
npx netlify deploy --prod --dir=public
