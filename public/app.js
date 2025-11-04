
const { useState, useEffect, useMemo } = React;
const LS_KEY = "patientNotes.v5";
const APP_VERSION = "2.2.0-merge-share";

// Utils
const nowISO = () => new Date().toISOString();
const fmt = (iso) => new Date(iso).toLocaleString();
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const jp = (o) => JSON.stringify(o);
const parse = (s)=>{try{return JSON.parse(s)}catch{return null}};

// Minimal AES (optional local encryption)
function aesEncrypt(s, pass) {
  const salt = CryptoJS.lib.WordArray.random(16);
  const iv   = CryptoJS.lib.WordArray.random(16);
  const key  = CryptoJS.PBKDF2(pass, salt, { keySize: 256/32, iterations: 1000 });
  const enc  = CryptoJS.AES.encrypt(s, key, { iv });
  return { enc:true, v:1, salt: CryptoJS.enc.Base64.stringify(salt), iv: CryptoJS.enc.Base64.stringify(iv), data: enc.toString() };
}
function aesDecrypt(p, pass) {
  try {
    const salt = CryptoJS.enc.Base64.parse(p.salt);
    const iv   = CryptoJS.enc.Base64.parse(p.iv);
    const key  = CryptoJS.PBKDF2(pass, salt, { keySize: 256/32, iterations: 1000 });
    return CryptoJS.AES.decrypt(p.data, key, { iv }).toString(CryptoJS.enc.Utf8) || null;
  } catch { return null; }
}

// Local store
const defaults = () => ({
  patients: [], notes: [],
  settings: { encryptionEnabled:false, group:{ id:"", pass:"" } }
});

// Merge helper — no overwrite; resolve by updatedAt/timestamp
function mergeState(local, incoming){
  const out = JSON.parse(JSON.stringify(local||defaults()));

  const pMap = new Map(out.patients.map(p=>[p.id,p]));
  let newPatients=0, updatedPatients=0;
  for(const p of (incoming.patients||[])){
    const ex = pMap.get(p.id);
    if(!ex){ pMap.set(p.id,p); newPatients++; }
    else{
      const lu = Date.parse(ex.updatedAt||ex.createdAt||0) || 0;
      const ru = Date.parse(p.updatedAt||p.createdAt||0) || 0;
      if(ru>lu){ pMap.set(p.id,{...ex,...p}); updatedPatients++; }
    }
  }
  out.patients = Array.from(pMap.values());

  const nMap = new Map(out.notes.map(n=>[n.id,n]));
  let newNotes=0, updatedNotes=0;
  for(const n of (incoming.notes||[])){
    const ex = nMap.get(n.id);
    if(!ex){ nMap.set(n.id,n); newNotes++; }
    else{
      const lt = Date.parse(ex.timestamp||0) || 0;
      const rt = Date.parse(n.timestamp||0) || 0;
      if(rt>lt){ nMap.set(n.id,{...ex,...n}); updatedNotes++; }
    }
  }
  out.notes = Array.from(nMap.values());
  return { merged: out, stats: { newPatients, updatedPatients, newNotes, updatedNotes } };
}

const Storage = {
  load(pass){
    const raw = localStorage.getItem(LS_KEY); if(!raw) return defaults();
    const obj = parse(raw);
    if(obj?.enc){
      if(!pass) return "LOCKED";
      const s = aesDecrypt(obj, pass); if(!s) return "BAD_PASS";
      const j = parse(s) || defaults(); if(!j.settings?.group) j.settings={...(j.settings||{}),group:{id:"",pass:""}}; return j;
    }
    if(!obj.settings?.group) obj.settings={...(obj.settings||{}),group:{id:"",pass:""}};
    return obj;
  },
  save(state, pass, encOn){
    if(encOn && pass){
      localStorage.setItem(LS_KEY, jp(aesEncrypt(jp(state), pass)));
    }else{
      localStorage.setItem(LS_KEY, jp(state));
    }
  },
  clear(){ localStorage.removeItem(LS_KEY); }
};

// Small UI atoms
const Input = (p)=>(<input {...p} className={"w-full border rounded-xl px-3 py-2 "+(p.className||"")} />);
const TA    = (p)=>(<textarea {...p} className={"w-full border rounded-xl px-3 py-2 "+(p.className||"")} />);

async function fileToDataUrl(file){return await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result));r.onerror=rej;r.readAsDataURL(file);});}
const fmtBytes=(b)=>{const u=["B","KB","MB"];let i=0,n=b;while(n>=1024&&i<u.length-1){n/=1024;i++}return `${n.toFixed(n<10&&i>0?1:0)} ${u[i]}`};

function AttachmentManager({items,onAdd,onRemove}){
  return (
    <div className="space-y-2">
      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border cursor-pointer">
        📎 แนบไฟล์
        <input type="file" className="hidden" multiple onChange={async e=>{
          const files=[...(e.target.files||[])]; const arr=[];
          for(const f of files){ const dataUrl=await fileToDataUrl(f); arr.push({id:uid(),name:f.name,size:f.size,type:f.type||"",dataUrl}); }
          if(arr.length) onAdd(arr); e.target.value="";
        }}/>
      </label>
      {(!items||items.length===0)?<div className="text-sm text-neutral-500">ยังไม่มีไฟล์</div>:
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(it=>(
            <li key={it.id} className="border rounded-xl p-3 bg-white">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium truncate" title={it.name}>{it.name}</div>
                <button onClick={()=>onRemove(it.id)} className="px-2 py-1 border rounded text-xs">ลบ</button>
              </div>
              <div className="text-xs text-neutral-500 mb-1">{it.type||"file"} • {fmtBytes(it.size||0)}</div>
              {(it.type||"").startsWith("image/")
                ? <a href={it.dataUrl} download={it.name} target="_blank" rel="noreferrer"><img src={it.dataUrl} className="w-full h-28 object-cover border rounded"/></a>
                : <a href={it.dataUrl} download={it.name} className="inline-block px-2 py-1 border rounded text-xs bg-neutral-50">ดาวน์โหลด</a>}
            </li>
          ))}
        </ul>
      }
    </div>
  );
}

// ---- API helper with fallback + non-throwing result {ok,status,body} ----
async function api(url, init = {}) {
  const doFetch = (u) =>
    fetch(u, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    });
  let res = await doFetch(url);
  if ((res.status === 404 || res.status === 502) && url.startsWith("/api/")) {
    const alt = "/.netlify/functions/" + url.replace(/^\/api\//, "");
    res = await doFetch(alt);
  }
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { _raw: text }; }
  return { ok: res.ok, status: res.status, body };
}
// ----------------------------------------------------------------------

function PatientEditor({ patient, onChange, onRemove }){
  const withDef = (p)=>({
    color:"#22c55e", cc:"", ud:"",
    hx:{ hpi:"", pmh:"", meds:"", allergy:"", surg:"", family:"", social:"", gynObs:"", menstrual:"", sexual:"", immun:"", travel:"" },
    attachments: [], ...p
  });
  const [m,setM]=useState(withDef(patient));
  useEffect(()=>setM(withDef(patient)),[patient]);
  useEffect(()=>{const t=setTimeout(()=>onChange(m),200); return ()=>clearTimeout(t);},[m]);

  const set=(patch)=>setM(v=>({...v,...patch, updatedAt: nowISO()}));
  const setHx=(k,val)=>setM(v=>({...v,updatedAt: nowISO(),hx:{...v.hx,[k]:val}}));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-lg">ข้อมูลผู้ป่วย</h2>
        <button onClick={onRemove} className="px-3 py-2 border rounded-xl bg-white">ลบผู้ป่วย</button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div><label className="text-xs text-neutral-500">ชื่อ-สกุล</label><Input value={m.name||""} onChange={e=>set({name:e.target.value})}/></div>
        <div><label className="text-xs text-neutral-500">HN</label><Input value={m.hn||""} onChange={e=>set({hn:e.target.value})}/></div>
        <div><label className="text-xs text-neutral-500">เพศ</label>
          <select value={m.sex||""} onChange={e=>set({sex:e.target.value})} className="w-full border rounded-xl px-3 py-2">
            <option value="">-</option><option value="M">ชาย</option><option value="F">หญิง</option><option value="Other">อื่น ๆ</option>
          </select>
        </div>
        <div><label className="text-xs text-neutral-500">วันเกิด</label><Input type="date" value={m.dob||""} onChange={e=>set({dob:e.target.value})}/></div>
        <div><label className="text-xs text-neutral-500">สีผู้ป่วย</label>
          <div className="flex items-center gap-2">
            <input type="color" value={m.color} onChange={e=>set({color:e.target.value})} className="h-10 w-12 p-0 border rounded"/>
            <Input value={m.color} onChange={e=>set({color:e.target.value})}/>
          </div>
        </div>
        <div className="md:col-span-2"><label className="text-xs text-neutral-500">Tags (คั่นด้วยช่องว่าง)</label>
          <Input value={(m.tags||[]).join(" ")} onChange={e=>set({tags:e.target.value.trim()?e.target.value.trim().split(/\s+/):[]})}/></div>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mt-4">
        <div><label className="text-xs text-neutral-500">CC</label><Input value={m.cc||""} onChange={e=>set({cc:e.target.value})}/></div>
        <div><label className="text-xs text-neutral-500">U/D</label><Input value={m.ud||""} onChange={e=>set({ud:e.target.value})}/></div>
      </div>

      <div className="mt-4">
        <h3 className="font-semibold mb-2">ประวัติ</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div><label className="text-xs text-neutral-500">HPI</label><TA rows={4} value={m.hx.hpi} onChange={e=>setHx("hpi",e.target.value)}/></div>
          <div><label className="text-xs text-neutral-500">PMH</label><TA rows={4} value={m.hx.pmh} onChange={e=>setHx("pmh",e.target.value)}/></div>
          <div><label className="text-xs text-neutral-500">ยาประจำ</label><TA rows={3} value={m.hx.meds} onChange={e=>setHx("meds",e.target.value)}/></div>
          <div><label className="text-xs text-neutral-500">แพ้ยา/อาหาร</label><TA rows={3} value={m.hx.allergy} onChange={e=>setHx("allergy",e.target.value)}/></div>
          <div><label className="text-xs text-neutral-500">ผ่าตัด/หัตถการ</label><TA rows={3} value={m.hx.surg} onChange={e=>setHx("surg",e.target.value)}/></div>
          <div><label className="text-xs text-neutral-500">ครอบครัว</label><TA rows={3} value={m.hx.family} onChange={e=>setHx("family",e.target.value)}/></div>
          <div><label className="text-xs text-neutral-500">สังคม/อาชีพ/บุหรี่/แอลกอฮอล์</label><TA rows={3} value={m.hx.social} onChange={e=>setHx("social",e.target.value)}/></div>
          <div><label className="text-xs text-neutral-500">วัคซีน</label><TA rows={3} value={m.hx.immun} onChange={e=>setHx("immun",e.target.value)}/></div>
          <div><label className="text-xs text-neutral-500">Gyn/Obs</label><TA rows={3} value={m.hx.gynObs} onChange={e=>setHx("gynObs",e.target.value)}/></div>
          <div><label className="text-xs text-neutral-500">Menstrual</label><TA rows={3} value={m.hx.menstrual} onChange={e=>setHx("menstrual",e.target.value)}/></div>
          <div><label className="text-xs text-neutral-500">Sexual</label><TA rows={3} value={m.hx.sexual} onChange={e=>setHx("sexual",e.target.value)}/></div>
          <div><label className="text-xs text-neutral-500">Travel/Exposure</label><TA rows={3} value={m.hx.travel} onChange={e=>setHx("travel",e.target.value)}/></div>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="font-semibold mb-2">ไฟล์แนบของผู้ป่วย</h3>
        <AttachmentManager items={m.attachments}
          onAdd={(arr)=>set({attachments:[...(m.attachments||[]),...arr]})}
          onRemove={(id)=>set({attachments:(m.attachments||[]).filter(x=>x.id!==id)})}/>
      </div>
    </div>
  );
}

function NewNoteForm({ onAdd }){
  const [m,setM]=useState({ timestamp: nowISO(), author:"", vitals:{}, soap:{S:"",O:"",A:"",P:""}, meds:"", attachments:[] });
  const toLocal=(iso)=>{const d=new Date(iso),p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`};
  return (
    <div>
      <div className="grid md:grid-cols-3 gap-3 mb-3">
        <div><label className="text-xs text-neutral-500">ผู้บันทึก</label><Input value={m.author} onChange={e=>setM(v=>({...v,author:e.target.value}))}/></div>
        <div><label className="text-xs text-neutral-500">วันเวลา</label><Input type="datetime-local" value={toLocal(m.timestamp)} onChange={e=>setM(v=>({...v,timestamp:new Date(e.target.value).toISOString()}))}/></div>
        <div><label className="text-xs text-neutral-500">ยา/แผน</label><Input value={m.meds} onChange={e=>setM(v=>({...v,meds:e.target.value}))}/></div>
      </div>
      <div className="grid md:grid-cols-5 gap-3 mb-3">
        {["bp","hr","rr","t","sat"].map(k=>(<div key={k}><label className="text-xs text-neutral-500">{k.toUpperCase()}</label><Input value={m.vitals[k]||""} onChange={e=>setM(v=>({...v,vitals:{...v.vitals,[k]:e.target.value}}))}/></div>))}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {["S","O","A","P"].map(k=>(<div key={k}><label className="text-xs text-neutral-500">{k}</label><TA rows={k==="S"||k==="O"?4:3} value={m.soap[k]||""} onChange={e=>setM(v=>({...v,soap:{...v.soap,[k]:e.target.value}}))}/></div>))}
      </div>
      <div className="mt-4">
        <h3 className="font-semibold mb-2">ไฟล์แนบของโน้ตนี้</h3>
        <AttachmentManager items={m.attachments}
          onAdd={(arr)=>setM(v=>({...v,attachments:[...(v.attachments||[]),...arr]}))}
          onRemove={(id)=>setM(v=>({...v,attachments:(v.attachments||[]).filter(x=>x.id!==id)}))}/>
      </div>
      <div className="mt-3">
        <button className="px-3 py-2 rounded-xl bg-black text-white" onClick={()=>onAdd({...m, timestamp: nowISO(), updatedAt: nowISO()})}>บันทึก</button>
      </div>
    </div>
  );
}

function NoteRow({ note, patient, onEdit, onDelete }){
  return (
    <div className="border rounded-xl p-3 bg-white" style={{borderLeft:`4px solid ${patient?.color||"#e5e7eb"}`}}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full" style={{background:patient?.color||"#e5e7eb"}}></span>
            {patient?.name||"(ไม่มีชื่อ)"} • HN {patient?.hn||"-"}
          </span>
        </div>
        <div className="text-xs text-neutral-500">{fmt(note.timestamp)}{note.author?` • ${note.author}`:""}</div>
      </div>
      <div className="text-sm mt-1">
        <span className="mr-3">BP: {note.vitals?.bp||"-"}</span>
        <span className="mr-3">HR: {note.vitals?.hr||"-"}</span>
        <span className="mr-3">RR: {note.vitals?.rr||"-"}</span>
        <span className="mr-3">T: {note.vitals?.t||"-"}</span>
        <span>SpO₂: {note.vitals?.sat||"-"}</span>
      </div>
      <div className="text-sm whitespace-pre-wrap mt-1">
        <b>S:</b> {note.soap?.S||"-"}{"\n"}
        <b>O:</b> {note.soap?.O||"-"}{"\n"}
        <b>A:</b> {note.soap?.A||"-"}{"\n"}
        <b>P:</b> {note.soap?.P||"-"}
        {note.meds && <div className="mt-2"><b>ยา/แผน:</b> {note.meds}</div>}
      </div>
      {(note.attachments && note.attachments.length>0) && (
        <div className="mt-2">
          <div className="font-medium text-sm mb-1">ไฟล์แนบ</div>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {note.attachments.map(it=>{
              const isImg=(it.type||"").startsWith("image/");
              return (
                <li key={it.id} className="border rounded-xl p-3 bg-white">
                  <div className="text-xs font-medium truncate" title={it.name}>{it.name}</div>
                  <div className="text-[11px] text-neutral-500 mb-1">{it.type||"unknown"} • {fmtBytes(it.size||0)}</div>
                  {isImg ? <a href={it.dataUrl} download={it.name} target="_blank" rel="noreferrer"><img src={it.dataUrl} className="w-full h-24 object-cover border rounded"/></a> :
                    <a href={it.dataUrl} download={it.name} className="inline-block px-2 py-1 rounded bg-neutral-100 border text-xs">ดาวน์โหลด</a>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="flex gap-2 mt-2">
        <button className="px-2 py-1 border rounded bg-white" onClick={onEdit}>แก้ไขเวลา</button>
        <button className="px-2 py-1 border rounded bg-white" onClick={onDelete}>ลบ</button>
      </div>
    </div>
  );
}

function GroupSharePanel({ store, setStore, passphrase }){
  const [gid,setGid]=useState(store.settings.group?.id||"");
  const [gpass,setGp]=useState(store.settings.group?.pass||"");
  const [sel, setSel] = useState(new Set()); // selected patientIds for share

  useEffect(()=>{
    // initialize selection to all patients on first open
    setSel(new Set(store.patients.map(p=>p.id)));
  }, [store.patients.length]);

  const toggle = (id)=> setSel(prev => { const s=new Set(prev); s.has(id)?s.delete(id):s.add(id); return s; });
  const selectAll = ()=> setSel(new Set(store.patients.map(p=>p.id)));
  const clearAll = ()=> setSel(new Set());

  const save=()=>setStore(s=>({...s,settings:{...s.settings,group:{id:gid,pass:gpass}}}));

  const onCreate=async()=>{
    if(!/^[A-Za-z0-9_-]{3,40}$/.test(gid)){alert("ชื่อกรุ๊ปไม่ถูกต้อง");return;}
    if(!gpass){alert("ใส่รหัสกรุ๊ป");return;}
    const r=await api("/api/group",{method:"POST",body:jp({id:gid,pass:gpass})});
    if(r.status===201){ save(); alert("สร้างกรุ๊ปแล้ว"); }
    else if(r.status===409){ alert("ชื่อกรุ๊ปนี้ถูกใช้แล้ว"); }
    else { alert("สร้างไม่สำเร็จ: "+(r.body?.error||r.status)); }
  };

  const buildSubset = ()=>{
    const ids = Array.from(sel);
    const patients = store.patients.filter(p=>ids.includes(p.id));
    const notes = store.notes.filter(n=>ids.includes(n.patientId));
    return { mode:"merge", version:1, updatedAt: nowISO(), patients, notes };
  }

  const onPush=async()=>{
    if(!gid||!gpass){alert("ตั้งชื่อและรหัสก่อน");return;}
    if(sel.size===0){ alert("เลือกผู้ป่วยที่จะแชร์ก่อน"); return; }
    const subset = buildSubset();
    const payload=(store.settings.encryptionEnabled && passphrase)
      ? aesEncrypt(jp(subset), passphrase)
      : subset;
    const r=await api(`/api/group?id=${encodeURIComponent(gid)}`,{
      method:"PUT",
      headers:{"x-pass":gpass},
      body:jp({version:1,payload}),
    });
    if(!r.ok){ alert("อัปเดตไม่สำเร็จ: "+(r.body?.error||r.status)); return; }
    alert("อัปเดต (แชร์เฉพาะผู้ป่วยที่เลือก) สำเร็จ");
  };

  const onPull=async()=>{
    if(!gid||!gpass){alert("ตั้งชื่อและรหัสก่อน");return;}
    const r=await api(`/api/group?id=${encodeURIComponent(gid)}`,{headers:{"x-pass":gpass}});
    if(!r.ok){ alert("ดึงไม่สำเร็จ: "+(r.body?.error||r.status)); return; }
    const pl = r.body?.payload;

    // เข้ารหัส
    if(pl?.enc){
      if(!passphrase){alert("ข้อมูลถูกเข้ารหัส — ตั้งรหัสใน Settings ก่อน");return;}
      const s=aesDecrypt(pl, passphrase); if(!s){alert("ถอดรหัสไม่สำเร็จ");return;}
      const incoming=parse(s); if(!incoming){alert("payload ไม่ถูกต้อง");return;}
      const { merged, stats } = mergeState(store, incoming.data? incoming.data : incoming);
      setStore(merged);
      alert(`ดึงและ MERGE แล้ว: +${stats.newPatients} คนไข้, อัปเดต ${stats.updatedPatients}; โน้ต +${stats.newNotes}, อัปเดต ${stats.updatedNotes}`);
      return;
    }

    // ไม่เข้ารหัส — รองรับทั้ง subset ใหม่ และ raw state/เก่า
    let incoming = null;
    if(pl?.mode==="merge" && (pl.patients||pl.notes)){
      incoming = { patients: pl.patients||[], notes: pl.notes||[] };
    }else if(pl?.patients && pl?.notes){
      incoming = { patients: pl.patients, notes: pl.notes };
    }else if(pl?.data && pl.data.patients && pl.data.notes){
      incoming = { patients: pl.data.patients, notes: pl.data.notes };
    }

    if(!incoming){ alert("payload ไม่ถูกต้อง"); return; }

    const { merged, stats } = mergeState(store, incoming);
    setStore(merged);
    alert(`MERGE แล้ว: +${stats.newPatients} คนไข้, อัปเดต ${stats.updatedPatients}; โน้ต +${stats.newNotes}, อัปเดต ${stats.updatedNotes}`);
  };

  return (
    <details className="ml-2">
      <summary className="px-3 py-2 rounded-xl bg-white border cursor-pointer">👥 กลุ่ม</summary>
      <div className="absolute right-4 mt-2 w-[min(96vw,28rem)] p-4 bg-white rounded-2xl shadow-xl border space-y-3">
        <div className="grid gap-2">
          <div><label className="text-xs text-neutral-500">ชื่อกรุ๊ป (a-z 0-9 _ -)</label><Input value={gid} onChange={e=>setGid(e.target.value)}/></div>
          <div><label className="text-xs text-neutral-500">รหัสกรุ๊ป</label><Input type="password" value={gpass} onChange={e=>setGp(e.target.value)}/></div>
        </div>

        <div className="border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">เลือกผู้ป่วยที่จะแชร์</div>
            <div className="flex gap-2">
              <button className="px-2 py-1 border rounded bg-white text-xs" onClick={selectAll}>เลือกทั้งหมด</button>
              <button className="px-2 py-1 border rounded bg-white text-xs" onClick={clearAll}>ล้าง</button>
            </div>
          </div>
          <div className="max-h-60 overflow-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
            {store.patients.map(p=> (
              <label key={p.id} className={"flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer "+(sel.has(p.id)?"bg-black text-white border-black":"bg-white")}>
                <input type="checkbox" className="hidden" checked={sel.has(p.id)} onChange={()=>toggle(p.id)} />
                <span className="inline-block h-3 w-3 rounded-full" style={{background:p.color||"#22c55e"}}></span>
                <span className="truncate">{p.name||"(ไม่มีชื่อ)"} — HN {p.hn||"-"}</span>
              </label>
            ))}
            {store.patients.length===0 && <div className="text-sm text-neutral-500">ยังไม่มีผู้ป่วย</div>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="px-3 py-2 rounded-xl bg-black text-white" onClick={onCreate}>สร้าง</button>
          <button className="px-3 py-2 rounded-xl bg-white border" onClick={()=>setStore(s=>({...s,settings:{...s.settings,group:{id:gid,pass:gpass}}}))}>บันทึก</button>
          <button className="px-3 py-2 rounded-xl bg-white border" onClick={onPull}>ดึง (MERGE)</button>
          <button className="px-3 py-2 rounded-xl bg-white border" onClick={onPush}>อัปเดต (แชร์เฉพาะที่เลือก)</button>
        </div>
        <div className="text-xs text-neutral-500">* เปิด AES ใน Settings เพื่อเข้ารหัส payload ก่อน Push ได้</div>
      </div>
    </details>
  );
}

function MobileTabs({tab,setTab}){
  return (
    <nav className="fixed md:hidden bottom-0 inset-x-0 border-t bg-white z-20" style={{paddingBottom:"env(safe-area-inset-bottom)"}}>
      <div className="grid grid-cols-3">
        {[["patient","ผู้ป่วย"],["notes","ดูโน้ต"],["add","เพิ่มโน้ต"]].map(([k,label])=>(
          <button key={k} onClick={()=>setTab(k)} className={"py-3 text-sm "+(tab===k?"font-semibold":"text-neutral-600")}>{label}</button>
        ))}
      </div>
    </nav>
  );
}

function App(){
  const [pass,setPass]=useState(""); const [tmp,setTmp]=useState("");
  const [locked,setLocked]=useState(false), [bad,setBad]=useState(false);
  const [state,setState]=useState(defaults());
  const [tab,setTab]=useState("patient"); const [sel,setSel]=useState(""); const [q,setQ]=useState("");

  useEffect(()=>{
    const raw=localStorage.getItem(LS_KEY); if(!raw)return;
    const obj=parse(raw); if(obj?.enc){ setLocked(true); } else { const s=Storage.load(); setState(s); if(s.patients[0]) setSel(s.patients[0].id); }
  },[]);

  useEffect(()=>{ Storage.save(state, pass, state.settings.encryptionEnabled); },[state,pass]);

  const patients=useMemo(()=>{
    const t=q.trim().toLowerCase(); if(!t) return state.patients;
    return state.patients.filter(p=>(p.name||"").toLowerCase().includes(t)||(p.hn||"").toLowerCase().includes(t)||(p.cc||"").toLowerCase().includes(t)||(p.ud||"").toLowerCase().includes(t));
  },[state.patients,q]);
  const selPatient = useMemo(()=> state.patients.find(p=>p.id===sel)||null,[state.patients,sel]);
  const notesForSel = useMemo(()=> state.notes.filter(n=>n.patientId===sel).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)), [state.notes, sel]);

  // CRUD
  const addPatient=()=>{
    const id=uid();
    const p={id,name:"ผู้ป่วยใหม่",hn:"",sex:"",dob:"",color:"#22c55e",tags:[],cc:"",ud:"",hx:{},attachments:[],createdAt: nowISO(), updatedAt: nowISO()};
    setState(s=>({...s,patients:[p,...s.patients]})); setSel(id);
  };
  const updatePatient=(id,patch)=> setState(s=>({...s,patients:s.patients.map(p=>p.id===id?{...p,...patch,updatedAt: nowISO()}:p)}));
  const removePatient=(id)=>{ if(!confirm("ลบผู้ป่วยและโน้ตทั้งหมด?")) return; setState(s=>({...s,patients:s.patients.filter(p=>p.id!==id),notes:s.notes.filter(n=>n.patientId!==id)})); setSel(""); };
  const addNote=(pid,payload)=> setState(s=>({...s,notes:[{id:uid(),patientId:pid,createdAt: nowISO(), ...payload},...s.notes]}));
  const updateNote=(id,patch)=> setState(s=>({...s,notes:s.notes.map(n=>n.id===id?{...n,...patch,updatedAt: nowISO()}:n)}));
  const removeNote=(id)=>{ if(!confirm("ลบโน้ตนี้?")) return; setState(s=>({...s,notes:s.notes.filter(n=>n.id!==id)})); };

  const wipe=()=>{ if(!confirm("ล้างข้อมูลทั้งหมดในเครื่อง?")) return; Storage.clear(); setState(defaults()); setSel(""); setPass(""); setLocked(false); setBad(false); };
  const unlock=()=>{ const s=Storage.load(tmp); if(s==="LOCKED"||s==="BAD_PASS"){ setBad(true); return;} setBad(false); setPass(tmp); setState(s); setLocked(false); if(s.patients[0]) setSel(s.patients[0].id); };

  if(locked){
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100 p-6">
        <div className="w-full max-w-md rounded-2xl bg-white shadow p-6">
          <h1 className="text-2xl font-bold mb-2">🔒 ปลดล็อกข้อมูล</h1>
          <Input type="password" placeholder="รหัสผ่าน" value={tmp} onChange={e=>setTmp(e.target.value)}/>
          {bad && <div className="text-red-600 text-sm mt-2">รหัสผ่านไม่ถูกต้อง</div>}
          <div className="flex gap-2 mt-3">
            <button className="px-3 py-2 rounded-xl bg-black text-white" onClick={unlock}>ปลดล็อก</button>
            <button className="px-3 py-2 rounded-xl bg-neutral-200" onClick={wipe}>ล้างข้อมูลทั้งหมด</button>
          </div>
          <div className="text-xs text-neutral-500 mt-3">v {APP_VERSION}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-20">
      <header className="sticky top-0 bg-white border-b z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <h1 className="text-lg md:text-2xl font-bold">🗒️ Progress Notes</h1>
          <div className="ml-auto flex items-center gap-2">
            {tab==="patient" && <button className="px-3 py-2 rounded-xl bg-black text-white" onClick={addPatient}>+ ผู้ป่วย</button>}
            <details className="ml-2">
              <summary className="px-3 py-2 rounded-xl bg-white border cursor-pointer">⚙️ ตั้งค่า</summary>
              <div className="absolute right-4 mt-2 w-[min(96vw,22rem)] p-4 bg-white rounded-2xl shadow-xl border space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={state.settings.encryptionEnabled} onChange={e=>setState(s=>({...s,settings:{...s.settings,encryptionEnabled:e.target.checked}}))}/>
                  เข้ารหัสข้อมูลในเครื่อง (AES)
                </label>
                <Input type="password" placeholder={pass? "เปลี่ยนรหัสผ่าน":"ตั้งรหัสผ่าน"} value={pass} onChange={e=>setPass(e.target.value)}/>
                <button className="px-3 py-2 rounded-xl bg-red-600 text-white w-full" onClick={wipe}>ล้างข้อมูลทั้งหมด</button>
              </div>
            </details>
            <GroupSharePanel store={state} setStore={setState} passphrase={pass} />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 pt-4 hidden md:block">
        <div className="flex gap-2 mb-3">
          <button onClick={()=>setTab("patient")} className={"px-3 py-2 rounded-xl border "+(tab==="patient"?"bg-black text-white border-black":"bg-white")}>ผู้ป่วย</button>
          <button onClick={()=>setTab("notes")} className={"px-3 py-2 rounded-xl border "+(tab==="notes"?"bg-black text-white border-black":"bg-white")}>ดู Progress notes</button>
          <button onClick={()=>setTab("add")} className={"px-3 py-2 rounded-xl border "+(tab==="add"?"bg-black text-white border-black":"bg-white")}>เพิ่ม Progress note</button>
        </div>
      </div>

      <main className="max-w-6xl mx-auto grid md:grid-cols-12 gap-4 px-2 sm:px-4 pb-8">
        {/* Sidebar: patient list */}
        <aside className={(tab==="patient"?"block":"hidden")+" md:col-span-4 lg:col-span-3"}>
          <div className="rounded-2xl bg-white shadow p-3">
            <Input value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหา: ชื่อ / HN / CC / U/D"/>
            <ul className="max-h-[70vh] overflow-auto pr-1 space-y-1 mt-2">
              {patients.map(p=>(
                <li key={p.id}>
                  <button onClick={()=>setSel(p.id)} className={"w-full text-left px-3 py-2 rounded-xl border "+(sel===p.id?"bg-black text-white border-black":"bg-white")}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium inline-flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full" style={{background:p.color||"#22c55e"}}></span>
                        {p.name||"(ไม่มีชื่อ)"}
                      </span>
                      <span className="text-xs opacity-70">HN: {p.hn||"-"}</span>
                    </div>
                    {(p.cc||p.ud) && <div className="text-xs opacity-70 mt-0.5">{p.cc?`CC: ${p.cc}`:""} {p.ud?`• U/D: ${p.ud}`:""}</div>}
                  </button>
                </li>
              ))}
              {patients.length===0 && <p className="text-sm text-neutral-500 p-2">ยังไม่มีผู้ป่วย</p>}
            </ul>
          </div>
        </aside>

        {/* Patient editor */}
        <section className={(tab==="patient"?"block":"hidden")+" md:col-span-8 lg:col-span-9"}>
          <div className="rounded-2xl bg-white shadow p-4">
            {selPatient ? <PatientEditor patient={selPatient} onChange={(patch)=>updatePatient(selPatient.id, patch)} onRemove={()=>removePatient(selPatient.id)} /> :
              <div className="text-neutral-600">เลือกผู้ป่วยจากด้านซ้าย หรือกด “+ ผู้ป่วย”</div>}
          </div>

          {selPatient && (
            <div className="space-y-3 mt-4">
              {notesForSel.map(n=>(
                <NoteRow key={n.id} note={n} patient={selPatient}
                  onEdit={()=>updateNote(n.id,{timestamp:nowISO()})}
                  onDelete={()=>removeNote(n.id)} />
              ))}
              {notesForSel.length===0 && <div className="rounded-2xl bg-white shadow p-4 text-sm text-neutral-600">ยังไม่มี progress note</div>}
            </div>
          )}
        </section>

        {/* Notes viewer */}
        <section className={(tab==="notes"?"block":"hidden")+" md:col-span-12"}>
          <div className="rounded-2xl bg-white shadow p-4">
            <div className="text-sm text-neutral-600 mb-2">ดู Progress notes ทั้งหมด (ค้นหา/ลบ/แก้เวลาได้)</div>
            {state.notes.length===0 ? <div className="text-sm text-neutral-600">ยังไม่มีโน้ต</div> :
              <div className="space-y-3">
                {state.notes
                  .map(n=>({n, p: state.patients.find(x=>x.id===n.patientId)}))
                  .filter(({n,p})=> !!p)
                  .sort((a,b)=>b.n.timestamp.localeCompare(a.n.timestamp))
                  .map(({n,p})=>(
                    <NoteRow key={n.id} note={n} patient={p}
                      onEdit={()=>updateNote(n.id,{timestamp:nowISO()})}
                      onDelete={()=>removeNote(n.id)} />
                ))}
              </div>
            }
          </div>
        </section>

        {/* Add note */}
        <section className={(tab==="add"?"block":"hidden")+" md:col-span-12"}>
          <div className="rounded-2xl bg-white shadow p-4">
            {state.patients.length===0 ? <div className="text-sm text-neutral-600">ยังไม่มีผู้ป่วย — ไปแท็บ “ผู้ป่วย” เพื่อเพิ่มก่อน</div> :
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-neutral-500">เลือกผู้ป่วย</label>
                  <select className="w-full border rounded-xl px-3 py-2" value={sel} onChange={e=>setSel(e.target.value)}>
                    {state.patients.map(p=>(<option key={p.id} value={p.id}>{p.name||"(ไม่มีชื่อ)"} — HN {p.hn||"-"}</option>))}
                  </select>
                </div>
                {sel ? <NewNoteForm onAdd={(payload)=>addNote(sel, payload)} /> : <div className="text-sm text-neutral-600">เลือกผู้ป่วยก่อน</div>}
              </div>
            }
          </div>
        </section>
      </main>

      <MobileTabs tab={tab} setTab={setTab} />

      <footer className="max-w-6xl mx-auto px-2 sm:px-4 pb-24 md:pb-8 text-xs text-neutral-500">
        <p>⚠️ ข้อมูลเก็บบนอุปกรณ์ของคุณ (localStorage). เปิดเข้ารหัสก่อนใช้ข้อมูลจริง และปฏิบัติตาม PDPA.</p>
        <p className="mt-1">เวอร์ชัน {APP_VERSION} • MERGE ไม่ทับไฟล์ • แชร์เลือกผู้ป่วยได้</p>
      </footer>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
