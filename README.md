# Progress Notes — Netlify (AutoSync, fix1)
- แก้จอขาวจากบั๊ก template string ใน NewNoteForm.toLocal (minutes)
- เพิ่ม error badge ขวาล่างเมื่อมี runtime error
- AutoSync ตามเดิม

Quickstart:
npm i
npx netlify login
npx netlify init
netlify env:set BLOBS_SITE_ID <Site API ID>
netlify env:set BLOBS_TOKEN   <Personal Access Token>
npx netlify dev
npx netlify deploy --prod --dir=public
