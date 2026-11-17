/* ============================================================
   الإعدادات، القفل، النسخ الاحتياطي، تصدير القضية — مطابقة لـ
   SettingsScreen/AppPrefs و LockScreen/FolderLock و BackupCrypto/BackupManager
   و CaseExporter في نسخة الأندرويد
   ============================================================ */
"use strict";
const PREF_KEY="lpprefs";
const PREF_DEF={defaultFilter:"auto",pdfSize:"FIT",autoCompress:0,watermarkText:"",cardsOnOneSheet:true,
 appLock:false,pinHash:"",pinSalt:"",webauthnId:"",lockedClients:[],ocrLangs:"ara+eng",sort:"DATE_DESC"};
function prefs(){try{return{...PREF_DEF,...JSON.parse(localStorage.getItem(PREF_KEY)||"{}")}}catch(e){return{...PREF_DEF}}}
function setPref(k,v){const p=prefs();p[k]=v;try{localStorage.setItem(PREF_KEY,JSON.stringify(p))}catch(e){}}

/* ---------- أدوات تشفير ---------- */
const enc=new TextEncoder(),decd=new TextDecoder();
const b64=u=>{let s="";const a=new Uint8Array(u);for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode.apply(null,a.subarray(i,i+8192));return btoa(s)};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function sha(s){return b64(await crypto.subtle.digest("SHA-256",enc.encode(s)))}
async function aesKey(pw,salt){const base=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveKey"]);
 return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:210000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}

/* ---------- قفل التطبيق (PIN دائماً + Face ID/البصمة اختياري عبر WebAuthn) ---------- */
let unlockedApp=false;const unlockedFolders=new Set();
async function checkPin(pin){const p=prefs();return !!p.pinHash&&(await sha(p.pinSalt+pin))===p.pinHash}
async function setPin(){return new Promise(res=>{
 dialog(`<h3 style="margin-top:0">رمز القفل (PIN)</h3><p class="note">٤ أرقام على الأقل. الرمز مقبول دايماً حتى لو فعّلت Face ID، عشان ماتتقفلش برا ملفاتك.</p>
 <label>الرمز</label><input id="pn1" type="password" inputmode="numeric" autocomplete="new-password">
 <label>أعد كتابته</label><input id="pn2" type="password" inputmode="numeric" autocomplete="new-password"><p class="note" id="pnE" style="color:#b91c1c"></p>
 <div class="row"><button class="btn" id="pnOk">حفظ</button><button class="btn sec" id="pnX">إلغاء</button></div>`);
 $("#pnX").onclick=()=>{closeDlg();res(false)};
 $("#pnOk").onclick=async()=>{const a=$("#pn1").value,b=$("#pn2").value;
  if(a.length<4){$("#pnE").textContent="الرمز لازم يكون ٤ أرقام على الأقل.";return}if(a!==b){$("#pnE").textContent="الرمزين مش متطابقين.";return}
  const salt=b64(crypto.getRandomValues(new Uint8Array(16)));setPref("pinSalt",salt);setPref("pinHash",await sha(salt+a));closeDlg();res(true)}})}
async function enrollBiometric(){try{if(!window.PublicKeyCredential)throw 0;
 const cred=await navigator.credentials.create({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rp:{name:"سكانر المحامي"},
  user:{id:crypto.getRandomValues(new Uint8Array(16)),name:"owner",displayName:"صاحب المكتب"},pubKeyCredParams:[{type:"public-key",alg:-7},{type:"public-key",alg:-257}],
  authenticatorSelection:{authenticatorAttachment:"platform",userVerification:"required",residentKey:"preferred"},timeout:60000}});
 setPref("webauthnId",b64(cred.rawId));return true}catch(e){alert("Face ID / البصمة غير متاحة على هذا الجهاز أو تم الإلغاء. هتفضل تفتح بالرمز.");return false}}
async function biometric(){const id=prefs().webauthnId;if(!id||!window.PublicKeyCredential)return false;
 try{await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),allowCredentials:[{type:"public-key",id:unb64(id)}],userVerification:"required",timeout:60000}});return true}catch(e){return false}}
function lockScreen(title){return new Promise(res=>{
 const d=document.createElement("div");d.id="lockScr";
 d.style.cssText="position:fixed;inset:0;z-index:50;background:var(--acc);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px;gap:14px";
 d.innerHTML=`<div style="font-size:46px">🔒</div><div style="font-size:18px;font-weight:700">${title}</div>
  <input id="lkPin" type="password" inputmode="numeric" placeholder="الرمز" style="max-width:220px;text-align:center;font-size:22px;letter-spacing:6px">
  <div class="note" id="lkE" style="color:#ffd7c2;min-height:18px"></div>
  <div class="row" style="justify-content:center"><button class="btn warn" id="lkOk">فتح</button>${prefs().webauthnId?`<button class="btn sec" id="lkBio">Face ID / البصمة</button>`:""}
  ${title!=="التطبيق مقفول"?`<button class="btn sec" id="lkX">إلغاء</button>`:""}</div>`;
 document.body.appendChild(d);const done=v=>{d.remove();res(v)};
 const tryPin=async()=>{if(await checkPin($("#lkPin").value))done(true);else{$("#lkE").textContent="الرمز غلط.";$("#lkPin").value=""}};
 $("#lkOk").onclick=tryPin;$("#lkPin").onkeydown=e=>{if(e.key==="Enter")tryPin()};
 const bio=$("#lkBio");if(bio)bio.onclick=async()=>{if(await biometric())done(true)};
 const x=$("#lkX");if(x)x.onclick=()=>done(false);
 setTimeout(()=>$("#lkPin")&&$("#lkPin").focus(),100)})}
async function guardApp(){if(!prefs().appLock||!prefs().pinHash||unlockedApp||$("#lockScr"))return;
 const ok=await lockScreen("التطبيق مقفول");if(ok)unlockedApp=true}
// عند الخروج للخلفية يتقفل التطبيق والفولدرات من جديد (نفس سلوك الأندرويد)
document.addEventListener("visibilitychange",()=>{if(document.hidden){unlockedApp=false;unlockedFolders.clear();
 if(prefs().lockedClients.length&&typeof cur!=="undefined"&&cur&&isLocked(cur.client))home()}else guardApp()});
setTimeout(guardApp,50);

/* ---------- قفل الفولدر (العميل) ---------- */
const clientKey=c=>c||"بدون عميل";
function isLocked(c){return prefs().lockedClients.includes(clientKey(c))&&!unlockedFolders.has(clientKey(c))}
window.toggleFolderLock=async function(c){c=clientKey(c);const p=prefs();
 if(p.lockedClients.includes(c)){if(!(await lockScreen("فك قفل «"+c+"»")))return;setPref("lockedClients",p.lockedClients.filter(x=>x!==c))}
 else{if(!p.pinHash&&!(await setPin()))return;setPref("lockedClients",[...prefs().lockedClients,c])}
 renderList()};
window.openFolder=async function(c){if(await lockScreen("«"+clientKey(c)+"» مقفول")){unlockedFolders.add(clientKey(c));renderList()}};
window.folderLocked=isLocked;
{const _open=window.openDoc;window.openDoc=async function(id){const d=docs.find(x=>x.id===id);
 if(d&&isLocked(d.client)){if(!(await lockScreen("«"+clientKey(d.client)+"» مقفول")))return;unlockedFolders.add(clientKey(d.client))}_open(id)}}

/* ---------- الإعدادات ---------- */
function settings(){
 cur=null;$("#backBtn").classList.remove("hidden");$("#ttl").textContent="⚙️ الإعدادات";const p=prefs();
 const sec=t=>`<h3 style="font-size:14px;color:var(--acc);margin:16px 4px 6px">${t}</h3>`;
 app.innerHTML=`${sec("الأمان")}<div class="card">
  <label style="color:var(--ink);font-size:15px"><input type="checkbox" id="sLock" style="width:auto" ${p.appLock?"checked":""}> قفل التطبيق</label>
  <p class="note">يطلب الرمز أو Face ID كل ما تفتح التطبيق أو ترجع له.</p>
  <div class="row"><button class="btn sec" id="sPin">${p.pinHash?"تغيير الرمز":"تعيين رمز"}</button><button class="btn sec" id="sBio">${p.webauthnId?"✅ Face ID مفعّل":"تفعيل Face ID / البصمة"}</button></div>
  <p class="note">لقفل فولدر عميل معيّن: من الشاشة الرئيسية اضغط 🔓 جنب اسم العميل.</p></div>
 ${sec("إعدادات المسح")}<div class="card"><label>الفلتر الافتراضي</label><div class="fchips" style="flex-wrap:wrap">${FILTERS.map(([k,l])=>`<button class="btn sec ${normFilter(p.defaultFilter)===k?"warn":""}" data-df="${k}" style="padding:8px 10px;font-size:13px">${l}</button>`).join("")}</div>
  <label>مقاس صفحة الـ PDF</label><select id="sPsz">${[["FIT","مطابق للصورة"],["A4","A4"],["LETTER","Letter"]].map(([k,l])=>`<option value="${k}" ${p.pdfSize===k?"selected":""}>${l}</option>`).join("")}</select>
  <label style="color:var(--ink);font-size:15px;margin-top:10px"><input type="checkbox" id="sCards" style="width:auto" ${p.cardsOnOneSheet?"checked":""}> وجه وظهر البطاقة على ورقة A4 واحدة</label></div>
 ${sec("ضغط تلقائي للمستندات الجديدة")}<div class="card"><p class="note">أي PDF هيتصدّر من دلوقتي هيتضغط تلقائي للحجم ده، مع الحفاظ على وضوح النص قد الإمكان.</p>
  <select id="sAuto"><option value="0">بدون ضغط</option>${PRESETS.map(([l,b])=>`<option value="${b}" ${p.autoCompress==b?"selected":""}>${l}</option>`).join("")}</select></div>
 ${sec("العلامة المائية")}<div class="card"><input id="sWm" placeholder="النص الافتراضي للعلامة المائية" value="${esc(p.watermarkText)}"><p class="note">لو سبته فاضي هيتكتب اسم المكتب.</p></div>
 ${sec("النسخ الاحتياطي")}<div class="card"><p class="note">نسخة من كل المستندات والتوقيعات والإعدادات في ملف واحد، تقدر تشفّره بكلمة سر وتحفظه في «الملفات» أو iCloud.</p>
  <div class="row"><button class="btn" id="sBk">💾 عمل نسخة احتياطية</button><button class="btn sec" id="sRs">♻️ استعادة نسخة</button></div></div>
 ${sec("التخزين")}<div class="card"><p class="note" id="sSt">…</p></div>
 <p class="note" style="text-align:center;margin-top:18px">سكانر المحامي المحترف — نسخة الآيفون</p>`;
 $("#sLock").onchange=async e=>{if(e.target.checked&&!prefs().pinHash&&!(await setPin())){e.target.checked=false;return}setPref("appLock",e.target.checked);if(e.target.checked)unlockedApp=true};
 $("#sPin").onclick=async()=>{if(prefs().pinHash&&!(await lockScreen("أدخل الرمز الحالي")))return;await setPin();settings()};
 $("#sBio").onclick=async()=>{if(!prefs().pinHash&&!(await setPin()))return;await enrollBiometric();settings()};
 app.querySelectorAll("[data-df]").forEach(b=>b.onclick=()=>{setPref("defaultFilter",b.dataset.df);settings()});
 $("#sPsz").onchange=e=>setPref("pdfSize",e.target.value);$("#sCards").onchange=e=>setPref("cardsOnOneSheet",e.target.checked);
 $("#sAuto").onchange=e=>setPref("autoCompress",+e.target.value);$("#sWm").onchange=e=>setPref("watermarkText",e.target.value.trim());
 $("#sBk").onclick=backupDlg;$("#sRs").onclick=restore;
 (async()=>{try{const e=await navigator.storage.estimate(),ps=await navigator.storage.persisted?.();
  $("#sSt").textContent=`${docs.length} مستند · مستخدم ${(e.usage/1048576).toFixed(1)} ميجا من ${(e.quota/1048576).toFixed(0)} ميجا · ${ps?"✅ التخزين محمي من المسح التلقائي":"⚠️ Safari ممكن يمسح البيانات لو المساحة قلّت — ثبّت التطبيق على الشاشة الرئيسية واعمل نسخة احتياطية بانتظام"}`}
  catch(e){$("#sSt").textContent=docs.length+" مستند"}})()}
window.settings=settings;

/* ---------- النسخ الاحتياطي ---------- */
function saveFile(blob,fn){const f=new File([blob],fn,{type:blob.type||"application/octet-stream"});
 if(navigator.canShare&&navigator.canShare({files:[f]}))return navigator.share({files:[f],title:fn}).catch(()=>dl());dl();
 function dl(){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=fn;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000)}}
function backupDlg(){dialog(`<h3 style="margin-top:0">نسخة احتياطية</h3>
 <label style="color:var(--ink);font-size:15px"><input type="checkbox" id="bkEnc" style="width:auto" checked> تشفير بكلمة سر</label>
 <div id="bkPw"><label>كلمة سر النسخة</label><input id="bk1" type="password"><label>أعد كتابتها</label><input id="bk2" type="password"><p class="note">٦ حروف على الأقل. لو نسيتها مفيش طريقة تفتح النسخة.</p></div>
 <p class="note" id="bkE" style="color:#b91c1c"></p><div class="row"><button class="btn" id="bkGo">إنشاء النسخة</button><button class="btn sec" onclick="closeDlg()">إلغاء</button></div>`);
 $("#bkEnc").onchange=e=>$("#bkPw").classList.toggle("hidden",!e.target.checked);
 $("#bkGo").onclick=async()=>{const encOn=$("#bkEnc").checked,pw=$("#bk1").value;
  if(encOn){if(pw.length<6){$("#bkE").textContent="٦ حروف على الأقل.";return}if(pw!==$("#bk2").value){$("#bkE").textContent="الكلمتين مش متطابقتين.";return}}
  closeDlg();busy(1);try{const pr=prefs();delete pr.pinHash;delete pr.pinSalt;delete pr.webauthnId;
   const payload=JSON.stringify({app:"lpscanner",v:1,at:Date.now(),docs,sigs:JSON.parse(localStorage.getItem("lpsigs")||"[]"),prefs:pr});
   let out;if(encOn){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},await aesKey(pw,salt),enc.encode(payload));
    out=JSON.stringify({app:"lpscanner",enc:"AES-256-GCM/PBKDF2-SHA256-210000",salt:b64(salt),iv:b64(iv),data:b64(ct)})}else out=payload;
   const d=new Date(),p2=v=>String(v).padStart(2,"0");
   await saveFile(new Blob([out],{type:"application/json"}),`نسخة-سكانر-${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}${encOn?"-مشفرة":""}.lpscan`)}
  finally{busy(0)}}}
function restore(){const inp=document.createElement("input");inp.type="file";inp.accept=".lpscan,.json,application/json";
 inp.onchange=async()=>{const f=inp.files[0];if(!f)return;let txt=await f.text(),o;try{o=JSON.parse(txt)}catch(e){alert("الملف ده مش نسخة احتياطية صالحة.");return}
  if(o.enc){const pw=prompt("كلمة سر النسخة");if(!pw)return;busy(1);
   try{const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(o.iv)},await aesKey(pw,unb64(o.salt)),unb64(o.data));o=JSON.parse(decd.decode(pt))}
   catch(e){busy(0);alert("كلمة السر غلط أو الملف تالف.");return}busy(0)}
  if(o.app!=="lpscanner"||!Array.isArray(o.docs)){alert("الملف ده مش نسخة احتياطية من السكانر.");return}
  const have=new Set(docs.map(d=>d.id));let n=0;for(const d of o.docs)if(!have.has(d.id)){docs.push(d);save(d);n++}
  const sigs=JSON.parse(localStorage.getItem("lpsigs")||"[]"),sh=new Set(sigs.map(s=>s.id));(o.sigs||[]).forEach(s=>{if(!sh.has(s.id))sigs.push(s)});
  try{localStorage.setItem("lpsigs",JSON.stringify(sigs))}catch(e){}
  alert(`تمت الاستعادة: ${n} مستند جديد${o.docs.length-n?` (و${o.docs.length-n} موجودين بالفعل اتسابوا زي ما هم)`:""}.`);home()};
 inp.click()}

/* ---------- تصدير القضية / العميل (CaseExporter) ---------- */
// ZIP بسيط بدون ضغط (ملفات PDF مضغوطة أصلاً) بأسماء عربية UTF-8
function crc32(a){let c,t=crc32.t;if(!t){t=crc32.t=new Uint32Array(256);for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}}
 c=0xFFFFFFFF;for(let i=0;i<a.length;i++)c=t[(c^a[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0}
async function makeZip(files){const parts=[],cent=[];let off=0;
 for(const f of files){const name=enc.encode(f.name),data=new Uint8Array(await f.blob.arrayBuffer()),crc=crc32(data);
  const h=new DataView(new ArrayBuffer(30));h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint32(14,crc,true);
  h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);parts.push(h,name,data);
  const c=new DataView(new ArrayBuffer(46));c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);
  c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,off,true);cent.push(c,name);
  off+=30+name.length+data.length}
 const cs=cent.reduce((s,x)=>s+x.byteLength,0),e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);
 e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cs,true);e.setUint32(16,off,true);
 return new Blob([...parts,...cent,e],{type:"application/zip"})}
const safe=s=>String(s||"").replace(/[\\/:*?"<>|]/g,"_").trim()||"بدون اسم";
async function pagesToCanvases(pages){const cs=[];for(const p of pages){const im=new Image();im.src=p.img;await im.decode();
 const c=document.createElement("canvas");c.width=im.width;c.height=im.height;c.getContext("2d").drawImage(im,0,0);cs.push(c)}return cs}
window.exportClient=async function(client){client=clientKey(client);
 if(isLocked(client)){if(!(await lockScreen("«"+client+"» مقفول")))return;unlockedFolders.add(client)}
 const ds=docs.filter(d=>clientKey(d.client)===client).sort((a,b)=>(a.caseNo||"").localeCompare(b.caseNo||"")||a.updated-b.updated);
 dialog(`<h3 style="margin-top:0">تصدير «${esc(client)}»</h3><p class="note">${ds.length} مستند.</p>
 <div class="row" style="flex-direction:column"><button class="btn" id="exTree">📁 ملف مضغوط: فولدر لكل قضية وPDF لكل مستند</button>
 <button class="btn sec" id="exOne">📄 PDF واحد يجمع كل المستندات بالترتيب</button><button class="btn sec" onclick="closeDlg()">إلغاء</button></div>`);
 const size=prefs().pdfSize,q=.65;
 $("#exTree").onclick=async()=>{closeDlg();busy(1);try{const files=[],used=new Set();
   for(const d of ds){if(!d.pages.length)continue;let n=`${safe(client)}/${d.caseNo?safe(d.caseNo)+"/":""}${safe(d.title)}.pdf`;
    if(used.has(n))n=n.replace(/\.pdf$/,` ${new Date(d.updated).toISOString().slice(0,10)}.pdf`);used.add(n);
    files.push({name:n,blob:buildPdf(await pagesToCanvases(d.pages),q,size)})}
   await saveFile(await makeZip(files),`قضايا ${safe(client)}.zip`)}finally{busy(0)}};
 $("#exOne").onclick=async()=>{closeDlg();busy(1);try{const all=ds.flatMap(d=>d.pages);if(!all.length)return;
   await saveFile(buildPdf(await pagesToCanvases(all),q,size),`${safe(client)} - ملف كامل.pdf`)}finally{busy(0)}}};

/* زر الإعدادات في الشريط العلوي */
{const b=document.createElement("button");b.id="setBtn";b.textContent="⚙️";b.title="الإعدادات";b.onclick=settings;$("header").appendChild(b)}
/* العلامة المائية الافتراضية من الإعدادات (لو اتحددت) */
{const _rd=window.renderDoc;window.renderDoc=function(){_rd();const w=prefs().watermarkText,el=$("#wmTx");if(w&&el)el.value=w}}
