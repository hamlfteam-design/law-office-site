/* ============================================================
   المكتبة: تفاصيل المستند والحقول المخصصة (FieldsScreen)، الوسوم،
   الفرز، الفهرس (IndexScreen)، وضع القراءة (ReadingModeScreen)،
   واستيراد PDF والصور (PdfImporter / LibraryImporter / FilingIndexer)
   ============================================================ */
"use strict";
(function(){
const TYPES=[["text","نص"],["number","رقم"],["date","تاريخ"],["select","اختيار من قائمة"],["bool","نعم / لا"]];
const fields=()=>prefs().fields||[];
const fieldsFor=client=>fields().filter(f=>!f.scope||f.scope===(client||""));
const fval=(d,f)=>(d.fields||{})[f.id];
const showVal=(f,v)=>f.type==="bool"?(v?"نعم":"لا"):(v??"");

/* ---------- تعريف الحقول ---------- */
window.fieldsScreen=function(){cur=null;$("#backBtn").classList.remove("hidden");$("#ttl").textContent="🗂️ حقول الحفظ";
 const fs=fields(),clients=[...new Set(docs.map(d=>d.client).filter(Boolean))];
 app.innerHTML=`<p class="note">حدّد البيانات اللي تتسجل مع كل مستند (زي: رقم التوكيل، تاريخ الجلسة، المحكمة). الحقل يظهر في كل المستندات، أو في مستندات عميل واحد بس.</p>
 ${fs.map(f=>`<div class="card"><div class="row" style="align-items:center"><b style="flex:1">${esc(f.name)}</b><span class="note">${TYPES.find(t=>t[0]===f.type)?.[1]||""}${f.scope?" · "+esc(f.scope):" · كل المستندات"}</span>
  <button class="btn sec" style="padding:6px 10px" onclick="editField('${f.id}')">تعديل</button><button class="btn danger" style="padding:6px 10px" onclick="delField('${f.id}')">حذف</button></div></div>`).join("")||`<div class="empty">لا توجد حقول بعد.</div>`}
 <button class="btn" onclick="editField()">➕ حقل جديد</button><datalist id="fcl">${clients.map(c=>`<option value="${esc(c)}">`).join("")}</datalist>`};
window.editField=function(id){const f=fields().find(x=>x.id===id)||{id:"f"+Date.now(),name:"",type:"text",options:"",scope:""};
 dialog(`<h3 style="margin-top:0">${id?"تعديل حقل":"حقل جديد"}</h3><label>اسم الحقل</label><input id="fN" value="${esc(f.name)}">
 <label>النوع</label><select id="fT">${TYPES.map(([k,l])=>`<option value="${k}" ${f.type===k?"selected":""}>${l}</option>`).join("")}</select>
 <div id="fOw" class="${f.type==="select"?"":"hidden"}"><label>الاختيارات (افصل بينها بفاصلة)</label><input id="fO" value="${esc(f.options)}"></div>
 <label>يظهر في</label><input id="fS" list="fcl" value="${esc(f.scope)}" placeholder="فاضي = كل المستندات، أو اكتب اسم العميل">
 <div class="row" style="margin-top:12px"><button class="btn" id="fOk">حفظ</button><button class="btn sec" onclick="closeDlg()">إلغاء</button></div>`);
 $("#fT").onchange=e=>$("#fOw").classList.toggle("hidden",e.target.value!=="select");
 $("#fOk").onclick=()=>{const name=$("#fN").value.trim();if(!name)return;const nf={...f,name,type:$("#fT").value,options:$("#fO").value,scope:$("#fS").value.trim()};
  const all=fields().filter(x=>x.id!==f.id);const i=fields().findIndex(x=>x.id===f.id);if(i>=0)all.splice(i,0,nf);else all.push(nf);setPref("fields",all);closeDlg();fieldsScreen()}};
window.delField=function(id){if(!confirm("حذف الحقل؟ القيم المسجلة في المستندات هتفضل محفوظة لكن مش هتظهر."))return;setPref("fields",fields().filter(f=>f.id!==id));fieldsScreen()};

/* ---------- تفاصيل المستند (العميل/القضية/العنوان/الوسوم/الحقول) ---------- */
function input(f,v){const id=`fv_${f.id}`;
 if(f.type==="bool")return `<label style="color:var(--ink);font-size:15px"><input type="checkbox" id="${id}" style="width:auto" ${v?"checked":""}> ${esc(f.name)}</label>`;
 if(f.type==="select")return `<label>${esc(f.name)}</label><select id="${id}"><option value=""></option>${String(f.options||"").split(/[,،]/).map(o=>o.trim()).filter(Boolean).map(o=>`<option ${o===v?"selected":""}>${esc(o)}</option>`).join("")}</select>`;
 return `<label>${esc(f.name)}</label><input id="${id}" type="${f.type==="number"?"number":f.type==="date"?"date":"text"}" value="${esc(v??"")}">`}
window.editDetails=function(){const d=cur;if(!d)return;const cl=[...new Set(docs.map(x=>x.client).filter(Boolean))];
 dialog(`<h3 style="margin-top:0">بيانات المستند</h3><div style="max-height:62vh;overflow:auto">
 <label>العميل</label><input id="dC" list="dcl" value="${esc(d.client)}"><datalist id="dcl">${cl.map(c=>`<option value="${esc(c)}">`).join("")}</datalist>
 <label>رقم القضية / الموضوع</label><input id="dK" value="${esc(d.caseNo)}"><label>عنوان المستند</label><input id="dT" value="${esc(d.title)}">
 <label>وسوم (افصل بفاصلة)</label><input id="dG" value="${esc((d.tags||[]).join("، "))}" placeholder="مثال: عاجل، أصل، صورة">
 ${fieldsFor(d.client).map(f=>input(f,fval(d,f))).join("")}
 <p class="note"><a href="#" onclick="closeDlg();fieldsScreen();return false">إدارة حقول الحفظ…</a></p></div>
 <div class="row" style="margin-top:10px"><button class="btn" id="dOk">حفظ</button><button class="btn sec" onclick="closeDlg()">إلغاء</button></div>`);
 $("#dOk").onclick=()=>{d.client=$("#dC").value.trim();d.caseNo=$("#dK").value.trim();d.title=$("#dT").value.trim()||d.title;
  d.tags=$("#dG").value.split(/[,،]/).map(s=>s.trim()).filter(Boolean);d.fields=d.fields||{};
  fieldsFor(d.client).forEach(f=>{const e=$("#fv_"+f.id);if(e)d.fields[f.id]=f.type==="bool"?e.checked:e.value.trim()});
  save(d);closeDlg();$("#ttl").textContent=d.title;renderDoc()}};
const searchText=d=>[d.title,d.client,d.caseNo,d.ocrText,...(d.tags||[]),...fields().map(f=>showVal(f,fval(d,f)))].join(" ");
window.docSearchText=searchText;

/* ---------- وضع القراءة ---------- */
window.readingMode=function(){if(!cur||!cur.ocrText)return;let size=+(localStorage.getItem("lpread")||19);
 const d=document.createElement("div");d.style.cssText="position:fixed;inset:0;z-index:17;background:#fffdf8;display:flex;flex-direction:column;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)";
 d.innerHTML=`<div style="display:flex;gap:8px;align-items:center;padding:10px;background:var(--acc);color:#fff"><b style="flex:1">${esc(cur.title)}</b>
  <button class="btn sec" data-m>أ−</button><button class="btn sec" data-p>أ+</button><button class="btn sec" data-x>إغلاق</button></div>
  <div data-t style="flex:1;overflow:auto;padding:18px 20px;white-space:pre-wrap;line-height:1.95;direction:rtl"></div>`;
 document.body.appendChild(d);const t=d.querySelector("[data-t]");t.textContent=cur.ocrText;
 const apply=()=>{t.style.fontSize=size+"px";try{localStorage.setItem("lpread",size)}catch(e){}};apply();
 d.querySelector("[data-m]").onclick=()=>{size=Math.max(13,size-2);apply()};d.querySelector("[data-p]").onclick=()=>{size=Math.min(40,size+2);apply()};
 d.querySelector("[data-x]").onclick=()=>d.remove()};

/* ---------- الفهرس ---------- */
window.indexScreen=function(mode,q){mode=mode||"folder";q=q||"";cur=null;$("#backBtn").classList.remove("hidden");$("#ttl").textContent="📇 الفهرس";
 const vis=docs.filter(d=>!folderLocked(d.client)&&(!q||searchText(d).includes(q)));const groups=new Map();
 const add=(h,d)=>{if(!groups.has(h))groups.set(h,[]);groups.get(h).push(d)};
 vis.forEach(d=>{if(mode==="folder")add([d.client||"بدون عميل",d.caseNo].filter(Boolean).join(" ← "),d);
  else if(mode==="field"){let any=false;fields().forEach(f=>{const v=fval(d,f);if(v!==undefined&&v!==""&&v!==false){add(`${f.name}: ${showVal(f,v)}`,d);any=true}});if(!any)add("بدون بيانات",d)}
  else{(d.tags||[]).forEach(t=>add("🏷️ "+t,d));if(!(d.tags||[]).length)add("بدون وسوم",d)}});
 const hs=[...groups.keys()].sort((a,b)=>a.localeCompare(b,"ar"));
 app.innerHTML=`<input id="ixQ" placeholder="🔍 بحث في كل المستندات" value="${esc(q)}">
 <div class="row" style="margin:10px 0">${[["folder","حسب العميل والقضية"],["field","حسب الحقول"],["tag","حسب الوسوم"]].map(([k,l])=>`<button class="btn ${k===mode?"":"sec"}" style="padding:8px 10px;font-size:13px" onclick="indexScreen('${k}',$('#ixQ').value)">${l}</button>`).join("")}</div>
 ${hs.map(h=>`<h3 style="font-size:14px;color:var(--acc);margin:12px 4px 6px">${esc(h)} <span class="note">(${groups.get(h).length})</span></h3>`+
  groups.get(h).map(d=>`<div class="card doc" style="padding:8px" onclick="openDoc('${d.id}')"><img src="${d.pages[0]?.img||""}" style="width:40px;height:52px"><div><div class="t">${esc(d.title)}</div><div class="m">${d.pages.length} صفحة · ${new Date(d.updated).toLocaleDateString("ar-EG")}</div></div></div>`).join("")).join("")||`<div class="empty">مفيش نتايج.</div>`}`;
 const qi=$("#ixQ");qi.oninput=()=>{clearTimeout(qi._t);qi._t=setTimeout(()=>{indexScreen(mode,qi.value);const n=$("#ixQ");n.focus();n.setSelectionRange(n.value.length,n.value.length)},350)}};

/* ---------- الاستيراد ---------- */
let pdfjs=null;
async function loadPdfJs(){if(pdfjs)return pdfjs;pdfjs=await import(new URL("pdfjs/pdf.min.mjs",location.href).href);
 pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs/pdf.worker.min.mjs",location.href).href;return pdfjs}
async function pdfToPages(file,prog){const lib=await loadPdfJs();const doc=await lib.getDocument({data:await file.arrayBuffer()}).promise;const pages=[];
 for(let i=1;i<=doc.numPages;i++){prog&&prog(i,doc.numPages);const pg=await doc.getPage(i),vp0=pg.getViewport({scale:1}),sc=Math.min(3,2000/Math.max(vp0.width,vp0.height)),vp=pg.getViewport({scale:sc});
  const c=document.createElement("canvas");c.width=Math.round(vp.width);c.height=Math.round(vp.height);const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);
  await pg.render({canvasContext:x,viewport:vp}).promise;pages.push({img:c.toDataURL("image/jpeg",.85),filter:"orig"});pg.cleanup()}
 await doc.destroy();return pages}
/* FilingIndexer: الاسم «عميل - قضية - مستند.pdf» يملأ البيانات تلقائياً */
function fileMeta(name){const base=name.replace(/\.[^.]+$/,"").trim();const parts=base.split(/\s+[-–—]\s+/);
 if(parts.length>=3)return{client:parts[0],caseNo:parts[1],title:parts.slice(2).join(" - ")};
 if(parts.length===2)return{client:parts[0],caseNo:"",title:parts[1]};return{client:"",caseNo:"",title:base}}
window.importDlg=function(){dialog(`<h3 style="margin-top:0">استيراد</h3><p class="note">ملفات PDF من برنامج سكانر تاني أو من «الملفات»، أو صور من الألبوم. كل ملف PDF بيبقى مستند. لو اسم الملف بالشكل «العميل - القضية - المستند» البيانات بتتملي لوحدها.</p>
 <label>العميل (اختياري — لكل الملفات)</label><input id="imC" list="imcl"><datalist id="imcl">${[...new Set(docs.map(d=>d.client).filter(Boolean))].map(c=>`<option value="${esc(c)}">`).join("")}</datalist>
 <div class="row" style="margin-top:12px"><button class="btn" id="imPdf">📄 ملفات PDF</button><button class="btn sec" id="imImg">🖼️ صور (مستند واحد)</button><button class="btn sec" onclick="closeDlg()">إلغاء</button></div>`);
 const pick=(accept,multi,cb)=>{const i=document.createElement("input");i.type="file";i.accept=accept;i.multiple=multi;i.onchange=()=>cb([...i.files]);i.click()};
 $("#imPdf").onclick=()=>{const forced=$("#imC").value.trim();closeDlg();pick("application/pdf,.pdf",true,async files=>{if(!files.length)return;const b=$("#busy");busy(1);let ok=0,last=null;
  try{for(const [k,f] of files.entries()){try{const pages=await pdfToPages(f,(i,n)=>b.textContent=`استيراد ${k+1} من ${files.length} — صفحة ${i} من ${n}`);const m=fileMeta(f.name);
    const d={id:"d"+Date.now()+k,client:forced||m.client,caseNo:m.caseNo,title:m.title||"مستند مستورد",mode:"doc",pages,updated:Date.now(),imported:true};docs.push(d);save(d);ok++;last=d}catch(e){}}}
  finally{busy(0);b.textContent="جارٍ المعالجة…"}
  if(ok===1)openDoc(last.id);else home();if(ok<files.length)alert(`اتستورد ${ok} من ${files.length}. الباقي ملفات تالفة أو محمية بكلمة سر.`)})};
 $("#imImg").onclick=()=>{const forced=$("#imC").value.trim();closeDlg();pick("image/*",true,async files=>{if(!files.length)return;busy(1);const pages=[];
  try{for(const f of files){try{const c=imgToCanvas(await fileToImg(f),2000);pages.push({img:c.toDataURL("image/jpeg",.88),raw:c.toDataURL("image/jpeg",.8),filter:"orig"})}catch(e){}}}finally{busy(0)}
  if(!pages.length)return;const d={id:"d"+Date.now(),client:forced,caseNo:"",title:"صور مستوردة "+new Date().toLocaleDateString("ar-EG"),mode:"doc",pages,updated:Date.now()};docs.push(d);save(d);openDoc(d.id)})}};

/* ---------- الربط بالشاشات ---------- */
{const _home=window.home;window.home=function(){_home();const top=app.querySelector(".row");if(!top)return;
 top.insertAdjacentHTML("afterend",`<div class="row" style="margin:-4px 0 10px"><button class="btn sec" style="flex:1" onclick="importDlg()">📥 استيراد</button>
  <button class="btn sec" style="flex:1" onclick="indexScreen()">📇 الفهرس</button>
  <select id="sortSel" style="flex:1;width:auto">${[["DATE_DESC","الأحدث أولاً"],["DATE_ASC","الأقدم أولاً"],["NAME","بالاسم"]].map(([k,l])=>`<option value="${k}" ${prefs().sort===k?"selected":""}>${l}</option>`).join("")}</select></div>`);
 $("#sortSel").onchange=e=>{setPref("sort",e.target.value);renderList()}}}
{const _rd=window.renderDoc;window.renderDoc=function(){_rd();if(!cur)return;const d=cur,info=app.querySelector(".card");if(!info)return;
 const fv=fieldsFor(d.client).map(f=>[f,fval(d,f)]).filter(([f,v])=>v!==undefined&&v!==""&&v!==false);
 info.insertAdjacentHTML("beforeend",`${fv.length||(d.tags||[]).length?`<div class="note" style="margin-top:6px">${fv.map(([f,v])=>`<b>${esc(f.name)}:</b> ${esc(showVal(f,v))}`).join(" · ")}${(d.tags||[]).map(t=>` <span style="background:#eef4f5;border-radius:8px;padding:1px 7px">🏷️ ${esc(t)}</span>`).join("")}</div>`:""}
  <div class="row" style="margin-top:8px"><button class="btn sec" style="padding:7px 10px;font-size:13px" onclick="editDetails()">✏️ البيانات والحقول</button>
  ${d.ocrText?`<button class="btn sec" style="padding:7px 10px;font-size:13px" onclick="readingMode()">📖 وضع القراءة</button>`:""}</div>`)}}
})();
