/* ============================================================
   التوقيع والختم — نسخة الآيفون (مطابقة لـ SignatureOverlayScreen
   و SignaturePadScreen و SignatureExtractor و OverlayTransform في الأندرويد)
   ============================================================ */
(function(){
"use strict";
const MIN_SIZE=24;           // OverlayTransform.MIN_SIZE
const HANDLE_SLOP=28;        // px على الشاشة (28dp في الأندرويد)
const SIG_KEY="lpsigs";

/* ---------- مكتبة التوقيعات المحفوظة ---------- */
function loadSigs(){try{return JSON.parse(localStorage.getItem(SIG_KEY)||"[]")}catch(e){return[]}}
function saveSigs(a){try{localStorage.setItem(SIG_KEY,JSON.stringify(a));return true}catch(e){return false}}
function addSig(url){const a=loadSigs();a.unshift({id:"s"+Date.now(),img:url});
 if(!saveSigs(a))alert("تعذّر حفظ التوقيع في المكتبة (المساحة ممتلئة).");return a[0]}

/* ---------- OverlayTransform (منطق مطابق للأندرويد) ---------- */
const T={
 corner(t,h){return[[t.x,t.y],[t.x+t.w,t.y],[t.x+t.w,t.y+t.h],[t.x,t.y+t.h]][h]},
 moved(t,dx,dy){return{...t,x:t.x+dx,y:t.y+dy}},
 resized(t,h,dx,dy){const [ax,ay]=T.corner(t,(h+2)%4),[mx,my]=T.corner(t,h),nx=mx+dx,ny=my+dy;
  const w=Math.max(MIN_SIZE,Math.abs(nx-ax)),hh=Math.max(MIN_SIZE,Math.abs(ny-ay));
  return{...t,x:nx>=ax?ax:ax-w,y:ny>=ay?ay:ay-hh,w,h:hh}},
 scaledBy(t,f){if(f<=0)return t;f=Math.max(f,MIN_SIZE/Math.max(1,Math.min(t.w,t.h)));const w=t.w*f,h=t.h*f;
  return{...t,x:t.x+(t.w-w)/2,y:t.y+(t.h-h)/2,w,h}},
 clampTo(t,PW,PH){const w=Math.max(MIN_SIZE,Math.min(t.w,Math.max(MIN_SIZE,PW))),h=Math.max(MIN_SIZE,Math.min(t.h,Math.max(MIN_SIZE,PH)));
  return{...t,w,h,x:Math.min(Math.max(0,t.x),Math.max(0,PW-w)),y:Math.min(Math.max(0,t.y),Math.max(0,PH-h))}},
 centered(PW,PH,w,h){w=Math.min(w,PW);h=Math.min(h,PH);return{x:(PW-w)/2,y:(PH-h)/2,w,h}},
 hitHandle(t,px,py,slop){let best=null,bd=1e9;for(let i=0;i<4;i++){const [cx,cy]=T.corner(t,i),d=Math.hypot(cx-px,cy-py);if(d<bd){bd=d;best=i}}
  return bd<=slop?best:null},
 hitsBody(t,px,py){return px>=t.x&&px<=t.x+t.w&&py>=t.y&&py<=t.y+t.h},
 // التدوير: نحوّل النقطة لإطار التوقيع نفسه (قبل الدوران) حوالين مركزه
 local(t,px,py){const a=-(t.a||0);if(!a)return[px,py];const cx=t.x+t.w/2,cy=t.y+t.h/2,dx=px-cx,dy=py-cy;
  return[cx+dx*Math.cos(a)-dy*Math.sin(a),cy+dx*Math.sin(a)+dy*Math.cos(a)]},
 vec(t,dx,dy){const a=-(t.a||0);return a?[dx*Math.cos(a)-dy*Math.sin(a),dx*Math.sin(a)+dy*Math.cos(a)]:[dx,dy]}
};
function drawRot(ctx,img,t,ox,oy,s){const cx=ox+(t.x+t.w/2)*s,cy=oy+(t.y+t.h/2)*s;ctx.save();ctx.translate(cx,cy);ctx.rotate(t.a||0);
 if(img)ctx.drawImage(img,-t.w*s/2,-t.h*s/2,t.w*s,t.h*s);return()=>ctx.restore()}
window.OverlayTransformJS=T; // للاختبار

/* ---------- واجهة مشتركة ---------- */
const css=`#sigEd{position:fixed;inset:0;touch-action:none;background:#000;z-index:15;display:flex;flex-direction:column;
 padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
#sigEd .top{display:flex;align-items:center;gap:8px;padding:10px;color:#fff}
#sigEd .top span{flex:1;font-size:15px;font-weight:600}
#sigEd .area{flex:1;position:relative;overflow:hidden;margin:8px;touch-action:none;-webkit-user-select:none;user-select:none}
#sigEd .area canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}
#sigEd .tools{display:flex;gap:6px;overflow-x:auto;padding:6px 10px;touch-action:pan-x;flex-wrap:wrap;justify-content:center}
#sigEd .acts,#sigEd .top{touch-action:manipulation}
#sigEd .tools .btn,#sigEd .acts .btn{padding:10px 12px;font-size:14px;white-space:nowrap}
#sigEd .acts{display:flex;gap:10px;padding:8px 14px 12px}
#sigEd .acts .btn{flex:1}
.sigLib{display:flex;gap:8px;overflow-x:auto;padding:10px 0}
.sigLib div{position:relative;flex:0 0 auto}
.sigLib img{width:96px;height:96px;object-fit:contain;background:#ededed;border-radius:8px;cursor:pointer}
.sigLib button{position:absolute;top:2px;left:2px;border:0;background:rgba(0,0,0,.55);color:#fff;border-radius:50%;width:24px;height:24px;font-size:12px}`;
const st=document.createElement("style");st.textContent=css;document.head.appendChild(st);

function shell(title){const d=document.createElement("div");d.id="sigEd";
 d.innerHTML=`<div class="top"><button class="btn sec" data-x>✕</button><span>${title}</span></div><div class="area"><canvas></canvas></div><div class="tools"></div><div class="acts"></div>`;
 document.body.appendChild(d);return d}
function sizeCanvas(cv){const r=cv.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
 cv.width=Math.max(1,Math.round(r.width*dpr));cv.height=Math.max(1,Math.round(r.height*dpr));return{w:r.width,h:r.height,dpr}}
function trimToInk(c){const x=c.getContext("2d"),d=x.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=-1,y1=-1;
 for(let y=0;y<c.height;y++)for(let X=0;X<c.width;X++)if(d[(y*c.width+X)*4+3]>10){if(X<x0)x0=X;if(X>x1)x1=X;if(y<y0)y0=y;if(y>y1)y1=y}
 if(x1<0)return null;const m=12;x0=Math.max(0,x0-m);y0=Math.max(0,y0-m);x1=Math.min(c.width-1,x1+m);y1=Math.min(c.height-1,y1+m);
 const o=document.createElement("canvas");o.width=x1-x0+1;o.height=y1-y0+1;o.getContext("2d").drawImage(c,-x0,-y0);return o}

/* ---------- توقيع بالرسم (SignaturePadScreen) ---------- */
function padScreen(){return new Promise(resolve=>{
 const d=shell("ارسم توقيعك");const cv=d.querySelector("canvas"),area=d.querySelector(".area");area.style.background="#fff";area.style.borderRadius="12px";
 let dim=sizeCanvas(cv);const x=cv.getContext("2d");let strokes=[],curS=null,color="#0b2a8a";
 function draw(){x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,cv.width,cv.height);x.setTransform(dim.dpr,0,0,dim.dpr,0,0);
  x.lineCap="round";x.lineJoin="round";
  for(const s of strokes){x.strokeStyle=s.c;x.lineWidth=3.2;x.beginPath();s.p.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));
   if(s.p.length===1)x.lineTo(s.p[0][0]+.1,s.p[0][1]);x.stroke()}}
 cv.addEventListener("pointerdown",e=>{e.preventDefault();cv.setPointerCapture(e.pointerId);const r=cv.getBoundingClientRect();
  curS={c:color,p:[[e.clientX-r.left,e.clientY-r.top]]};strokes.push(curS);draw()});
 cv.addEventListener("pointermove",e=>{if(!curS)return;e.preventDefault();const r=cv.getBoundingClientRect();
  const ev=e.getCoalescedEvents?e.getCoalescedEvents():[e];for(const q of ev)curS.p.push([q.clientX-r.left,q.clientY-r.top]);draw()});
 const up=()=>{curS=null};cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);
 d.querySelector(".tools").innerHTML=`<button class="btn chip on" data-c="#0b2a8a">أزرق</button><button class="btn chip" data-c="#111">أسود</button><button class="btn sec" data-u>↶ تراجع</button><button class="btn sec" data-clr>مسح</button>`;
 d.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{color=b.dataset.c;d.querySelectorAll("[data-c]").forEach(o=>o.classList.toggle("on",o===b))});
 d.querySelector("[data-u]").onclick=()=>{strokes.pop();draw()};
 d.querySelector("[data-clr]").onclick=()=>{strokes=[];draw()};
 d.querySelector(".acts").innerHTML=`<button class="btn sec" data-cancel>إلغاء</button><button class="btn warn" data-ok>حفظ التوقيع</button>`;
 const done=r=>{window.removeEventListener("resize",rs);d.remove();resolve(r)};
 const rs=()=>{dim=sizeCanvas(cv);strokes=[];draw()};window.addEventListener("resize",rs);
 d.querySelector("[data-x]").onclick=d.querySelector("[data-cancel]").onclick=()=>done(null);
 d.querySelector("[data-ok]").onclick=()=>{if(!strokes.length)return;
  // إعادة الرسم بدقة أعلى على خلفية شفافة
  const k=3,o=document.createElement("canvas");o.width=Math.round(dim.w*k);o.height=Math.round(dim.h*k);const ox=o.getContext("2d");
  ox.scale(k,k);ox.lineCap="round";ox.lineJoin="round";
  for(const s of strokes){ox.strokeStyle=s.c;ox.lineWidth=3.2;ox.beginPath();s.p.forEach((p,i)=>i?ox.lineTo(p[0],p[1]):ox.moveTo(p[0],p[1]));if(s.p.length===1)ox.lineTo(s.p[0][0]+.1,s.p[0][1]);ox.stroke()}
  const t=trimToInk(o);done(t?t.toDataURL("image/png"):null)};
 requestAnimationFrame(()=>{dim=sizeCanvas(cv);draw()});
})}

/* ---------- توقيع بتصوير ورقة (SignatureExtractor) ---------- */
/* مرحلتين: الأولى على صورة مصغّرة تحدد مكان التوقيع، والتانية تقص المكان ده من
   الصورة الأصلية بدقتها الكاملة وتعيد الاستخلاص عليه → PNG شفاف بوضوح عالي */
function extractSignature(img){
 const first=extractPass(img,1600,true);if(!first)return null;
 const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,k=iw/first.w,pad=Math.round(40*k);
 const sx=Math.max(0,Math.round(first.x0*k)-pad),sy=Math.max(0,Math.round(first.y0*k)-pad),
  sw=Math.min(iw-sx,Math.round((first.x1-first.x0)*k)+pad*2),sh=Math.min(ih-sy,Math.round((first.y1-first.y0)*k)+pad*2);
 const crop=document.createElement("canvas");crop.width=sw;crop.height=sh;crop.getContext("2d").drawImage(img,sx,sy,sw,sh,0,0,sw,sh);
 const hi=extractPass(crop,2400,false);return hi?hi.canvas:first.canvas}
function extractPass(img,WORK,dropBorder){
 const INK=170,AF=140,AN=225,MARGIN=12;
 const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,s=Math.min(1,WORK/Math.max(iw,ih));
 const w=Math.max(1,Math.round(iw*s)),h=Math.max(1,Math.round(ih*s));
 const c=document.createElement("canvas");c.width=w;c.height=h;const cx=c.getContext("2d");cx.drawImage(img,0,0,w,h);
 const px=cx.getImageData(0,0,w,h).data,N=w*h,g=new Float32Array(N);
 for(let i=0;i<N;i++)g[i]=.299*px[i*4]+.587*px[i*4+1]+.114*px[i*4+2];
 // إضاءة الورقة: متوسط واسع (بديل الـ median blur) ثم القسمة عليه
 const SPECK=Math.max(25,Math.round(N/40000)),R=Math.max(15,Math.round(Math.max(w,h)/(dropBorder?16:6))),I=new Float64Array((w+1)*(h+1));
 for(let y=1;y<=h;y++){let r=0;for(let x=1;x<=w;x++){r+=g[(y-1)*w+x-1];I[y*(w+1)+x]=I[(y-1)*(w+1)+x]+r}}
 const nv=new Float32Array(N),ink=new Uint8Array(N);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const x1=Math.max(0,x-R),y1=Math.max(0,y-R),x2=Math.min(w,x+R+1),y2=Math.min(h,y+R+1);
  const m=(I[y2*(w+1)+x2]-I[y1*(w+1)+x2]-I[y2*(w+1)+x1]+I[y1*(w+1)+x1])/((x2-x1)*(y2-y1));
  // الحبر يُخفض المتوسط قليلاً؛ نرفع تقدير الورقة نحو الأفتح
  const v=g[y*w+x]/Math.max(1,m*1.04)*255;nv[y*w+x]=v;ink[y*w+x]=v<INK?1:0}
 // المكوّنات المتصلة: حذف النقط الصغيرة وما يلمس حافة الصورة
 const lab=new Int32Array(N).fill(-1),keep=[];let n=0;const stck=new Int32Array(N);
 for(let i=0;i<N;i++){if(!ink[i]||lab[i]>=0)continue;let sp=0,area=0,border=false;stck[sp++]=i;lab[i]=n;
  while(sp){const p=stck[--sp];area++;const X=p%w,Y=(p/w)|0;if(X<=1||Y<=1||X>=w-2||Y>=h-2)border=true;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const xx=X+dx,yy=Y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;
    const q=yy*w+xx;if(ink[q]&&lab[q]<0){lab[q]=n;stck[sp++]=q}}}
  keep.push(area>=SPECK&&!(dropBorder&&border));n++}
 let x0=w,y0=h,x1=-1,y1=-1;
 for(let i=0;i<N;i++)if(lab[i]>=0&&keep[lab[i]]){const X=i%w,Y=(i/w)|0;if(X<x0)x0=X;if(X>x1)x1=X;if(Y<y0)y0=Y;if(Y>y1)y1=Y}
 if(x1<0)return null;
 const near=new Uint8Array(N);
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*w+x;if(lab[i]<0||!keep[lab[i]])continue;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<w&&yy<h)near[yy*w+xx]=1}}
 const cx0=Math.max(0,x0-MARGIN),cy0=Math.max(0,y0-MARGIN),cx1=Math.min(w-1,x1+MARGIN),cy1=Math.min(h-1,y1+MARGIN),ow=cx1-cx0+1,oh=cy1-cy0+1;
 const o=document.createElement("canvas");o.width=ow;o.height=oh;const ox=o.getContext("2d"),od=ox.createImageData(ow,oh);
 for(let y=cy0;y<=cy1;y++)for(let x=cx0;x<=cx1;x++){const i=y*w+x,k=((y-cy0)*ow+(x-cx0))*4;
  const a=near[i]?Math.max(0,Math.min(1,(AN-nv[i])/(AN-AF)))*255:0;
  // لون الحبر نفسه بس أغمق وأوضح (الصورة بتطلع الحبر باهت)
  od.data[k]=px[i*4]*.55;od.data[k+1]=px[i*4+1]*.55;od.data[k+2]=Math.min(255,px[i*4+2]*.75);od.data[k+3]=a}
 ox.putImageData(od,0,0);return{canvas:o,w,h,x0,y0,x1,y1}}
window.extractSignatureJS=extractSignature; // للاختبار

function photoSignature(){return new Promise(resolve=>{
 const inp=document.createElement("input");inp.type="file";inp.accept="image/*";inp.setAttribute("capture","environment");
 inp.onchange=async()=>{const f=inp.files[0];if(!f)return resolve(null);
  try{busy(1);const im=await fileToImg(f);await new Promise(r=>setTimeout(r,30));const out=extractSignature(im);busy(0);
   if(!out){alert("لم يُعثر على توقيع واضح في الصورة. صوّر التوقيع على ورقة بيضاء في إضاءة جيدة، وخلّي الورقة تملأ الصورة.");return resolve(null)}
   const u=out.toDataURL("image/png");const c=await cropScreen(u);resolve(c||u)}catch(e){busy(0);resolve(null)}};
 inp.click()})}

/* ---------- قص التوقيع: لو اتصوّر معاه كلمة أو جزء زيادة ---------- */
async function cropScreen(url){const img=await loadImg(url),IW=img.naturalWidth,IH=img.naturalHeight;
 return new Promise(resolve=>{
 const d=shell("قص التوقيع — حرّك الأركان حوالين التوقيع بس");const cv=d.querySelector("canvas"),x=cv.getContext("2d");
 let dim=sizeCanvas(cv);let r={x:0,y:0,w:IW,h:IH};
 const fit=()=>{const s=Math.min(dim.w/IW,dim.h/IH)*.92;return{s,ox:(dim.w-IW*s)/2,oy:(dim.h-IH*s)/2}};
 function draw(){const {s,ox,oy}=fit();x.setTransform(dim.dpr,0,0,dim.dpr,0,0);x.clearRect(0,0,dim.w,dim.h);
  // مربعات شطرنج علشان الشفافية تبان
  const q=12;for(let yy=0;yy<IH*s;yy+=q)for(let xx=0;xx<IW*s;xx+=q){x.fillStyle=((xx/q+yy/q)&1)?"#ddd":"#fff";x.fillRect(ox+xx,oy+yy,Math.min(q,IW*s-xx),Math.min(q,IH*s-yy))}
  x.drawImage(img,ox,oy,IW*s,IH*s);
  x.fillStyle="rgba(0,0,0,.55)";const X=ox+r.x*s,Y=oy+r.y*s,W=r.w*s,H=r.h*s;
  x.fillRect(ox,oy,IW*s,Y-oy);x.fillRect(ox,Y+H,IW*s,oy+IH*s-Y-H);x.fillRect(ox,Y,X-ox,H);x.fillRect(X+W,Y,ox+IW*s-X-W,H);
  x.strokeStyle="#e9622f";x.lineWidth=2;x.strokeRect(X,Y,W,H);
  for(const [cx,cy] of [[X,Y],[X+W,Y],[X+W,Y+H],[X,Y+H]]){x.beginPath();x.arc(cx,cy,13,0,7);x.fillStyle="#fff";x.fill();x.beginPath();x.arc(cx,cy,8,0,7);x.fillStyle="#e9622f";x.fill()}}
 let g=null;const loc=e=>{const b=cv.getBoundingClientRect(),{s,ox,oy}=fit();return[(e.clientX-b.left-ox)/s,(e.clientY-b.top-oy)/s]};
 cv.addEventListener("pointerdown",e=>{e.preventDefault();try{cv.setPointerCapture(e.pointerId)}catch(_){}const [px,py]=loc(e),{s}=fit();
  const cs=[[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]];let h=-1,bd=34/s;cs.forEach((c,i)=>{const dd=Math.hypot(c[0]-px,c[1]-py);if(dd<bd){bd=dd;h=i}});
  g={h,px,py,r0:{...r}}});
 cv.addEventListener("pointermove",e=>{if(!g)return;e.preventDefault();const [px,py]=loc(e),dx=px-g.px,dy=py-g.py,o=g.r0,M=20;
  if(g.h<0){r={...o,x:Math.max(0,Math.min(IW-o.w,o.x+dx)),y:Math.max(0,Math.min(IH-o.h,o.y+dy))}}
  else{let x0=o.x,y0=o.y,x1=o.x+o.w,y1=o.y+o.h;if(g.h===0||g.h===3)x0=Math.min(x1-M,Math.max(0,x0+dx));else x1=Math.max(x0+M,Math.min(IW,x1+dx));
   if(g.h<2)y0=Math.min(y1-M,Math.max(0,y0+dy));else y1=Math.max(y0+M,Math.min(IH,y1+dy));r={x:x0,y:y0,w:x1-x0,h:y1-y0}}
  draw()});
 const up=()=>{g=null};cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);
 d.querySelector(".acts").innerHTML=`<button class="btn sec" data-cancel>إلغاء</button><button class="btn sec" data-full>الكل</button><button class="btn warn" data-ok>✔ قص</button>`;
 const done=v=>{window.removeEventListener("resize",rs);d.remove();resolve(v)};const rs=()=>{dim=sizeCanvas(cv);draw()};window.addEventListener("resize",rs);
 d.querySelector("[data-x]").onclick=d.querySelector("[data-cancel]").onclick=()=>done(null);
 d.querySelector("[data-full]").onclick=()=>{r={x:0,y:0,w:IW,h:IH};draw()};
 d.querySelector("[data-ok]").onclick=()=>{const o=document.createElement("canvas");o.width=Math.round(r.w);o.height=Math.round(r.h);
  o.getContext("2d").drawImage(img,r.x,r.y,r.w,r.h,0,0,o.width,o.height);const t=trimToInk(o)||o;done(t.toDataURL("image/png"))};
 requestAnimationFrame(()=>{dim=sizeCanvas(cv);draw()})})}
window.cropSignature=cropScreen;

/* ---------- مكتبة التوقيعات ---------- */
function libraryDialog(){return new Promise(resolve=>{
 const render=()=>{const a=loadSigs();
  dialog(`<h3 style="margin-top:0">مكتبة التوقيعات</h3>
  ${a.length?`<div class="sigLib">${a.map(s=>`<div><img src="${s.img}" data-pick="${s.id}"><button data-del="${s.id}" title="حذف من المكتبة">✕</button><button data-crop="${s.id}" title="قص" style="left:auto;right:4px">✂️</button></div>`).join("")}</div>`
   :`<p class="note">لا توجد توقيعات محفوظة بعد.</p>`}
  <div class="row" style="margin-top:8px"><button class="btn" data-new>✍️ توقيع جديد</button><button class="btn sec" data-photo>📷 تصوير توقيع</button><button class="btn sec" data-close>إغلاق</button></div>`);
  const box=$("#dlgBox");
  box.querySelectorAll("[data-pick]").forEach(e=>e.onclick=()=>{closeDlg();resolve(a.find(s=>s.id===e.dataset.pick).img)});
  box.querySelectorAll("[data-del]").forEach(e=>e.onclick=ev=>{ev.stopPropagation();if(!confirm("حذف هذا التوقيع من المكتبة؟"))return;saveSigs(loadSigs().filter(s=>s.id!==e.dataset.del));render()});
  box.querySelectorAll("[data-crop]").forEach(e=>e.onclick=async ev=>{ev.stopPropagation();closeDlg();const a2=loadSigs(),it=a2.find(s=>s.id===e.dataset.crop);
   const c=it&&await cropScreen(it.img);if(c){it.img=c;saveSigs(a2)}render()});
  box.querySelector("[data-new]").onclick=async()=>{closeDlg();const u=await padScreen();if(u){addSig(u);resolve(u)}else resolve(null)};
  box.querySelector("[data-photo]").onclick=async()=>{closeDlg();const u=await photoSignature();if(u){addSig(u);resolve(u)}else resolve(null)};
  box.querySelector("[data-close]").onclick=()=>{closeDlg();resolve(null)}};
 render()})}

function textStamp(text,size=64){const c=document.createElement("canvas"),x=c.getContext("2d");const f=`bold ${size}px -apple-system,Tahoma,sans-serif`;
 x.font=f;const pad=Math.round(size*.3),w=Math.ceil(x.measureText(text).width+pad*2),h=Math.ceil(size*1.25+pad*2);
 c.width=w;c.height=h;x.font=f;x.fillStyle="#000";x.textBaseline="middle";x.fillText(text,pad,h/2);return c}
function loadImg(src){return new Promise((r,j)=>{const i=new Image();i.onload=()=>r(i);i.onerror=j;i.src=src})}

/* ---------- وضع التوقيع على الصفحة (SignatureOverlayScreen) ---------- */
async function overlayScreen(pageSrc){
 const page=await loadImg(pageSrc),PW=page.naturalWidth,PH=page.naturalHeight;
 return new Promise(resolve=>{
 const d=shell("التوقيع");const cv=d.querySelector("canvas"),area=d.querySelector(".area"),x=cv.getContext("2d");
 let dim=sizeCanvas(cv);const entries=[];let activeId=null,viewZoom=1,panX=0,panY=0;
 const base=()=>{const s=Math.min(dim.w/PW,dim.h/PH);return{s,bx:(dim.w-PW*s)/2,by:(dim.h-PH*s)/2}};
 const toImg=(sx,sy)=>{const b=base(),t=b.s*viewZoom;return[(sx-(b.bx+panX))/t,(sy-(b.by+panY))/t]};
 function draw(){const b=base(),t=b.s*viewZoom,ox=b.bx+panX,oy=b.by+panY;
  x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,cv.width,cv.height);x.setTransform(dim.dpr,0,0,dim.dpr,0,0);
  x.drawImage(page,ox,oy,PW*t,PH*t);
  for(const e of entries)drawRot(x,e.img,e.t,ox,oy,t)();
  const a=entries.find(e=>e.id===activeId);
  if(a){const r=a.t,W=r.w*t,H=r.h*t,X=-W/2,Y=-H/2;const done=drawRot(x,null,r,ox,oy,t);x.strokeStyle="#e9622f";x.lineWidth=2;x.strokeRect(X,Y,W,H);
   for(const [cx,cy] of [[X,Y],[X+W,Y],[X+W,Y+H],[X,Y+H]]){x.beginPath();x.arc(cx,cy,11,0,7);x.fillStyle="#fff";x.fill();x.beginPath();x.arc(cx,cy,7,0,7);x.fillStyle="#e9622f";x.fill()}
   done()}
  tools()}
 function add(img,frac){const w=PW*frac,h=w*img.height/Math.max(1,img.width);const e={id:"o"+Date.now()+Math.random(),img,t:T.centered(PW,PH,w,h)};
  entries.push(e);activeId=e.id;draw()}

 /* كل اللمس على منطقة الصفحة: Pointer Events + touch-action:none.
    الهدف يُحدَّد عند أول ضغطة (مقبض المحدد ← جسم توقيع ← صفحة فارغة). */
 const ptrs=new Map();let g=null;
 const cen=()=>{let sx=0,sy=0;for(const p of ptrs.values()){sx+=p.x;sy+=p.y}return[sx/ptrs.size,sy/ptrs.size]};
 const angle=()=>{const v=[...ptrs.values()];return v.length<2?0:Math.atan2(v[1].y-v[0].y,v[1].x-v[0].x)};
 const spread=()=>{const v=[...ptrs.values()];return v.length<2?0:Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y)};
 const local=e=>{const r=cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
 cv.addEventListener("pointerdown",e=>{e.preventDefault();try{cv.setPointerCapture(e.pointerId)}catch(_){}
  ptrs.set(e.pointerId,local(e));
  if(ptrs.size===1){const p=local(e),[ix,iy]=toImg(p.x,p.y),b=base(),t=b.s*viewZoom;
   const act=entries.find(o=>o.id===activeId);const handle=act?T.hitHandle(act.t,...T.local(act.t,ix,iy),HANDLE_SLOP/t):null;
   let target=handle!=null?act:null;if(!target)for(let i=entries.length-1;i>=0;i--)if(T.hitsBody(entries[i].t,...T.local(entries[i].t,ix,iy))){target=entries[i];break}
   if(target)activeId=target.id;
   g={target,handle,ix,iy,moved:false,start:p};}
  if(g){const [cx,cy]=cen();g.cx=cx;g.cy=cy;g.sp=spread();g.ang=angle()}draw()});
 cv.addEventListener("pointermove",e=>{if(!ptrs.has(e.pointerId)||!g)return;e.preventDefault();ptrs.set(e.pointerId,local(e));
  const [cx,cy]=cen(),sp=spread(),dx=cx-g.cx,dy=cy-g.cy,zoom=(g.sp>0&&sp>0&&ptrs.size>1)?sp/g.sp:1;
  const an=angle();let dAng=(ptrs.size>1&&g.ang!=null)?an-g.ang:0;if(dAng>Math.PI)dAng-=2*Math.PI;if(dAng<-Math.PI)dAng+=2*Math.PI;g.ang=an;
  g.cx=cx;g.cy=cy;g.sp=sp;if(dAng)g.moved=true;
  if(Math.hypot(cx-g.start.x,cy-g.start.y)>6||zoom!==1)g.moved=true;
  const b=base(),t=b.s*viewZoom;
  if(g.target&&g.handle!=null&&ptrs.size===1){const [lx,ly]=T.vec(g.target.t,dx/t,dy/t);g.target.t=T.clampTo(T.resized(g.target.t,g.handle,lx,ly),PW,PH)}
  else if(g.target){const nt=T.clampTo(T.scaledBy(T.moved(g.target.t,dx/t,dy/t),zoom),PW,PH);nt.a=(g.target.t.a||0)+dAng;g.target.t=nt}
  else{if(zoom!==1){const nz=Math.min(6,Math.max(1,viewZoom*zoom)),f=nz/viewZoom,ox=b.bx+panX,oy=b.by+panY;
     panX=cx-(cx-ox)*f-b.bx;panY=cy-(cy-oy)*f-b.by;viewZoom=nz}
   if(viewZoom>1){panX+=dx;panY+=dy}else{panX=0;panY=0}}
  draw()});
 const end=e=>{if(!ptrs.has(e.pointerId))return;ptrs.delete(e.pointerId);
  if(ptrs.size&&g){const [cx,cy]=cen();g.cx=cx;g.cy=cy;g.sp=spread();g.ang=angle();return}
  if(g&&!g.moved&&!g.target){ // ضغطة على صفحة فارغة: انقل التوقيع المحدد إليها
   const s=entries.find(o=>o.id===activeId);if(s){const r=s.t;s.t=T.clampTo(T.moved(r,g.ix-(r.x+r.w/2),g.iy-(r.y+r.h/2)),PW,PH)}}
  g=null;draw()};
 cv.addEventListener("pointerup",end);cv.addEventListener("pointercancel",end);
 // منع تكبير Safari للصفحة كلها أثناء القرصة
 ["gesturestart","gesturechange"].forEach(n=>area.addEventListener(n,e=>e.preventDefault()));

 let toolsKey="";
 function tools(){const tb=d.querySelector(".tools");const key=[!!activeId,viewZoom>1,entries.length].join();/*a*/if(key===toolsKey)return;toolsKey=key;
  tb.innerHTML=`<button class="btn sec" data-add>✍️ إضافة توقيع</button><button class="btn sec" data-stamp>📅 ختم التاريخ</button>
   ${activeId?`<button class="btn sec" data-rl>↺ لف</button><button class="btn sec" data-rr>↻ لف</button><button class="btn sec" data-sm>➖ أصغر</button><button class="btn sec" data-bg>➕ أكبر</button><button class="btn sec" data-delsel style="color:#b91c1c">🗑️ حذف المحدد</button>`:""}
   ${viewZoom>1?`<button class="btn sec" data-fit>⤢ ملء الشاشة</button>`:""}`;
  tb.querySelector("[data-add]").onclick=async()=>{const u=await libraryDialog();if(u)add(await loadImg(u),.35)};
  tb.querySelector("[data-stamp]").onclick=()=>{const n=new Date(),p=v=>String(v).padStart(2,"0");add(textStamp(`${n.getFullYear()}/${p(n.getMonth()+1)}/${p(n.getDate())}`),.22)};
  const sel=()=>entries.find(o=>o.id===activeId);
  const rot=deg=>{const e=sel();if(e){e.t={...e.t,a:(e.t.a||0)+deg*Math.PI/180};draw()}};
  const scl=f=>{const e=sel();if(e){const a=e.t.a;e.t=T.clampTo(T.scaledBy(e.t,f),PW,PH);e.t.a=a;draw()}};
  [["[data-rl]",()=>rot(-5)],["[data-rr]",()=>rot(5)],["[data-sm]",()=>scl(1/1.1)],["[data-bg]",()=>scl(1.1)]].forEach(([q,fn])=>{const bt=tb.querySelector(q);if(bt)bt.onclick=fn});
  const ds=tb.querySelector("[data-delsel]");if(ds)ds.onclick=()=>{const i=entries.findIndex(o=>o.id===activeId);if(i>=0)entries.splice(i,1);activeId=null;draw()};
  const ft=tb.querySelector("[data-fit]");if(ft)ft.onclick=()=>{viewZoom=1;panX=panY=0;draw()};
  const ok=d.querySelector("[data-ok]");if(ok)ok.disabled=!entries.length,ok.style.opacity=entries.length?1:.5}
 d.querySelector(".acts").innerHTML=`<button class="btn sec" data-cancel>إلغاء</button><button class="btn warn" data-ok>✔ دمج على الصفحة</button>`;
 const done=r=>{window.removeEventListener("resize",rs);d.remove();resolve(r)};
 const rs=()=>{dim=sizeCanvas(cv);draw()};window.addEventListener("resize",rs);
 d.querySelector("[data-x]").onclick=d.querySelector("[data-cancel]").onclick=()=>done(null);
 d.querySelector("[data-ok]").onclick=()=>{if(!entries.length)return; // OverlayCompositor: دمج نهائي بدقة الصفحة
  const o=document.createElement("canvas");o.width=PW;o.height=PH;const ox=o.getContext("2d");ox.drawImage(page,0,0);
  for(const e of entries)drawRot(ox,e.img,e.t,0,0,1)();done(o.toDataURL("image/jpeg",.9))};
 requestAnimationFrame(()=>{dim=sizeCanvas(cv);draw()});
 })}

/* ---------- الربط مع صفحات المستند ---------- */
window.signPage=async function(i){const p=cur&&cur.pages[i];if(!p)return;
 const out=await overlayScreen(p.img);if(!out)return;p.img=out;p.signed=true;save(cur);renderDoc()};
window.signatureLibrary=async function(){await libraryDialog()};
})();
