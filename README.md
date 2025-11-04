# Progress Notes — Netlify (Full, Mobile-friendly Header, MERGE + Share Selected)
- Pull = MERGE (ไม่ overwrite) ด้วย updatedAt/timestamp
- Push = เลือกผู้ป่วยได้ (subset payload)
- หัวเว็บ/เมนู “ตั้งค่า/กลุ่ม” สวยบนมือถือ (ซ่อน marker ของ <summary>, popover กลางจอใน mobile)
- ใช้ @netlify/blobs v8 get(...,{type:'json'})/setJSON()

## Quickstart
npm i
npx netlify login
npx netlify init
# หาก dev/preview ยังไม่ได้ bind Blobs:
netlify env:set BLOBS_SITE_ID <Site API ID>
netlify env:set BLOBS_TOKEN   <Personal Access Token>

npx netlify dev
npx netlify deploy --prod --dir=public
