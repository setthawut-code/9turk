# Progress Notes (Local-first) — Netlify (MERGE + Share Selected Patients)
- Pull = MERGE (ไม่ overwrite) โดยดู updatedAt/timestamp
- Push = เลือกผู้ป่วยที่จะส่งขึ้นกลุ่ม (subset payload)
- รองรับ AES encrypt ก่อนส่ง
- API ไม่เปลี่ยน (เก็บ payload ตามที่ส่ง)

## Quickstart
npm i
npx netlify login
npx netlify init
netlify env:set BLOBS_SITE_ID <Site API ID>   # เฉพาะ dev/preview
netlify env:set BLOBS_TOKEN   <Personal Access Token>
npx netlify dev
npx netlify deploy --prod --dir=public
