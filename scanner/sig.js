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
 hitsBody(t,px,py){return px>=t.x&&px<=t.x+t.w&&py>=t.y&&py<=t.y+t.h}
};
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
function extractSignature(img){
 const WORK=1600,INK=170,AF=140,AN=225,SPECK=25,MARGIN=12;
 const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,s=Math.min(1,WORK/Math.max(iw,ih));
 const w=Math.max(1,Math.round(iw*s)),h=Math.max(1,Math.round(ih*s));
 const c=document.createElement("canvas");c.width=w;c.height=h;const cx=c.getContext("2d");cx.drawImage(img,0,0,w,h);
 const px=cx.getImageData(0,0,w,h).data,N=w*h,g=new Float32Array(N);
 for(let i=0;i<N;i++)g[i]=.299*px[i*4]+.587*px[i*4+1]+.114*px[i*4+2];
 // إضاءة الورقة: متوسط واسع (بديل الـ median blur) ثم القسمة عليه
 const R=Math.max(15,Math.round(Math.max(w,h)/16)),I=new Float64Array((w+1)*(h+1));
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
  keep.push(area>=SPECK&&!border);n++}
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
  od.data[k]=px[i*4];od.data[k+1]=px[i*4+1];od.data[k+2]=px[i*4+2];od.data[k+3]=a}
 ox.putImageData(od,0,0);return o}
window.extractSignatureJS=extractSignature; // للاختبار

function photoSignature(){return new Promise(resolve=>{
 const inp=document.createElement("input");inp.type="file";inp.accept="image/*";inp.setAttribute("capture","environment");
 inp.onchange=async()=>{const f=inp.files[0];if(!f)return resolve(null);
  try{busy(1);const im=await fileToImg(f);await new Promise(r=>setTimeout(r,30));const out=extractSignature(im);busy(0);
   if(!out){alert("لم يُعثر على توقيع واضح في الصورة. صوّر التوقيع على ورقة بيضاء في إضاءة جيدة، وخلّي الورقة تملأ الصورة.");return resolve(null)}
   resolve(out.toDataURL("image/png"))}catch(e){busy(0);resolve(null)}};
 inp.click()})}

/* ---------- مكتبة التوقيعات ---------- */
function libraryDialog(){return new Promise(resolve=>{
 const render=()=>{const a=loadSigs();
  dialog(`<h3 style="margin-top:0">مكتبة التوقيعات</h3>
  ${a.length?`<div class="sigLib">${a.map(s=>`<div><img src="${s.img}" data-pick="${s.id}"><button data-del="${s.id}" title="حذف من المكتبة">✕</button></div>`).join("")}</div>`
   :`<p class="note">لا توجد توقيعات محفوظة بعد.</p>`}
  <div class="row" style="margin-top:8px"><button class="btn" data-new>✍️ توقيع جديد</button><button class="btn sec" data-photo>📷 تصوير توقيع</button><button class="btn sec" data-close>إغلاق</button></div>`);
  const box=$("#dlgBox");
  box.querySelectorAll("[data-pick]").forEach(e=>e.onclick=()=>{closeDlg();resolve(a.find(s=>s.id===e.dataset.pick).img)});
  box.querySelectorAll("[data-del]").forEach(e=>e.onclick=ev=>{ev.stopPropagation();if(!confirm("حذف هذا التوقيع من المكتبة؟"))return;saveSigs(loadSigs().filter(s=>s.id!==e.dataset.del));render()});
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
  for(const e of entries){const r=e.t;x.drawImage(e.img,ox+r.x*t,oy+r.y*t,r.w*t,r.h*t)}
  const a=entries.find(e=>e.id===activeId);
  if(a){const r=a.t,X=ox+r.x*t,Y=oy+r.y*t,W=r.w*t,H=r.h*t;x.strokeStyle="#e9622f";x.lineWidth=2;x.strokeRect(X,Y,W,H);
   for(const [cx,cy] of [[X,Y],[X+W,Y],[X+W,Y+H],[X,Y+H]]){x.beginPath();x.arc(cx,cy,11,0,7);x.fillStyle="#fff";x.fill();x.beginPath();x.arc(cx,cy,7,0,7);x.fillStyle="#e9622f";x.fill()}}
  tools()}
 function add(img,frac){const w=PW*frac,h=w*img.height/Math.max(1,img.width);const e={id:"o"+Date.now()+Math.random(),img,t:T.centered(PW,PH,w,h)};
  entries.push(e);activeId=e.id;draw()}

 /* كل اللمس على منطقة الصفحة: Pointer Events + touch-action:none.
    الهدف يُحدَّد عند أول ضغطة (مقبض المحدد ← جسم توقيع ← صفحة فارغة). */
 const ptrs=new Map();let g=null;
 const cen=()=>{let sx=0,sy=0;for(const p of ptrs.values()){sx+=p.x;sy+=p.y}return[sx/ptrs.size,sy/ptrs.size]};
 const spread=()=>{const v=[...ptrs.values()];return v.length<2?0:Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y)};
 const local=e=>{const r=cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
 cv.addEventListener("pointerdown",e=>{e.preventDefault();try{cv.setPointerCapture(e.pointerId)}catch(_){}
  ptrs.set(e.pointerId,local(e));
  if(ptrs.size===1){const p=local(e),[ix,iy]=toImg(p.x,p.y),b=base(),t=b.s*viewZoom;
   const act=entries.find(o=>o.id===activeId);const handle=act?T.hitHandle(act.t,ix,iy,HANDLE_SLOP/t):null;
   let target=handle!=null?act:null;if(!target)for(let i=entries.length-1;i>=0;i--)if(T.hitsBody(entries[i].t,ix,iy)){target=entries[i];break}
   if(target)activeId=target.id;
   g={target,handle,ix,iy,moved:false,start:p};}
  if(g){const [cx,cy]=cen();g.cx=cx;g.cy=cy;g.sp=spread()}draw()});
 cv.addEventListener("pointermove",e=>{if(!ptrs.has(e.pointerId)||!g)return;e.preventDefault();ptrs.set(e.pointerId,local(e));
  const [cx,cy]=cen(),sp=spread(),dx=cx-g.cx,dy=cy-g.cy,zoom=(g.sp>0&&sp>0&&ptrs.size>1)?sp/g.sp:1;
  g.cx=cx;g.cy=cy;g.sp=sp;
  if(Math.hypot(cx-g.start.x,cy-g.start.y)>6||zoom!==1)g.moved=true;
  const b=base(),t=b.s*viewZoom;
  if(g.target&&g.handle!=null&&ptrs.size===1)g.target.t=T.clampTo(T.resized(g.target.t,g.handle,dx/t,dy/t),PW,PH);
  else if(g.target)g.target.t=T.clampTo(T.scaledBy(T.moved(g.target.t,dx/t,dy/t),zoom),PW,PH);
  else{if(zoom!==1){const nz=Math.min(6,Math.max(1,viewZoom*zoom)),f=nz/viewZoom,ox=b.bx+panX,oy=b.by+panY;
     panX=cx-(cx-ox)*f-b.bx;panY=cy-(cy-oy)*f-b.by;viewZoom=nz}
   if(viewZoom>1){panX+=dx;panY+=dy}else{panX=0;panY=0}}
  draw()});
 const end=e=>{if(!ptrs.has(e.pointerId))return;ptrs.delete(e.pointerId);
  if(ptrs.size&&g){const [cx,cy]=cen();g.cx=cx;g.cy=cy;g.sp=spread();return}
  if(g&&!g.moved&&!g.target){ // ضغطة على صفحة فارغة: انقل التوقيع المحدد إليها
   const s=entries.find(o=>o.id===activeId);if(s){const r=s.t;s.t=T.clampTo(T.moved(r,g.ix-(r.x+r.w/2),g.iy-(r.y+r.h/2)),PW,PH)}}
  g=null;draw()};
 cv.addEventListener("pointerup",end);cv.addEventListener("pointercancel",end);
 // منع تكبير Safari للصفحة كلها أثناء القرصة
 ["gesturestart","gesturechange"].forEach(n=>area.addEventListener(n,e=>e.preventDefault()));

 let toolsKey="";
 function tools(){const tb=d.querySelector(".tools");const key=[!!activeId,viewZoom>1,entries.length].join();if(key===toolsKey)return;toolsKey=key;
  tb.innerHTML=`<button class="btn sec" data-add>✍️ إضافة توقيع</button><button class="btn sec" data-stamp>📅 ختم التاريخ</button>
   ${activeId?`<button class="btn sec" data-delsel style="color:#b91c1c">🗑️ حذف المحدد</button>`:""}
   ${viewZoom>1?`<button class="btn sec" data-fit>⤢ ملء الشاشة</button>`:""}`;
  tb.querySelector("[data-add]").onclick=async()=>{const u=await libraryDialog();if(u)add(await loadImg(u),.35)};
  tb.querySelector("[data-stamp]").onclick=()=>{const n=new Date(),p=v=>String(v).padStart(2,"0");add(textStamp(`${n.getFullYear()}/${p(n.getMonth()+1)}/${p(n.getDate())}`),.22)};
  const ds=tb.querySelector("[data-delsel]");if(ds)ds.onclick=()=>{const i=entries.findIndex(o=>o.id===activeId);if(i>=0)entries.splice(i,1);activeId=null;draw()};
  const ft=tb.querySelector("[data-fit]");if(ft)ft.onclick=()=>{viewZoom=1;panX=panY=0;draw()};
  const ok=d.querySelector("[data-ok]");if(ok)ok.disabled=!entries.length,ok.style.opacity=entries.length?1:.5}
 d.querySelector(".acts").innerHTML=`<button class="btn sec" data-cancel>إلغاء</button><button class="btn warn" data-ok>✔ دمج على الصفحة</button>`;
 const done=r=>{window.removeEventListener("resize",rs);d.remove();resolve(r)};
 const rs=()=>{dim=sizeCanvas(cv);draw()};window.addEventListener("resize",rs);
 d.querySelector("[data-x]").onclick=d.querySelector("[data-cancel]").onclick=()=>done(null);
 d.querySelector("[data-ok]").onclick=()=>{if(!entries.length)return; // OverlayCompositor: دمج نهائي بدقة الصفحة
  const o=document.createElement("canvas");o.width=PW;o.height=PH;const ox=o.getContext("2d");ox.drawImage(page,0,0);
  for(const e of entries)ox.drawImage(e.img,e.t.x,e.t.y,e.t.w,e.t.h);done(o.toDataURL("image/jpeg",.9))};
 requestAnimationFrame(()=>{dim=sizeCanvas(cv);draw()});
 })}

/* ---------- الربط مع صفحات المستند ---------- */
window.signPage=async function(i){const p=cur&&cur.pages[i];if(!p)return;
 const out=await overlayScreen(p.img);if(!out)return;p.img=out;p.signed=true;save(cur);renderDoc()};
window.signatureLibrary=async function(){await libraryDialog()};
})();
