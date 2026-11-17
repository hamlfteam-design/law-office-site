/* ============================================================
   قراءة النص (OCR) عربي + إنجليزي والتلخيص — مطابقة لـ OcrEngine
   و Summarizer في الأندرويد. يعمل على الجهاز بدون إنترنت بعد أول تحميل
   (Tesseract.js بنفس ملفات اللغة tessdata المستخدمة في الأندرويد).
   ============================================================ */
"use strict";
let _tess=null;
function loadTesseract(){if(window.Tesseract)return Promise.resolve();
 return _tess||(_tess=new Promise((res,rej)=>{const s=document.createElement("script");s.src="ocr/tesseract.min.js";s.onload=res;s.onerror=()=>{_tess=null;rej()};document.head.appendChild(s)}))}
async function ocrPages(pages,langs,progress){await loadTesseract();
 const base=new URL("ocr/",location.href).href;
 const w=await Tesseract.createWorker(langs||"ara+eng",1,{workerPath:base+"worker.min.js",corePath:base,langPath:base.replace(/\/$/,""),gzip:false,
  logger:m=>{if(m.status==="recognizing text"&&progress)progress(m.progress)}});
 const out=[];try{for(let i=0;i<pages.length;i++){if(progress)progress(0,i,pages.length);
  const {data}=await w.recognize(pages[i].img);out.push(data.text.trim())}}finally{await w.terminate()}
 return out.join("\n\n")}

/* Summarizer: تلخيص استخراجي — جمل منقولة حرفياً من النص، لا يخترع شيئاً */
const STOP=new Set(("من إلى الى عن على في و او أو ثم أن ان إن الذي التي الذين هذا هذه ذلك تلك كان كانت يكون لم لن لا ما مع بعد قبل بين كل بعض هو هي هم أنه انه أنها انها قد كما حيث أي اي له لها لهم به بها هذين هذان الا إلا "+
 "the a an of to and or in on for is are was were be this that these those it as by with at from which who shall will").split(" "));
function summarize(text){const t=(text||"").trim();if(!t)return null;
 const sents=t.split(/(?<=[.!?؟。\n])\s+/).map(s=>s.trim()).filter(Boolean);if(sents.length<4)return null;
 const tok=s=>s.toLowerCase().split(/[\s،,.;:!?؟()\[\]"'«»\-–—]+/).filter(w=>w.length>1&&!STOP.has(w));
 const sw=sents.map(tok),freq=new Map();sw.forEach(ws=>ws.forEach(w=>freq.set(w,(freq.get(w)||0)+1)));if(!freq.size)return null;
 const n=sents.length,sc=sw.map((ws,i)=>{if(!ws.length)return 0;const top=ws.reduce((a,w)=>a+freq.get(w),0)/ws.length;return top*((i===0||i===n-1)?1+Math.log(Math.max(2,n)):1)});
 const take=Math.min(8,n,Math.max(1,Math.floor(n*.2)));
 return sc.map((s,i)=>i).sort((a,b)=>sc[b]-sc[a]).slice(0,take).sort((a,b)=>a-b).map(i=>sents[i]).join("\n")}
window.summarizeText=summarize;

window.runOcr=async function(){if(!cur||!cur.pages.length)return;const d=cur;
 const b=$("#busy");busy(1);const set=t=>b.textContent=t;set("جاري تجهيز قراءة النص…");
 try{d.ocrText=await ocrPages(d.pages,prefs().ocrLangs,(p,i,n)=>set(n?`جاري قراءة النص… صفحة ${i+1} من ${n}`:`جاري قراءة النص… ${Math.round(p*100)}٪`));
  d.summary="";save(d);if(cur===d)renderDoc()}
 catch(e){alert("تعذّر تشغيل قراءة النص. أول مرة لازم يكون فيه إنترنت عشان يتحمّل ملف اللغة، وبعد كده بيشتغل من غير نت.")}
 finally{busy(0);set("جارٍ المعالجة…")}};
window.runSummary=function(){if(!cur)return;const s=summarize(cur.ocrText);
 if(!s){alert("النص قصير جداً على التلخيص.");return}cur.summary=s;save(cur);renderDoc()};
window.copyOcr=async function(which){const t=which==="s"?cur.summary:cur.ocrText;try{await navigator.clipboard.writeText(t);$("#ocrMsg").textContent="✅ اتنسخ"}catch(e){$("#ocrMsg").textContent="انسخه يدوياً من المربع"}};
window.shareOcr=function(){navigator.share?navigator.share({title:cur.title,text:cur.ocrText}).catch(()=>{}):copyOcr()};
function ocrCard(d){return `<div class="card" style="margin-top:14px"><div class="row" style="align-items:center"><h3 style="margin:0;font-size:15px;flex:1">🔤 النص المستخرج</h3>
 <button class="btn sec" onclick="runOcr()">${d.ocrText?"↻ إعادة القراءة":"استخراج النص"}</button></div>
 ${d.ocrText?`<textarea readonly style="width:100%;min-height:140px;margin-top:8px;border:1px solid var(--line);border-radius:10px;padding:10px;font:inherit;direction:rtl">${esc(d.ocrText)}</textarea>
  <div class="row" style="margin-top:8px"><button class="btn sec" onclick="copyOcr()">📋 نسخ</button><button class="btn sec" onclick="shareOcr()">📤 مشاركة النص</button><button class="btn sec" onclick="runSummary()">📝 تلخيص</button></div>
  ${d.summary?`<div class="card" style="margin-top:8px;background:#faf8f3"><b>الملخص</b><div style="white-space:pre-wrap;margin-top:6px;line-height:1.7">${esc(d.summary)}</div><button class="btn sec" style="margin-top:6px" onclick="copyOcr('s')">📋 نسخ الملخص</button></div>`:""}
  <p class="note" id="ocrMsg"></p>`:`<p class="note">بيقرا العربي والإنجليزي من صفحات المستند، وتقدر تنسخه أو تلخّصه أو تدوّر بيه.</p>`}</div>`}
{const _rd=window.renderDoc;window.renderDoc=function(){_rd();if(!cur)return;
 const exp=[...app.querySelectorAll(".card")].pop();if(exp)exp.insertAdjacentHTML("beforebegin",ocrCard(cur))}}

/* ---------- اتجاه الصفحة والبطاقة تلقائياً (PageOrientation / CardOrientation) ----------
   تتقرا الصفحة بـ Tesseract بأكتر من اتجاه، والاتجاه اللي فيه أكتر كلمات مقروءة بثقة عالية
   يكسب؛ والبطاقة تتقرا كما هي ومقلوبة ١٨٠° وتتلف فقط لو القراءة المقلوبة أوضح بفرق واضح. */
function rotCanvas(src,deg){if(!deg)return src;const c=document.createElement("canvas");const s=deg%180!==0;c.width=s?src.height:src.width;c.height=s?src.width:src.height;
 const x=c.getContext("2d");x.translate(c.width/2,c.height/2);x.rotate(deg*Math.PI/180);x.drawImage(src,-src.width/2,-src.height/2);return c}
function shrink(c,edge){const f=Math.min(1,edge/Math.max(c.width,c.height));if(f>=1)return c;const o=document.createElement("canvas");o.width=Math.round(c.width*f);o.height=Math.round(c.height*f);o.getContext("2d").drawImage(c,0,0,o.width,o.height);return o}
async function readStats(w,c){const {data}=await w.recognize(c);const ws=(data.words||[]).filter(x=>x.text&&x.text.trim().length>1);
 return{good:ws.filter(x=>x.confidence>=70).length,mean:ws.length?ws.reduce((a,x)=>a+x.confidence,0)/ws.length:0}}
async function orientWorker(){await loadTesseract();const base=new URL("ocr/",location.href).href;
 const w=await Tesseract.createWorker(prefs().ocrLangs||"ara+eng",1,{workerPath:base+"worker.min.js",corePath:base,langPath:base.replace(/\/$/,""),gzip:false});
 await w.setParameters({tessedit_pageseg_mode:"11"});return w}
async function pageRotation(w,canvas){const s=shrink(canvas,1000),cnt={0:(await readStats(w,s)).good};
 // Tesseract.js بيقرا جزء من الصفحة المقلوبة ١٨٠° بثقة، فبنقارن بالمقلوب دايماً، والجانبين بس لو القراءة ضعيفة
 cnt[180]=(await readStats(w,rotCanvas(s,180))).good;
 if(cnt[0]<15)for(const d of [90,270])cnt[d]=(await readStats(w,rotCanvas(s,d))).good;
 let best=0;for(const d of [90,180,270])if((cnt[d]||0)>cnt[best])best=d;
 return best&&cnt[best]>=8&&cnt[best]>=cnt[0]*2+3?best:0}
async function cardRotation(w,canvas){const s=shrink(canvas,1200),a=(await readStats(w,s)).mean,b=(await readStats(w,rotCanvas(s,180))).mean;return b-a>=5?180:0}
/* يعدّل اتجاه صفحات اتصورت للتو؛ لو ملفات القراءة مش متاحة يسيب الصفحات زي ما هي */
window.autoOrient=async function(d,fromIndex,progress){let w;try{w=await orientWorker()}catch(e){return}
 try{for(let i=fromIndex;i<d.pages.length;i++){progress&&progress(i-fromIndex+1,d.pages.length-fromIndex);const p=d.pages[i];
   const im=new Image();im.src=p.img;await im.decode();const c=document.createElement("canvas");c.width=im.width;c.height=im.height;c.getContext("2d").drawImage(im,0,0);
   const isCard=d.mode==="id"||detectFormat(c.width,c.height)==="ID_CARD";const deg=isCard?await cardRotation(w,c):await pageRotation(w,c);
   if(deg){p.img=rotCanvas(c,deg).toDataURL("image/jpeg",.9);p.rot=((p.rot||0)+deg)%360}}}
 catch(e){}finally{try{await w.terminate()}catch(e){}}};
