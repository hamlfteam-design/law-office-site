/* ============================================================
   الكاميرا المباشرة والمسح المستمر — مطابقة لـ CameraScreen و PageFinder
   و QuadStabilizer في الأندرويد: حدود الورقة تظهر وهي بتتلقط، والتصوير
   بضغطة واحدة لكل ورقة والكاميرا تفضل مفتوحة، و«تم» تنهي الجلسة وتعالج
   كل الصفحات مرة واحدة (قص + تعديل الميل + الفلتر الافتراضي) بدون شاشة القص.
   ============================================================ */
"use strict";
(function(){
const css=`#camScr{position:fixed;inset:0;background:#000;z-index:16;display:flex;flex-direction:column;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
#camScr .vw{flex:1;position:relative;overflow:hidden}#camScr video,#camScr canvas.ov{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
#camScr .tb{display:flex;align-items:center;gap:8px;padding:10px;color:#fff}#camScr .tb span{flex:1;font-size:14px}
#camScr .bb{display:flex;align-items:center;justify-content:space-around;padding:14px 10px 18px}
#camScr .shut{width:74px;height:74px;border-radius:50%;border:5px solid #fff;background:#e36414;box-shadow:0 0 0 3px #e36414}
#camScr .shut:active{transform:scale(.92)}#camScr .thumb{width:52px;height:68px;border-radius:6px;border:2px solid #fff;object-fit:cover;background:#222}
#camScr .bdg{min-width:44px;height:44px;border-radius:22px;border:2px solid #fff;background:transparent;color:#fff;font-weight:700}
#camScr .bdg.on{background:#e36414;border-color:#e36414}#camScr .flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .15s}`;
const st=document.createElement("style");st.textContent=css;document.head.appendChild(st);

/* QuadStabilizer: كشف مختلف لازم يتكرر في الإطار التالي قبل ما يستبدل المقبول */
function stabilizer(){let acc=null,cand=null;const TOL=.08;
 const diag=q=>Math.hypot(q[2][0]-q[0][0],q[2][1]-q[0][1])||1;
 const same=(a,b)=>a.every((p,i)=>Math.hypot(p[0]-b[i][0],p[1]-b[i][1])<=diag(a)*TOL);
 return{push(q){if(!q){cand=null;return acc}if(!acc||same(acc,q)){acc=q.map((p,i)=>acc?[acc[i][0]*.6+p[0]*.4,acc[i][1]*.6+p[1]*.4]:p);cand=null}
   else if(cand&&same(cand,q)){acc=q;cand=null}else cand=q;return acc},reset(){acc=cand=null}}}

window.openCamera=async function(){if(!cur)return;
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){$("#camIn").click();return}
 let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:3840},height:{ideal:2160}}})}
 catch(e){alert("مقدرتش أفتح الكاميرا جوه التطبيق (اسمح بالكاميرا من إعدادات Safari). هفتح كاميرا الآيفون العادية بدلها.");$("#camIn").click();return}
 const d=document.createElement("div");d.id="camScr";
 const isId=()=>cur.mode==="id",single=()=>prefs().captureMode==="single";
 d.innerHTML=`<div class="tb"><button class="btn sec" data-x>✕</button><span id="camInfo">وجّه الكاميرا على الورقة</span>
  <button class="bdg" data-mode title="طريقة التصوير" style="padding:0 10px;width:auto"></button>
  <button class="bdg ${isId()?"on":""}" data-id title="هوية: وجه وظهر على ورقة واحدة">ID</button><button class="bdg" data-ocr title="قراءة النص">أب</button></div>
  <div class="vw"><video playsinline muted autoplay></video><canvas class="ov"></canvas><div class="flash"></div></div>
  <div class="bb"><img class="thumb" alt=""><button class="shut" aria-label="تصوير"></button><button class="btn warn" data-done>✅ تم</button></div>`;
 document.body.appendChild(d);
 const v=d.querySelector("video"),ov=d.querySelector("canvas.ov"),ox=ov.getContext("2d"),stab=stabilizer();v.srcObject=stream;
 try{await v.play()}catch(e){}
 let quad=null,running=true,shots=0;const small=document.createElement("canvas");
 function geom(){const r=ov.getBoundingClientRect(),dpr=devicePixelRatio||1;ov.width=r.width*dpr;ov.height=r.height*dpr;
  const s=Math.min(r.width/v.videoWidth,r.height/v.videoHeight);return{dpr,s,ox:(r.width-v.videoWidth*s)/2,oy:(r.height-v.videoHeight*s)/2}}
 function loop(){if(!running)return;
  if(v.videoWidth){const W=320,k=W/Math.max(v.videoWidth,v.videoHeight);small.width=Math.round(v.videoWidth*k);small.height=Math.round(v.videoHeight*k);
   small.getContext("2d").drawImage(v,0,0,small.width,small.height);
   let q=detectQuad(small);const fb=q[0][0]===.05*small.width&&q[0][1]===.05*small.height;q=fb?null:q.map(p=>[p[0]/k,p[1]/k]);
   quad=stab.push(q);const g=geom();ox.setTransform(g.dpr,0,0,g.dpr,0,0);ox.clearRect(0,0,ov.width,ov.height);
   if(quad){ox.beginPath();quad.forEach((p,i)=>{const X=g.ox+p[0]*g.s,Y=g.oy+p[1]*g.s;i?ox.lineTo(X,Y):ox.moveTo(X,Y)});ox.closePath();
    ox.fillStyle="rgba(227,100,20,.18)";ox.fill();ox.strokeStyle="#e36414";ox.lineWidth=3;ox.stroke()}
   $("#camInfo").textContent=hint()+(quad?" ✓":"")+(shots&&!isId()?` · ${shots} صفحة`:"")}
  setTimeout(()=>requestAnimationFrame(loop),180)}
 const hint=()=>isId()?(shots%2===0?"صوّر الوجه الأمامي":"اقلب وصوّر الوجه الخلفي"):(single()?"تصوير فردي — صفحة واحدة":"تصوير دفعات — صوّر كل الصفحات ثم «تم»");
 const modeBtn=d.querySelector("[data-mode]"),showMode=()=>modeBtn.textContent=single()?"فردي":"دفعات";showMode();
 modeBtn.onclick=()=>{setPref("captureMode",single()?"batch":"single");showMode()};
 loop();
 const frame=()=>{const c=document.createElement("canvas");const m=Math.min(1,2200/Math.max(v.videoWidth,v.videoHeight));
  c.width=Math.round(v.videoWidth*m);c.height=Math.round(v.videoHeight*m);c.getContext("2d").drawImage(v,0,0,c.width,c.height);return{c,m}};
 d.querySelector(".shut").onclick=()=>{if(!v.videoWidth)return;const {c,m}=frame();
  pending.push(Object.assign(c,{_quad:quad?quad.map(p=>[p[0]*m,p[1]*m]):null}));shots++;
  const fl=d.querySelector(".flash");fl.style.opacity=.8;setTimeout(()=>fl.style.opacity=0,120);d.querySelector(".thumb").src=c.toDataURL("image/jpeg",.5);
  navigator.vibrate&&navigator.vibrate(15);stab.reset();
  // فردي: صفحة واحدة (أو وش وضهر في وضع الهوية) وبعدين سؤال الحفظ على طول
  if(single()&&(!isId()||shots%2===0))setTimeout(finish,250)};
 d.querySelector("[data-id]").onclick=e=>{cur.mode=cur.mode==="id"?"doc":"id";save(cur);e.target.classList.toggle("on",cur.mode==="id")};
 const finish=()=>{close();askSave(()=>openCamera())};
 d.querySelector("[data-ocr]").onclick=async()=>{if(!v.videoWidth)return;const {c}=frame();busy(1);
  try{const t=await ocrPages([{img:c.toDataURL("image/jpeg",.9)}],prefs().ocrLangs);busy(0);
   dialog(`<h3 style="margin-top:0">النص</h3><textarea readonly style="width:100%;min-height:180px;font:inherit;border:1px solid var(--line);border-radius:10px;padding:10px">${esc(t)}</textarea>
   <div class="row" style="margin-top:8px"><button class="btn sec" onclick="navigator.clipboard.writeText(this.closest('.box').querySelector('textarea').value)">📋 نسخ</button><button class="btn" onclick="closeDlg()">إغلاق</button></div>`);
   $("#dlg").style.zIndex=40}catch(e){busy(0);alert("تعذّر تشغيل قراءة النص.")}};
 const close=()=>{running=false;stream.getTracks().forEach(t=>t.stop());d.remove();$("#dlg").style.zIndex=""};
 d.querySelector("[data-x]").onclick=()=>{close();if(pending.length)askSave(()=>openCamera());else renderDoc()};
 d.querySelector("[data-done]").onclick=finish;
};

/* بعد انتهاء التصوير: سؤال الحفظ، وبعده المعالجة التلقائية كاملة */
window.askSave=function(again){if(!pending.length){renderDoc();return}const n=pending.length;
 const idNote=cur.mode==="id"?(n%2?"<p class=\"note\">⚠️ عدد الصور فردي — آخر صورة هتتحفظ لوحدها على ورقة.</p>":"<p class=\"note\">كل وجه وظهر هيتحطوا فوق بعض على ورقة واحدة.</p>"):"";
 dialog(`<h3 style="margin-top:0">تم تصوير ${n} ${cur.mode==="id"?"صورة":"صفحة"}</h3><p>حفظ في «${esc(cur.title)}»؟ البرنامج هيظبط الحواف والمقاس والفلتر لوحده.</p>${idNote}
 <div class="row"><button class="btn" style="flex:1" id="svOk">💾 حفظ</button>${again?`<button class="btn sec" id="svMore">📷 تصوير المزيد</button>`:""}<button class="btn danger" id="svNo">تجاهل</button></div>`);
 $("#svOk").onclick=()=>{closeDlg();autoProcess()};
 if(again)$("#svMore").onclick=()=>{closeDlg();again()};
 $("#svNo").onclick=()=>{pending.length=0;closeDlg();
  // مستند جديد اتصوّر تجربة ومالوش صفحات: يتشال على طول
  if(!cur.pages.length){del(cur.id);docs=docs.filter(x=>x!==cur);home()}else renderDoc()}};

/* يحط وش وضهر (بطاقة/جواز/أي هوية) فوق بعض على ورقة A4 واحدة */
window.idSheet=async function(a,b){const load=async s=>{const im=new Image();im.src=s;await im.decode();return im};
 const A=document.createElement("canvas");A.width=1654;A.height=2339;const x=A.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,A.width,A.height);
 const boxW=A.width*.82,boxH=A.height*.40;const ims=[await load(a)];if(b)ims.push(await load(b));
 ims.forEach((im,i)=>{const f=Math.min(boxW/im.width,boxH/im.height),w=im.width*f,h=im.height*f,cx=A.width/2,cy=A.height*(i?.73:.27);
  x.drawImage(im,cx-w/2,cy-h/2,w,h);x.strokeStyle="#d0d0d0";x.lineWidth=2;x.strokeRect(cx-w/2,cy-h/2,w,h)});
 return A.toDataURL("image/jpeg",.9)};

/* المعالجة بعد «تم»: لكل صفحة كشف الحواف ← تعديل الميل ← مقاس A4/بطاقة ← الفلتر الافتراضي */
window.autoProcess=async function(){if(!pending.length){renderDoc();return}const b=$("#busy");let n=pending.length;busy(1);
 const f=normFilter(prefs().defaultFilter);let i=0;
 try{while(pending.length){const c=pending.shift();i++;b.textContent=`جاري معالجة الصفحات… ${i} من ${n}`;await new Promise(r=>setTimeout(r,20));
  if(window.loadCV&&i===1){b.textContent="جاري تجهيز كشف الحواف…";await loadCV()}
  const q=(window.detectCV&&detectCV(c,cur.mode==="id"?1.586:null))||c._quad||detectQuad(c);const nf=normalizeFormat(warp(c,q));const out=applyFilterX(nf.canvas,f);
  cur.pages.push({img:out.toDataURL("image/jpeg",.88),raw:c.toDataURL("image/jpeg",.8),quad:q,filter:f,format:nf.format})}
  save(cur);
  if(window.autoOrient){await autoOrient(cur,cur.pages.length-n,(k,t)=>b.textContent=`جاري ضبط اتجاه الصفحات… ${k} من ${t}`);save(cur)}
  // الهوية: وضع ID، أو صورتين اتعرفوا تلقائياً إنهم بطاقة → وش وضهر على ورقة واحدة
  const fresh=cur.pages.splice(cur.pages.length-n,n);const autoCard=n===2&&fresh.every(p=>p.format==="ID_CARD");
  if(cur.mode==="id"||autoCard){b.textContent="جاري تجهيز ورقة الهوية…";
   for(let k=0;k<fresh.length;k+=2){const fr=fresh[k],bk=fresh[k+1];
    cur.pages.push({img:await idSheet(fr.img,bk&&bk.img),sides:[fr,bk].filter(Boolean),filter:fr.filter,format:"ID_SHEET"})}}
  else cur.pages.push(...fresh);
  save(cur);n=0;
  // تصحيح الاتجاه تلقائياً (الصفحة المقلوبة أو بالعرض، والبطاقة المقلوبة)
}
 finally{busy(0);b.textContent="جارٍ المعالجة…";renderDoc()}};
})();
