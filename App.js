const { useState, useEffect, useMemo } = React;
const CryptoJS = window.CryptoJS;
const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = window.LZString;

/** ===== Types (comment only)
 Patient {
   id, hn, name, sex, dob, tags[], color,
   cc, ud,
   hx: { hpi, pmh, meds, allergy, surg, family, social, gynObs, menstrual, sexual, immun, travel },
   attachments: [{id,name,type,size,dataUrl}]
 }
 Note {
   id, patientId, timestamp, author,
   vitals:{bp,hr,rr,t,sat}, soap:{S,O,A,P}, meds,
   attachments:[...]
 }
*/
const LS_KEY = "patientNotes.v1";
const APP_VERSION = "1.5.1"; // zipped kit

const nowISO  = () => new Date().toISOString();
const fmtDate = (iso) => new Date(iso).toLocaleString();
const uid     = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const stringify = (o) => JSON.stringify(o);

// === crypto helpers ===
function encryptJSON(jsonString, passphrase){
  const salt = CryptoJS.lib.WordArray.random(16);
  const iv   = CryptoJS.lib.WordArray.random(16);
  const key  = CryptoJS.PBKDF2(passphrase, salt, { keySize: 256/32, iterations: 1000 });
  const enc  = CryptoJS.AES.encrypt(jsonString, key, { iv });
  return { enc:true, v:1, salt: CryptoJS.enc.Base64.stringify(salt), iv: CryptoJS.enc.Base64.stringify(iv), data: enc.toString() };
}
function decryptJSON(payload, passphrase){
  try{
    if(!payload?.enc) return JSON.stringify(payload);
    const salt = CryptoJS.enc.Base64.parse(payload.salt);
    const iv   = CryptoJS.enc.Base64.parse(payload.iv);
    const key  = CryptoJS.PBKDF2(passphrase, salt, { keySize: 256/32, iterations: 1000 });
    const dec  = CryptoJS.AES.decrypt(payload.data, key, { iv }).toString(CryptoJS.enc.Utf8);
    return dec || null;
  }catch{ return null; }
}

const Storage = {
  load(passphrase){
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return { patients:[], notes:[], settings:{ encryptionEnabled:false, group:{ id:"", writeKey:"" } } };
    const parsed = safeParse(raw);
    if(parsed?.enc){
      if(!passphrase) return "LOCKED";
      const j = decryptJSON(parsed, passphrase);
      if(!j) return "BAD_PASS";
      const obj = safeParse(j) || {};
      if(!obj.settings?.group) obj.settings = { ...(obj.settings||{}), group:{ id:"", writeKey:"" } };
      return obj;
    }
    if(!parsed.settings?.group) parsed.settings = { ...(parsed.settings||{}), group:{ id:"", writeKey:"" } };
    return parsed || { patients:[], notes:[], settings:{ encryptionEnabled:false, group:{ id:"", writeKey:"" } } };
  },
  save(store, passphrase, encOn){
    if(encOn && passphrase){
      const payload = encryptJSON(stringify(store), passphrase);
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    }else{
      localStorage.setItem(LS_KEY, stringify(store));
    }
  },
  clear(){ localStorage.removeItem(LS_KEY); }
};

// === File utils ===
const formatBytes = (b) => {
  if (b === undefined || b === null) return "-";
  const u = ["B","KB","MB","GB"]; let i=0, n=b;
  while (n>=1024 && i<u.length-1){ n/=1024; i++; }
  return `${n.toFixed(n<10 && i>0 ? 1 : 0)} ${u[i]}`;
};
const fileToDataUrl = (file) => new Promise((resolve, reject)=>{
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = reject;
  r.readAsDataURL(file);
});

/* ====== UI primitives ====== */
function VitalInput({ label, val, onChange }){
  return (
    <div>
      <label className="text-xs text-neutral-500">{label}</label>
      <input value={val||""} onChange={e=>onChange(e.target.value)} className="w-full border rounded-xl px-3 py-2"/>
    </div>
  );
}
function TextArea({ label, val, onChange, rows=3 }){
  return (
    <div>
      <label className="text-xs text-neutral-500">{label}</label>
      <textarea value={val||""} onChange={e=>onChange(e.target.value)} rows={rows} className="w-full border rounded-xl px-3 py-2"/>
    </div>
  );
}

/* ===== AttachmentManager ===== */
function AttachmentManager({ items, onAdd, onRemove }) {
  const [busy, setBusy] = useState(false);
  const handleFiles = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const MAX = 5 * 1024 * 1024;
      const arr = [];
      for (const f of files) {
        if (f.size > MAX) {
          alert(`ไฟล์ ${f.name} ขนาด ${formatBytes(f.size)} ใหญ่เกิน (${formatBytes(MAX)})`);
          continue;
        }
        const dataUrl = await fileToDataUrl(f);
        arr.push({ id: uid(), name: f.name, type: f.type || "application/octet-stream", size: f.size, dataUrl });
      }
      if (arr.length) onAdd(arr);
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border cursor-pointer">
        📎 แนบไฟล์
        <input type="file" className="hidden" multiple
          onChange={e=>{ handleFiles(Array.from(e.target.files||[])); e.currentTarget.value=""; }}/>
      </label>
      {busy && <div className="text-xs text-neutral-500">กำลังประมวลผลไฟล์…</div>}

      {(!items || items.length===0) ? (
        <div className="text-sm text-neutral-500">ยังไม่มีไฟล์แนบ</div>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(it=>{
            const isImg = (it.type||"").startsWith("image/");
            return (
              <li key={it.id} className="border rounded-xl p-3 bg-white">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-sm font-medium truncate" title={it.name}>{it.name}</div>
                  <button onClick={()=>onRemove(it.id)} className="px-2 py-1 rounded bg-white border text-xs">ลบ</button>
                </div>
                <div className="text-xs text-neutral-500 mb-2">{it.type || "unknown"} • {formatBytes(it.size)}</div>
                {isImg ? (
                  <a href={it.dataUrl} download={it.name} target="_blank" rel="noreferrer">
                    <img src={it.dataUrl} alt={it.name} className="w-full h-36 object-cover rounded-lg border" />
                  </a>
                ) : (
                  <a href={it.dataUrl} download={it.name} className="inline-block px-2 py-1 rounded bg-neutral-100 border text-sm">
                    ดาวน์โหลด
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ===== PatientEditor ===== */
function PatientEditor({ patient, onChange, onRemove }){
  const withDefaults = (p)=>({
    color: "#22c55e",
    cc:"", ud:"",
    hx:{ hpi:"", pmh:"", meds:"", allergy:"", surg:"", family:"", social:"", gynObs:"", menstrual:"", sexual:"", immun:"", travel:"" },
    attachments: [],
    ...p,
    color: p.color || "#22c55e",
    hx:{ hpi:"", pmh:"", meds:"", allergy:"", surg:"", family:"", social:"", gynObs:"", menstrual:"", sexual:"", immun:"", travel:"", ...(p.hx||{}) },
    attachments: Array.isArray(p.attachments) ? p.attachments : []
  });

  const [local, setLocal] = useState(withDefaults(patient));
  useEffect(()=>setLocal(withDefaults(patient)), [patient]);
  useEffect(()=>{ const t=setTimeout(()=>onChange(local), 250); return ()=>clearTimeout(t); }, [local]);

  const set = (patch)=> setLocal(v=>({ ...v, ...patch }));
  const setHx = (k,val)=> setLocal(v=>({ ...v, hx:{ ...v.hx, [k]:val }}));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">ข้อมูลผู้ป่วย</h2>
        <button onClick={onRemove} className="px-3 py-2 rounded-xl bg-white border">ลบผู้ป่วย</button>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-neutral-500">ชื่อ-สกุล</label>
          <input value={local.name||""} onChange={e=>set({ name:e.target.value })} className="w-full border rounded-xl px-3 py-2"/>
        </div>
        <div>
          <label className="text-xs text-neutral-500">HN</label>
          <input value={local.hn||""} onChange={e=>set({ hn:e.target.value })} className="w-full border rounded-xl px-3 py-2"/>
        </div>
        <div>
          <label className="text-xs text-neutral-500">เพศ</label>
          <select value={local.sex||""} onChange={e=>set({ sex:e.target.value })} className="w-full border rounded-xl px-3 py-2">
            <option value="">-</option><option value="M">ชาย</option><option value="F">หญิง</option><option value="Other">อื่น ๆ</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500">วันเกิด</label>
          <input type="date" value={local.dob||""} onChange={e=>set({ dob:e.target.value })} className="w-full border rounded-xl px-3 py-2"/>
        </div>

        {/* สีผู้ป่วย */}
        <div>
          <label className="text-xs text-neutral-500">สีผู้ป่วย (สำหรับไฮไลต์/ป้าย)</label>
          <div className="flex items-center gap-3">
            <input type="color" value={local.color} onChange={e=>set({ color:e.target.value })} className="h-10 w-12 p-0 border rounded" />
            <input value={local.color} onChange={e=>set({ color:e.target.value })} className="flex-1 border rounded-xl px-3 py-2" />
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-neutral-500">Tags (คั่นด้วยช่องว่าง)</label>
          <input value={(local.tags||[]).join(" ")} onChange={e=>set({ tags: e.target.value.trim()? e.target.value.trim().split(/\s+/): [] })} className="w-full border rounded-xl px-3 py-2"/>
        </div>
      </div>

      {/* CC / U-D */}
      <div className="grid md:grid-cols-2 gap-3 mt-4">
        <div>
          <label className="text-xs text-neutral-500">CC (อาการสำคัญ)</label>
          <input value={local.cc||""} onChange={e=>set({ cc:e.target.value })} className="w-full border rounded-xl px-3 py-2"/>
        </div>
        <div>
          <label className="text-xs text-neutral-500">U/D (โรคประจำตัว)</label>
          <input value={local.ud||""} onChange={e=>set({ ud:e.target.value })} className="w-full border rounded-xl px-3 py-2"/>
        </div>
      </div>

      {/* ประวัติหลายด้าน */}
      <div className="mt-4">
        <h3 className="font-semibold mb-2">ประวัติ</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-neutral-500">HPI (ประวัติปัจจุบัน)</label>
            <textarea rows={4} value={local.hx.hpi} onChange={e=>setHx("hpi", e.target.value)} className="w-full border rounded-xl px-3 py-2"/>
          </div>
          <div>
            <label className="text-xs text-neutral-500">PMH (อดีตการเจ็บป่วย)</label>
            <textarea rows={4} value={local.hx.pmh} onChange={e=>setHx("pmh", e.target.value)} className="w-full border rounded-xl px-3 py-2"/>
          </div>

          <div>
            <label className="text-xs text-neutral-500">ยาที่ใช้ประจำ</label>
            <textarea rows={3} value={local.hx.meds} onChange={e=>setHx("meds", e.target.value)} className="w-full border rounded-xl px-3 py-2"/>
          </div>
          <div>
            <label className="text-xs text-neutral-500">แพ้ยา/อาหาร</label>
            <textarea rows={3} value={local.hx.allergy} onChange={e=>setHx("allergy", e.target.value)} className="w-full border rounded-xl px-3 py-2"/>
          </div>

          <div>
            <label className="text-xs text-neutral-500">ผ่าตัด/หัตถการ</label>
            <textarea rows={3} value={local.hx.surg} onChange={e=>setHx("surg", e.target.value)} className="w-full border rounded-xl px-3 py-2"/>
          </div>
          <div>
            <label className="text-xs text-neutral-500">ครอบครัว (FHx)</label>
            <textarea rows={3} value={local.hx.family} onChange={e=>setHx("family", e.target.value)} className="w-full border rounded-xl px-3 py-2"/>
          </div>

          <div>
            <label className="text-xs text-neutral-500">สังคม/อาชีพ/บุหรี่/แอลกอฮอล์</label>
            <textarea rows={3} value={local.hx.social} onChange={e=>setHx("social", e.target.value)} className="w-full border rounded-xl px-3 py-2"/>
          </div>
          <div>
            <label className="text-xs text-neutral-500">วัคซีน</label>
            <textarea rows={3} value={local.hx.immun} onChange={e=>setHx("immun", e.target.value)} className="w-full border rounded-xl px-3 py-2"/>
          </div>

          <div>
            <label className="text-xs text-neutral-500">นรีเวช/สูติ (Gyn/Obs)</label>
            <textarea rows={3} value={local.hx.gynObs} onChange={e=>setHx("gynObs", e.target.value)} className="w-full border rounded-xl px-3 py-2"/>
          </div>
          <div>
            <label className="text-xs text-neutral-500">รอบเดือน (Menstrual)</label>
            <textarea rows={3} value={local.hx.menstrual} onChange={e=>setHx("menstrual", e.target.value)} className="w-full border rounded-xl px-3 py-2"/>
          </div>

          <div>
            <label className="text-xs text-neutral-500">ประวัติทางเพศ (Sexual)</label>
            <textarea rows={3} value={local.hx.sexual} onChange={e=>setHx("sexual", e.target.value)} className="w-full border rounded-xl px-3 py-2"/>
          </div>
          <div>
            <label className="text-xs text-neutral-500">เดินทาง/สัมผัสเสี่ยง</label>
            <textarea rows={3} value={local.hx.travel} onChange={e=>setHx("travel", e.target.value)} className="w-full border rounded-xl px-3 py-2"/>
          </div>
        </div>
      </div>

      {/* แนบไฟล์ของผู้ป่วย */}
      <div className="mt-4">
        <h3 className="font-semibold mb-2">ไฟล์แนบของผู้ป่วย</h3>
        <AttachmentManager
          items={local.attachments}
          onAdd={(arr)=> set({ attachments: [...local.attachments, ...arr] })}
          onRemove={(id)=> set({ attachments: local.attachments.filter(x=>x.id!==id) })}
        />
      </div>
    </div>
  );
}

/* ===== NewNoteForm ===== */
function NewNoteForm({ onAdd }){
  const blank = () => ({ id:"", patientId:"", timestamp: nowISO(), author:"", vitals:{}, soap:{S:"",O:"",A:"",P:""}, meds:"", attachments: [] });
  const [m, setM] = useState(blank());
  const toLocal = (iso)=>{ const d=new Date(iso), p=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const reset = ()=>setM(blank());

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">เพิ่ม Progress Note</h3>
        <div className="flex gap-2">
          <button onClick={()=>{
            setM(prev=>({...prev, soap:{
              S:(prev.soap?.S||"")+(prev.soap?.S?"\n":"")+"ไม่มีไข้ ไอเล็กน้อย ไม่มีหอบเหนื่อย ไม่มีเจ็บหน้าอก",
              O:(prev.soap?.O||"")+(prev.soap?.O?"\n":"")+"คนไข้รู้สึกตัวดี ไม่ซีด ไม่ดีซ่าน ปอดใสสองข้าง เสียงหัวใจปกติ ไม่มีบวมกดบุ๋ม",
              A: prev.soap?.A||"",
              P:(prev.soap?.P||"")+(prev.soap?.P?"\n":"")+"ให้ยาตามแพทย์สั่ง ติดตามสัญญาณชีพให้คงที่ นัดประเมินซ้ำใน 24 ชม."
            }}));
          }} className="px-3 py-2 rounded-xl bg-white border">เติม SOAP</button>
          <button onClick={()=>{ onAdd({...m, timestamp: nowISO()}); reset(); }} className="px-3 py-2 rounded-xl bg-black text-white">บันทึก</button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-3">
        <div><label className="text-xs text-neutral-500">ผู้บันทึก</label>
          <input value={m.author||""} onChange={e=>setM(v=>({...v, author:e.target.value}))} className="w-full border rounded-xl px-3 py-2"/></div>
        <div><label className="text-xs text-neutral-500">วันเวลา</label>
          <input type="datetime-local" value={toLocal(m.timestamp)} onChange={e=>setM(v=>({...v, timestamp:new Date(e.target.value).toISOString()}))} className="w-full border rounded-xl px-3 py-2"/></div>
        <div><label className="text-xs text-neutral-500">ยา/แผน (สรุป)</label>
          <input value={m.meds||""} onChange={e=>setM(v=>({...v, meds:e.target.value}))} className="w-full border rounded-xl px-3 py-2"/></div>
      </div>

      <div className="grid md:grid-cols-5 gap-3 mb-3">
        <VitalInput label="BP"  val={m.vitals?.bp}  onChange={v=>setM(s=>({...s, vitals:{...s.vitals, bp:v}}))}/>
        <VitalInput label="HR"  val={m.vitals?.hr}  onChange={v=>setM(s=>({...s, vitals:{...s.vitals, hr:v}}))}/>
        <VitalInput label="RR"  val={m.vitals?.rr}  onChange={v=>setM(s=>({...s, vitals:{...s.vitals, rr:v}}))}/>
        <VitalInput label="Temp" val={m.vitals?.t}   onChange={v=>setM(s=>({...s, vitals:{...s.vitals, t:v}}))}/>
        <VitalInput label="SpO₂" val={m.vitals?.sat} onChange={v=>setM(s=>({...s, vitals:{...s.vitals, sat:v}}))}/>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <TextArea label="S" val={m.soap?.S} onChange={v=>setM(s=>({...s, soap:{...s.soap, S:v}}))} rows={4}/>
        <TextArea label="O" val={m.soap?.O} onChange={v=>setM(s=>({...s, soap:{...s.soap, O:v}}))} rows={4}/>
        <TextArea label="A" val={m.soap?.A} onChange={v=>setM(s=>({...s, soap:{...s.soap, A:v}}))} rows={3}/>
        <TextArea label="P" val={m.soap?.P} onChange={v=>setM(s=>({...s, soap:{...s.soap, P:v}}))} rows={3}/>
      </div>

      {/* Attachments */}
      <div className="mt-4">
        <h3 className="font-semibold mb-2">ไฟล์แนบของโน้ตนี้</h3>
        <AttachmentManager
          items={m.attachments || []}
          onAdd={(arr)=> setM(v=>({ ...v, attachments:[...(v.attachments||[]), ...arr] }))}
          onRemove={(id)=> setM(v=>({ ...v, attachments:(v.attachments||[]).filter(x=>x.id!==id) }))}
        />
      </div>
    </div>
  );
}

/* ===== NoteCard ===== */
function NoteCard({ note, onUpdate, onRemove }){
  const [edit, setEdit] = useState(false);
  const [model, setModel] = useState(note);
  useEffect(()=>setModel(note), [note]);
  const save = ()=>{ onUpdate(model); setEdit(false); };

  return (
    <article className="rounded-2xl bg-white shadow p-4" style={{borderLeft:`4px solid ${note._patientColor || "#e5e7eb"}`}}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-neutral-600">{fmtDate(note.timestamp)}{note.author?` • ${note.author}`:""}</div>
        <div className="flex gap-2">
          {edit ? (
            <>
              <button onClick={save} className="px-3 py-2 rounded-xl bg-black text-white">บันทึก</button>
              <button onClick={()=>{ setModel(note); setEdit(false); }} className="px-3 py-2 rounded-xl bg-white border">ยกเลิก</button>
            </>
          ) : (
            <>
              <button onClick={()=>setEdit(true)} className="px-3 py-2 rounded-xl bg-white border">แก้ไข</button>
              <button onClick={onRemove} className="px-3 py-2 rounded-xl bg-white border">ลบ</button>
            </>
          )}
        </div>
      </div>

      {edit ? (
        <>
          <div className="grid md:grid-cols-5 gap-3 mb-3">
            <VitalInput label="BP"  val={model.vitals?.bp} onChange={v=>setModel(s=>({...s, vitals:{...s.vitals, bp:v}}))}/>
            <VitalInput label="HR"  val={model.vitals?.hr} onChange={v=>setModel(s=>({...s, vitals:{...s.vitals, hr:v}}))}/>
            <VitalInput label="RR"  val={model.vitals?.rr} onChange={v=>setModel(s=>({...s, vitals:{...s.vitals, rr:v}}))}/>
            <VitalInput label="Temp" val={model.vitals?.t}  onChange={v=>setModel(s=>({...s, vitals:{...s.vitals, t:v}}))}/>
            <VitalInput label="SpO₂" val={model.vitals?.sat} onChange={v=>setModel(s=>({...s, vitals:{...s.vitals, sat:v}}))}/>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <TextArea label="S" val={model.soap?.S} onChange={v=>setModel(s=>({...s, soap:{...s.soap, S:v}}))} rows={3}/>
            <TextArea label="O" val={model.soap?.O} onChange={v=>setModel(s=>({...s, soap:{...s.soap, O:v}}))} rows={3}/>
            <TextArea label="A" val={model.soap?.A} onChange={v=>setModel(s=>({...s, soap:{...s.soap, A:v}}))} rows={2}/>
            <TextArea label="P" val={model.soap?.P} onChange={v=>setModel(s=>({...s, soap:{...s.soap, P:v}}))} rows={2}/>
            <div className="md:col-span-2">
              <label className="text-xs text-neutral-500">ยา/แผน</label>
              <input value={model.meds||""} onChange={e=>setModel(s=>({...s, meds:e.target.value}))} className="w-full border rounded-xl px-3 py-2"/>
            </div>
            <div className="md:col-span-2 mt-2">
              <h4 className="font-semibold mb-2">ไฟล์แนบของโน้ตนี้</h4>
              <AttachmentManager
                items={model.attachments || []}
                onAdd={(arr)=> setModel(v=>({ ...v, attachments:[...(v.attachments||[]), ...arr] }))}
                onRemove={(id)=> setModel(v=>({ ...v, attachments:(v.attachments||[]).filter(x=>x.id!==id) }))}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="text-sm text-neutral-700 mb-2">
            <span className="mr-3">BP: {note.vitals?.bp||"-"}</span>
            <span className="mr-3">HR: {note.vitals?.hr||"-"}</span>
            <span className="mr-3">RR: {note.vitals?.rr||"-"}</span>
            <span className="mr-3">T: {note.vitals?.t||"-"}</span>
            <span>SpO₂: {note.vitals?.sat||"-"}</span>
          </div>
          <div className="text-sm whitespace-pre-wrap">
            <b>S:</b> {note.soap?.S||"-"}{"\n"}
            <b>O:</b> {note.soap?.O||"-"}{"\n"}
            <b>A:</b> {note.soap?.A||"-"}{"\n"}
            <b>P:</b> {note.soap?.P||"-"}
            {note.meds && <div className="mt-2"><b>ยา/แผน:</b> {note.meds}</div>}
          </div>

          {(note.attachments && note.attachments.length>0) && (
            <div className="mt-3">
              <div className="font-medium text-sm mb-1">ไฟล์แนบ</div>
              <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {note.attachments.map(it=>{
                  const isImg = (it.type||"").startsWith("image/");
                  return (
                    <li key={it.id} className="border rounded-xl p-3 bg-white">
                      <div className="text-xs font-medium truncate" title={it.name}>{it.name}</div>
                      <div className="text-[11px] text-neutral-500 mb-1">{it.type || "unknown"} • {formatBytes(it.size)}</div>
                      {isImg ? (
                        <a href={it.dataUrl} download={it.name} target="_blank" rel="noreferrer">
                          <img src={it.dataUrl} alt={it.name} className="w-full h-28 object-cover rounded-lg border" />
                        </a>
                      ) : (
                        <a href={it.dataUrl} download={it.name} className="inline-block px-2 py-1 rounded bg-neutral-100 border text-xs">
                          ดาวน์โหลด
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </article>
  );
}

/* ===== NotesViewer ===== */
function NotesViewer({ store, patients, onUpdateNote, onRemoveNote }){
  const [term, setTerm] = useState("");
  const [pid, setPid]   = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo]     = useState("");

  const rows = useMemo(()=>{
    const f = (n)=>{
      if(pid && n.patientId!==pid) return false;
      if(from && n.timestamp < new Date(from).toISOString()) return false;
      if(to){ const d=new Date(to); d.setDate(d.getDate()+1); if(n.timestamp >= d.toISOString()) return false; }
      if(!term) return true;
      const p = patients.find(x=>x.id===n.patientId);
      const hay = [
        n.author||"", n.meds||"",
        n.soap?.S||"", n.soap?.O||"", n.soap?.A||"", n.soap?.P||"",
        p?.name||"", p?.hn||""
      ].join(" ").toLowerCase();
      return hay.includes(term.toLowerCase());
    };
    return store.notes
      .map(n=>{
        const p = patients.find(x=>x.id===n.patientId);
        return {...n, _patientColor: p?.color || "#e5e7eb", _patientName:p?.name, _hn:p?.hn};
      })
      .filter(f)
      .sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
  }, [store.notes, term, pid, from, to, patients]);

  return (
    <div className="rounded-2xl bg-white shadow p-4">
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <input className="border rounded-xl px-3 py-2 flex-1 min-w-[160px]" placeholder="ค้นหา: SOAP/author/ชื่อ/HN"
               value={term} onChange={e=>setTerm(e.target.value)}/>
        <select className="border rounded-xl px-3 py-2" value={pid} onChange={e=>setPid(e.target.value)}>
          <option value="">ผู้ป่วยทั้งหมด</option>
          {patients.map(p=> <option key={p.id} value={p.id}>{p.name||"(ไม่มีชื่อ)"} — HN {p.hn||"-"}</option>)}
        </select>
        <div className="text-sm">จาก</div>
        <input type="date" className="border rounded-xl px-3 py-2" value={from} onChange={e=>setFrom(e.target.value)}/>
        <div className="text-sm">ถึง</div>
        <input type="date" className="border rounded-xl px-3 py-2" value={to} onChange={e=>setTo(e.target.value)}/>
        <button className="ml-auto px-3 py-2 rounded-xl bg-white border"
                onClick={()=>{ setTerm(""); setPid(""); setFrom(""); setTo(""); }}>ล้างตัวกรอง</button>
      </div>

      {rows.length===0 ? (
        <div className="text-sm text-neutral-600">ไม่พบ Progress note</div>
      ) : (
        <div className="space-y-3">
          {rows.map(n=>{
            return (
              <div key={n.id} className="border rounded-xl p-3" style={{borderLeft:`4px solid ${n._patientColor}`}}>
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <div className="text-sm font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full" style={{background:n._patientColor}}></span>
                      {n._patientName || "(ไม่มีชื่อ)"} • HN {n._hn || "-"}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {fmtDate(n.timestamp)}{n.author?` • ${n.author}`:""}
                  </div>
                </div>
                <div className="text-sm mt-1">
                  <span className="mr-3">BP: {n.vitals?.bp||"-"}</span>
                  <span className="mr-3">HR: {n.vitals?.hr||"-"}</span>
                  <span className="mr-3">RR: {n.vitals?.rr||"-"}</span>
                  <span className="mr-3">T: {n.vitals?.t||"-"}</span>
                  <span>SpO₂: {n.vitals?.sat||"-"}</span>
                </div>
                <div className="text-sm whitespace-pre-wrap mt-1">
                  <b>S:</b> {n.soap?.S||"-"}{"\n"}
                  <b>O:</b> {n.soap?.O||"-"}{"\n"}
                  <b>A:</b> {n.soap?.A||"-"}{"\n"}
                  <b>P:</b> {n.soap?.P||"-"}
                  {n.meds && <div className="mt-2"><b>ยา/แผน:</b> {n.meds}</div>}
                </div>

                {(n.attachments && n.attachments.length>0) && (
                  <div className="mt-2">
                    <div className="font-medium text-sm mb-1">ไฟล์แนบ</div>
                    <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {n.attachments.map(it=>{
                        const isImg = (it.type||"").startsWith("image/");
                        return (
                          <li key={it.id} className="border rounded-xl p-3 bg-white">
                            <div className="text-xs font-medium truncate" title={it.name}>{it.name}</div>
                            <div className="text-[11px] text-neutral-500 mb-1">{it.type || "unknown"} • {formatBytes(it.size)}</div>
                            {isImg ? (
                              <a href={it.dataUrl} download={it.name} target="_blank" rel="noreferrer">
                                <img src={it.dataUrl} alt={it.name} className="w-full h-24 object-cover rounded-lg border" />
                              </a>
                            ) : (
                              <a href={it.dataUrl} download={it.name} className="inline-block px-2 py-1 rounded bg-neutral-100 border text-xs">
                                ดาวน์โหลด
                              </a>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <div className="flex gap-2 mt-2">
                  <button className="px-2 py-1 rounded bg-white border"
                          onClick={()=>onRemoveNote(n.id)}>ลบ</button>
                  <button className="px-2 py-1 rounded bg-white border"
                          onClick={()=>onUpdateNote(n.id, { timestamp: new Date().toISOString() })}>อัปเดตเวลา</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  );
}

/* ===== AddNoteTab ===== */
function AddNoteTab({ patients, onAddNote }) {
  const [pid, setPid] = useState(patients[0]?.id || "");
  useEffect(()=>{ if(!patients.find(p=>p.id===pid)) setPid(patients[0]?.id || ""); }, [patients]);

  return (
    <div className="rounded-2xl bg-white shadow p-4">
      <div className="grid md:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-neutral-500">เลือกผู้ป่วยที่จะบันทึกโน้ต</label>
          <select
            className="w-full border rounded-xl px-3 py-2"
            value={pid}
            onChange={e=>setPid(e.target.value)}
          >
            {patients.length===0 && <option value="">(ยังไม่มีผู้ป่วย)</option>}
            {patients.map(p=>(
              <option key={p.id} value={p.id}>
                {(p.name||"(ไม่มีชื่อ)")} — HN {p.hn||"-"}
              </option>
            ))}
          </select>
        </div>
        {pid ? (
          <div className="text-xs text-neutral-500 self-end">
            บันทึกจะถูกผูกกับผู้ป่วยที่เลือกโดยอัตโนมัติ
          </div>
        ) : (
          <div className="text-xs text-red-600 self-end">
            เพิ่มผู้ป่วยก่อน (ไปแท็บ “ผู้ป่วย” แล้วกด + ผู้ป่วย)
          </div>
        )}
      </div>

      {pid ? (
        <NewNoteForm onAdd={(payload)=> onAddNote(pid, payload)} />
      ) : (
        <div className="rounded-xl border p-3 text-sm text-neutral-600 bg-neutral-50">
          ยังไม่มีผู้ป่วยในระบบ กรุณาไปที่แท็บ “ผู้ป่วย” แล้วกด “+ ผู้ป่วย” ก่อน
        </div>
      )}
    </div>
  );
}

/* ===== helpers for Group panel fetch ===== */
async function readJsonSafe(r) {
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await r.json();
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { _text: text }; }
}

/* ===== GroupSharePanel ===== */
function GroupSharePanel({ store, setStore, passphrase }) {
  const [gid, setGid] = useState(store.settings.group?.id || "");
  const [wkey, setWkey] = useState(store.settings.group?.writeKey || "");
  const saveToSettings = (g,w)=> setStore(s=>({...s, settings:{ ...s.settings, group:{ id:g, writeKey:w } }}));

  const api = (url, init={}) => fetch(url, { headers:{ "Content-Type":"application/json", ...(init.headers||{}) }, ...init });

  const mustEncrypt = ()=> {
    if(!store.settings.encryptionEnabled || !passphrase){
      alert("เพื่อความปลอดภัย กรุณาเปิดการเข้ารหัส (AES) และตั้งรหัสผ่านเดียวกันในทุกเครื่อง ก่อนใช้งาน Group Sync");
      return false;
    }
    return true;
  };

  const onCreate = async ()=>{
    const r = await api("/api/group", { method:"POST", body: JSON.stringify({}) });
    const j = await readJsonSafe(r);
    if(!r.ok){ alert("สร้างกลุ่มไม่สำเร็จ: " + (j?.error || r.status)); return; }
    setGid(j.id); setWkey(j.writeKey);
    saveToSettings(j.id, j.writeKey);
    await navigator.clipboard?.writeText(`${location.origin}${location.pathname}#group=${j.id}`);
    alert(`สร้างกลุ่มแล้ว\nGroup ID: ${j.id}\nWrite key: ${j.writeKey}\nลิงก์ถูกคัดลอกไปคลิปบอร์ด`);
  };

  const onPush = async ()=>{
    if(!mustEncrypt()) return;
    if(!gid || !wkey){ alert("กรอก Group ID และ Write key ก่อน"); return; }
    const payload = encryptJSON(JSON.stringify(store), passphrase);
    const r = await api(`/api/group?id=${encodeURIComponent(gid)}`, {
      method:"PUT",
      headers:{ "x-write-key": wkey },
      body: JSON.stringify({ version:1, payload })
    });
    const j = await readJsonSafe(r);
    if(!r.ok){ alert("อัปเดตกลุ่มไม่สำเร็จ: " + (j?.error || r.status)); return; }
    alert("อัปเดตข้อมูลขึ้นกลุ่มเรียบร้อย");
  };

  const onPull = async ()=>{
    if(!gid){ alert("กรอก Group ID ก่อน"); return; }
    const r = await api(`/api/group?id=${encodeURIComponent(gid)}`, { method:"GET" });
    const j = await readJsonSafe(r);
    if(!r.ok){ alert("ดึงข้อมูลไม่สำเร็จ: " + (j?.error || r.status)); return; }
    const enc = j?.payload;
    if(enc?.enc){
      if(!passphrase){ alert("ต้องมีรหัสผ่านเพื่อถอดรหัส"); return; }
      const dec = decryptJSON(enc, passphrase);
      if(!dec){ alert("ถอดรหัสไม่สำเร็จ (รหัสผ่านไม่ตรง)"); return; }
      const data = safeParse(dec);
      if(!data?.patients || !data?.notes){ alert("โครงสร้างข้อมูลไม่ถูกต้อง"); return; }
      setStore(data);
      alert("ดึงข้อมูลกลุ่มและถอดรหัสสำเร็จ");
    }else{
      if(!confirm("ข้อมูลกลุ่มนี้ไม่ได้เข้ารหัส จะเขียนทับข้อมูลในเครื่องนี้ทันที ต้องการดำเนินการต่อหรือไม่?")) return;
      setStore(j?.payload);
      alert("ดึงข้อมูลกลุ่มสำเร็จ");
    }
  };

  return (
    <details className="ml-2">
      <summary className="px-3 py-2 rounded-xl bg-white border cursor-pointer">👥 กลุ่ม</summary>
      <div className="absolute right-4 mt-2 w-[min(96vw,28rem)] p-4 bg-white rounded-2xl shadow-xl border space-y-3">
        <div className="text-sm text-neutral-700">
          แชร์ข้อมูลข้ามอุปกรณ์/ทีมด้วย Group ID (แนะนำเปิดเข้ารหัส AES + ใช้รหัสผ่านเดียวกัน)
        </div>
        <div className="grid grid-cols-1 gap-2">
          <div>
            <label className="text-xs text-neutral-500">Group ID</label>
            <input className="w-full border rounded-xl px-3 py-2" value={gid} onChange={e=>setGid(e.target.value)}/>
          </div>
          <div>
            <label className="text-xs text-neutral-500">Write key (สำหรับ Push)</label>
            <input className="w-full border rounded-xl px-3 py-2" value={wkey} onChange={e=>setWkey(e.target.value)}/>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onCreate} className="px-3 py-2 rounded-xl bg-black text-white">สร้างกลุ่ม</button>
          <button onClick={()=>{ saveToSettings(gid, wkey); alert("บันทึกค่า Group แล้ว"); }} className="px-3 py-2 rounded-xl bg-white border">บันทึก Group</button>
          <button onClick={onPull} className="px-3 py-2 rounded-xl bg-white border">ดึง (Pull)</button>
          <button onClick={onPush} className="px-3 py-2 rounded-xl bg-white border">อัปเดต (Push)</button>
        </div>
        <div className="text-[11px] text-neutral-500">
          * ข้อมูลถูกเก็บที่ Netlify Blobs ของโปรเจ็กต์คุณ — ควรเข้ารหัสก่อนใช้งานจริง
        </div>
      </div>
    </details>
  );
}

/* ===== Mobile bottom tab bar ===== */
function MobileTabBar({ tab, setTab }){
  return (
    <nav className="fixed md:hidden bottom-0 inset-x-0 border-t bg-white z-20" style={{paddingBottom: "env(safe-area-inset-bottom)"}}>
      <div className="grid grid-cols-3">
        {[
          {k:"patient", label:"ผู้ป่วย"},
          {k:"add",     label:"เพิ่มโน้ต"},
          {k:"notes",   label:"ดูโน้ต"},
        ].map(it=>(
          <button key={it.k}
            onClick={()=>setTab(it.k)}
            className={`py-3 text-sm ${tab===it.k ? "font-semibold" : "text-neutral-600"}`}>
            {it.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

/* ===== App (main) ===== */
function App(){
  const [passphrase, setPassphrase] = useState("");
  const [tmpPass, setTmpPass] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [badPass, setBadPass] = useState(false);

  const [store, setStore] = useState({ patients:[], notes:[], settings:{ encryptionEnabled:false, group:{ id:"", writeKey:"" } } });
  const [selectedId, setSelectedId] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("patient"); // "patient" | "notes" | "add"

  // first load
  useEffect(()=>{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return;
    const parsed = safeParse(raw);
    if(parsed?.enc){ setIsLocked(true); }
    else{
      const data = Storage.load();
      setStore(data);
      if(data.patients[0]) setSelectedId(data.patients[0].id);
    }
  }, []);

  // import via URL fragment
  useEffect(()=>{
    if(location.hash.startsWith("#shared=")){
      try{
        const enc = decodeURIComponent(location.hash.replace("#shared=",""));
        const json = decompressFromEncodedURIComponent(enc);
        const obj = safeParse(json);
        if(obj?.patients && obj?.notes){
          if(confirm("นำเข้าข้อมูลจาก URL นี้หรือไม่? (อย่าใช้กับข้อมูลจริง)")){
            setStore(obj); Storage.save(obj, passphrase, store.settings.encryptionEnabled); alert("นำเข้าข้อมูลสำเร็จ"); location.hash="";
          }
        }
      }catch{}
    }
    if(location.hash.startsWith("#group=")){
      const gid = location.hash.replace("#group=","");
      if(gid){
        setStore(s=>({...s, settings:{...s.settings, group:{ id: gid, writeKey: s.settings.group.writeKey }}}));
        alert(`ตั้งค่า Group ID = ${gid}`);
      }
    }
  }, []);

  // persist
  useEffect(()=>{ Storage.save(store, passphrase, store.settings.encryptionEnabled); }, [store, passphrase]);

  const patients = useMemo(()=>{
    const t = q.trim().toLowerCase();
    if(!t) return store.patients;
    return store.patients.filter(p=> 
      (p.name||"").toLowerCase().includes(t) ||
      (p.hn||"").toLowerCase().includes(t) ||
      (p.tags||[]).some(x=>(x||"").toLowerCase().includes(t)) ||
      (p.cc||"").toLowerCase().includes(t) ||
      (p.ud||"").toLowerCase().includes(t)
    );
  }, [store.patients, q]);

  const selectedPatient = useMemo(()=> store.patients.find(p=>p.id===selectedId) || null, [store.patients, selectedId]);
  const patientNotes    = useMemo(()=> store.notes.filter(n=>n.patientId===selectedId).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)), [store.notes, selectedId]);

  // CRUD
  const addPatient = (partial)=>{
    const id = uid();
    const patient = {
      id, hn:"", name:"", sex:"", dob:"", tags:[],
      color:"#22c55e",
      cc:"", ud:"",
      hx:{ hpi:"", pmh:"", meds:"", allergy:"", surg:"", family:"", social:"", gynObs:"", menstrual:"", sexual:"", immun:"", travel:"" },
      attachments: [],
      ...partial
    };
    setStore(s=>({...s, patients:[patient, ...s.patients]}));
    setSelectedId(id);
  };
  const updatePatient = (id, patch)=> setStore(s=>({...s, patients:s.patients.map(p=>p.id===id?{...p, ...patch}:p)}));
  const removePatient = (id)=>{ if(!confirm("ลบผู้ป่วยคนนี้และโน้ตทั้งหมดหรือไม่?")) return; setStore(s=>({...s, patients:s.patients.filter(p=>p.id!==id), notes:s.notes.filter(n=>n.patientId!==id)})); setSelectedId(""); };
  const addNote = (patientId, payload)=>{ const note = { id: uid(), ...payload, patientId, timestamp: nowISO() }; setStore(s=>({...s, notes:[note, ...s.notes]})); };
  const updateNote = (id, patch)=> setStore(s=>({...s, notes:s.notes.map(n=>n.id===id?{...n, ...patch}:n)}));
  const removeNote = (id)=>{ if(!confirm("ลบ progress note นี้หรือไม่?")) return; setStore(s=>({...s, notes:s.notes.filter(n=>n.id!==id)})); };

  const wipeAll = ()=>{ if(!confirm("ลบข้อมูลทั้งหมดในเครื่องนี้หรือไม่?")) return; Storage.clear(); setStore({ patients:[], notes:[], settings:{ encryptionEnabled:false, group:{ id:"", writeKey:"" } } }); setSelectedId(""); setPassphrase(""); setIsLocked(false); setBadPass(false); };
  const handleUnlock = ()=>{ const loaded = Storage.load(tmpPass); if(loaded==="BAD_PASS"||loaded==="LOCKED"){ setBadPass(true); return; } setBadPass(false); setPassphrase(tmpPass); setStore(loaded); setIsLocked(false); if(loaded.patients[0]) setSelectedId(loaded.patients[0].id); };
  const toggleEnc = (on)=> setStore(s=>({...s, settings:{...s.settings, encryptionEnabled:on}}));

  if(isLocked){
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100 p-6">
        <div className="w-full max-w-md rounded-2xl bg-white shadow p-6">
          <h1 className="text-2xl font-bold mb-2">🔒 ปลดล็อกข้อมูลในเครื่องนี้</h1>
          <p className="text-sm text-neutral-600 mb-4">ข้อมูลถูกเข้ารหัสไว้ในเครื่องนี้ กรอกรหัสผ่านเพื่อปลดล็อก</p>
          <input type="password" className="w-full border rounded-xl px-3 py-2 mb-3" placeholder="รหัสผ่าน" value={tmpPass} onChange={e=>setTmpPass(e.target.value)} />
          {badPass && <p className="text-red-600 text-sm mb-2">รหัสผ่านไม่ถูกต้อง</p>}
          <div className="flex gap-2">
            <button onClick={handleUnlock} className="px-4 py-2 rounded-xl bg-black text-white">ปลดล็อก</button>
            <button onClick={wipeAll} className="px-4 py-2 rounded-xl bg-neutral-200">ล้างข้อมูลทั้งหมด</button>
          </div>
          <p className="text-xs text-neutral-500 mt-4">เวอร์ชันแอป {APP_VERSION}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="[color-scheme:light] min-h-screen bg-neutral-50 pb-20">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <h1 className="text-lg md:text-2xl font-bold truncate">🗒️ Progress Notes (Local-first)</h1>

          <div className="ml-auto flex items-center gap-2">
            {tab==="patient" && (
              <button onClick={()=>addPatient({ name:"คนไข้ใหม่" })} className="px-3 py-2 rounded-xl bg-black text-white">+ ผู้ป่วย</button>
            )}
            <button onClick={()=>{
              const payload = store.settings.encryptionEnabled && passphrase
                ? encryptJSON(stringify(store), passphrase)
                : { type:"pn_export", version:1, createdAt:nowISO(), data:store };
              const blob = new Blob([JSON.stringify(payload,null,2)], { type:"application/json" });
              const name = `patient-notes-${store.settings.encryptionEnabled && passphrase ? "enc-" : ""}${new Date().toISOString().split("T")[0]}.json`;
              const url = URL.createObjectURL(blob); const a=document.createElement("a");
              a.href = url; a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
            }} className="hidden sm:inline-flex px-3 py-2 rounded-xl bg-white border">Export</button>

            <label className="hidden sm:inline-flex px-3 py-2 rounded-xl bg-white border cursor-pointer">Import
              <input type="file" accept="application/json" className="hidden"
                onChange={e=>{
                  const f=e.target.files?.[0]; if(!f) return;
                  const r=new FileReader(); r.onload=()=>{
                    try{
                      const obj = safeParse(String(r.result)); if(!obj) throw 0;
                      if(obj.enc){
                        if(!passphrase){ alert("ไฟล์ถูกเข้ารหัส — ตั้งรหัสก่อน"); return; }
                        const json = decryptJSON(obj, passphrase); if(!json){ alert("รหัสผ่านไม่ถูกต้อง"); return; }
                        const dec = safeParse(json); if(!dec?.patients||!dec?.notes) throw 0;
                        setStore(dec); alert("นำเข้าสำเร็จ (ถอดรหัส)");
                      }else{
                        const data = obj.data ?? obj; if(!data?.patients||!data?.notes) throw 0;
                        setStore(data); alert("นำเข้าสำเร็จ");
                      }
                    }catch{ alert("ไฟล์ไม่ถูกต้อง"); }
                  }; r.readAsText(f); e.currentTarget.value="";
                }}
              />
            </label>

            <GroupSharePanel store={store} setStore={setStore} passphrase={passphrase} />

            {/* Security */}
            <details className="ml-2">
              <summary className="px-3 py-2 rounded-xl bg-white border cursor-pointer">⚙️ ตั้งค่า</summary>
              <div className="absolute right-4 mt-2 w-[min(96vw,20rem)] p-4 bg-white rounded-2xl shadow-xl border space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={store.settings.encryptionEnabled} onChange={e=>toggleEnc(e.target.checked)} />
                  เข้ารหัสข้อมูลในเครื่อง (AES)
                </label>
                <input type="password" className="w-full border rounded-xl px-3 py-2 text-sm"
                  placeholder={passphrase? "เปลี่ยนรหัสผ่าน":"ตั้งรหัสผ่าน"} value={passphrase} onChange={e=>setPassphrase(e.target.value)} />
                <button onClick={wipeAll} className="px-3 py-2 rounded-xl bg-red-600 text-white w-full">ล้างข้อมูลทั้งหมด</button>
              </div>
            </details>
          </div>
        </div>
      </header>

      {/* Tabs (desktop) */}
      <div className="max-w-6xl mx-auto px-4 pt-4 hidden md:block">
        <div className="flex gap-2 mb-3">
          <button onClick={()=>setTab("patient")} className={`px-3 py-2 rounded-xl border ${tab==="patient"?"bg-black text-white border-black":"bg-white"}`}>ผู้ป่วย</button>
          <button onClick={()=>setTab("notes")}   className={`px-3 py-2 rounded-xl border ${tab==="notes"  ?"bg-black text-white border-black":"bg-white"}`}>ดู Progress notes</button>
          <button onClick={()=>setTab("add")}     className={`px-3 py-2 rounded-xl border ${tab==="add"    ?"bg-black text-white border-black":"bg-white"}`}>เพิ่ม Progress note</button>
        </div>
      </div>

      <main className="max-w-6xl mx-auto grid md:grid-cols-12 gap-4 px-2 sm:px-4 pb-8">

        {/* Sidebar */}
        <aside className={`${tab==="patient" ? "block" : "hidden"} md:col-span-4 lg:col-span-3`}>
          <div className="rounded-2xl bg-white shadow p-3">
            <input
              value={q}
              onChange={e=>setQ(e.target.value)}
              placeholder="ค้นหา: ชื่อ / HN / tag / CC / U/D"
              className="w-full border rounded-xl px-3 py-2 mb-2"
            />
            <ul className="max-h-[calc(100vh-240px)] md:max-h-[70vh] overflow-auto pr-1 space-y-1">
              {patients.map(p=>(
                <li key={p.id}>
                  <button
                    onClick={()=>setSelectedId(p.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl border ${selectedId===p.id?"bg-black text-white border-black":"bg-white"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium inline-flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full" style={{background:p.color || "#22c55e"}}></span>
                        {p.name || "(ไม่มีชื่อ)"}
                      </span>
                      <span className="text-xs opacity-70">HN: {p.hn || "-"}</span>
                    </div>
                    <div className="text-xs opacity-70">
                      {(p.tags || []).map(t=>`#${t}`).join(" ")}
                    </div>
                    {(p.cc || p.ud) && (
                      <div className="text-xs opacity-70 mt-0.5">
                        {p.cc ? `CC: ${p.cc}` : ""} {p.ud ? `• U/D: ${p.ud}` : ""}
                      </div>
                    )}
                  </button>
                </li>
              ))}
              {patients.length === 0 && (
                <p className="text-sm text-neutral-500 p-2">ยังไม่มีข้อมูลผู้ป่วย</p>
              )}
            </ul>
          </div>
        </aside>

        {/* Patient tab */}
        <section className={`${tab==="patient" ? "block" : "hidden"} md:col-span-8 lg:col-span-9 space-y-4`}>
          <div className="rounded-2xl bg-white shadow p-4">
            {selectedPatient ? (
              <PatientEditor
                patient={selectedPatient}
                onChange={patch => updatePatient(selectedPatient.id, patch)}
                onRemove={() => removePatient(selectedPatient.id)}
              />
            ) : (
              <div className="text-neutral-600">เลือกผู้ป่วยจากรายการด้านซ้ายหรือกด “+ ผู้ป่วย”</div>
            )}
          </div>

          {selectedPatient && (
            <div className="space-y-3">
              {patientNotes.map(n => (
                <NoteCard
                  key={n.id}
                  note={{...n, _patientColor:selectedPatient?.color}}
                  onUpdate={(patch) => updateNote(n.id, patch)}
                  onRemove={() => removeNote(n.id)}
                />
              ))}
              {patientNotes.length === 0 && (
                <div className="rounded-2xl bg-white shadow p-4 text-sm text-neutral-600">
                  ยังไม่มี progress note
                </div>
              )}
            </div>
          )}
        </section>

        {/* Notes tab */}
        <section className={`${tab==="notes" ? "block" : "hidden"} md:col-span-12`}>
          <NotesViewer
            store={store}
            patients={store.patients}
            onUpdateNote={(id, patch)=>updateNote(id, patch)}
            onRemoveNote={(id)=>removeNote(id)}
          />
        </section>

        {/* Add note tab */}
        <section className={`${tab==="add" ? "block" : "hidden"} md:col-span-12`}>
          <AddNoteTab
            patients={store.patients}
            onAddNote={(patientId, payload)=> addNote(patientId, payload)}
          />
        </section>

      </main>

      <MobileTabBar tab={tab} setTab={setTab} />

      <footer className="max-w-6xl mx-auto px-2 sm:px-4 pb-24 md:pb-8 text-xs text-neutral-500">
        <p>⚠️ ข้อมูลเก็บบน <b>อุปกรณ์ของคุณ</b> (localStorage). เปิดเข้ารหัสก่อนใช้ข้อมูลจริง และปฏิบัติตาม PDPA/นโยบายหน่วยงาน</p>
        <p className="mt-1">เวอร์ชัน {APP_VERSION} • ไม่มีเซิร์ฟเวอร์ • รองรับมือถือ/แท็บเล็ต/แล็ปท็อป</p>
      </footer>
    </div>
  );
}

/* mount */
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
