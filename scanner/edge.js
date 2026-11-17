/* ============================================================
   كشف حواف الورقة بـ OpenCV — نقل مبسّط لـ EdgeDetector.kt في الأندرويد:
   أربع طرق (حواف Canny، المنطقة الفاتحة، المنطقة الغامقة، الأقل تشبّعاً)
   + طريقة إنقاذ (CLAHE) لو مالقيناش حاجة. كل مرشّح بياخد درجة
   (المساحة × الامتلاء²) والأحسن يكسب. لو OpenCV لسه ما اتحمّلش،
   بنرجع للكشف القديم الخفيف.
   ============================================================ */
"use strict";
(function(G){
let cv=null,loading=null;
function loadCV(){if(cv)return Promise.resolve(true);if(loading)return loading;
 loading=new Promise(res=>{
  const done=m=>{cv=m;res(true)}; // مايترجعش m نفسه: فيه then فالـ Promise يلف عليه للأبد
  const hook=()=>{const m=G.cv;if(!m||m.nodeType)return res(null);
   if(m.Mat)return done(m);
   if(typeof m.then==="function")return m.then(x=>done(x.Mat?x:m));
   m.onRuntimeInitialized=()=>done(m)};
  if(G.cv&&!G.cv.nodeType)return hook();
  if(typeof document==="undefined")return res(null);
  const s=document.createElement("script");s.src="opencv/opencv.js?v=410";s.async=true;s.onload=hook;s.onerror=()=>res(null);
  document.head.appendChild(s)});
 return loading}

const WORK=700,MIN_A=.08,MIN_A_SMALL=.02,MAX_A=.93,MAX_A_SMALL=.6,MIN_FILL=.8,EPS=[.015,.02,.03,.045,.06,.08];

function order(pts){ // tl,tr,br,bl
 let tl,tr,br,bl,a=1e9,b=-1e9,c=-1e9,d=1e9;
 for(const p of pts){const s=p[0]+p[1],t=p[0]-p[1];if(s<a){a=s;tl=p}if(s>b){b=s;br=p}if(t>c){c=t;tr=p}if(t<d){d=t;bl=p}}
 return[tl,tr,br,bl]}
function polyArea(q){let s=0;for(let i=0;i<4;i++){const p=q[i],n=q[(i+1)%4];s+=p[0]*n[1]-n[0]*p[1]}return Math.abs(s)/2}
function plausible(q){
 if(new Set(q.map(String)).size<4)return false;
 // محدّب + كل زاوية بين ٤٥ و١٣٥ درجة + مفيش ضلع أصغر من ١٢٪ من الأكبر
 let sign=0;const L=[];
 for(let i=0;i<4;i++){const a=q[(i+3)%4],b=q[i],c=q[(i+1)%4];
  const v1=[a[0]-b[0],a[1]-b[1]],v2=[c[0]-b[0],c[1]-b[1]];const cr=v1[0]*v2[1]-v1[1]*v2[0];
  if(cr===0)return false;const s=Math.sign(cr);if(sign&&s!==sign)return false;sign=s;
  const ang=Math.acos((v1[0]*v2[0]+v1[1]*v2[1])/(Math.hypot(...v1)*Math.hypot(...v2)))*180/Math.PI;
  if(ang<45||ang>135)return false;L.push(Math.hypot(...v2))}
 return Math.min(...L)>=Math.max(...L)*.12}
function ratioOf(q){const d=(p,r)=>Math.hypot(p[0]-r[0],p[1]-r[1]);
 const w=Math.max(d(q[0],q[1]),d(q[3],q[2])),h=Math.max(d(q[0],q[3]),d(q[1],q[2]));return Math.max(w,h)/Math.max(1,Math.min(w,h))}

function candidates(mask,frame,minA,maxA,exp,out){
 const cs=new cv.MatVector(),hi=new cv.Mat();
 try{cv.findContours(mask,cs,hi,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
  const list=[];for(let i=0;i<cs.size();i++){const c=cs.get(i);list.push([cv.contourArea(c),c])}
  list.sort((a,b)=>b[0]-a[0]);
  list.forEach(([area,c],k)=>{
   if(k<8&&area>=frame*minA&&area<=frame*maxA){
    let q=null;const peri=cv.arcLength(c,true);
    for(const e of EPS){const ap=new cv.Mat();cv.approxPolyDP(c,ap,e*peri,true);
     if(ap.rows===4){const p=[];for(let j=0;j<4;j++)p.push([ap.data32S[j*2],ap.data32S[j*2+1]]);q=order(p)}ap.delete();if(q)break}
    if(!q){const r=cv.minAreaRect(c),pts=cv.RotatedRect.points(r);const bq=order(pts.map(p=>[p.x,p.y]));
     if(area/Math.max(1,polyArea(bq))>=.9)q=bq}
    if(q&&plausible(q)){const qa=polyArea(q);const fill=Math.min(1,area/Math.max(1,qa));
     if(fill>=MIN_FILL&&qa>=frame*minA&&qa<=frame*maxA){let score=qa*fill*fill;let ok=true;
      if(exp){const diff=Math.abs(ratioOf(q)-exp)/exp;if(diff>.35)ok=false;else score*=Math.max(.1,1-diff/.35)}
      if(ok)out.push({q,score})}}}
   c.delete()})}
 finally{cs.delete();hi.delete()}}

function otsu(src){const t=new cv.Mat();const v=cv.threshold(src,t,0,255,cv.THRESH_BINARY|cv.THRESH_OTSU);t.delete();return v}
function edgeMask(bl,lo,hi){const e=new cv.Mat();if(lo==null){const o=otsu(bl);lo=o*.5;hi=o}cv.Canny(bl,e,lo,hi);
 const k=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(7,7));cv.morphologyEx(e,e,cv.MORPH_CLOSE,k);k.delete();return e}
function regionMask(bl,inv){const m=new cv.Mat();cv.threshold(bl,m,0,255,(inv?cv.THRESH_BINARY_INV:cv.THRESH_BINARY)|cv.THRESH_OTSU);
 const k=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(5,5));cv.morphologyEx(m,m,cv.MORPH_CLOSE,k);cv.morphologyEx(m,m,cv.MORPH_OPEN,k);k.delete();return m}
function chromaMask(rgba){const rgb=new cv.Mat(),hsv=new cv.Mat(),ch=new cv.MatVector(),s=new cv.Mat(),m=new cv.Mat();
 try{cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,hsv,cv.COLOR_RGB2HSV);cv.split(hsv,ch);
  const sat=ch.get(1);cv.GaussianBlur(sat,s,new cv.Size(5,5),0);sat.delete();
  cv.threshold(s,m,0,255,cv.THRESH_BINARY_INV|cv.THRESH_OTSU);
  const k=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(5,5));cv.morphologyEx(m,m,cv.MORPH_CLOSE,k);cv.morphologyEx(m,m,cv.MORPH_OPEN,k);k.delete();return m}
 finally{rgb.delete();hsv.delete();ch.delete();s.delete()}}

/* img: canvas أو {data,width,height}. exp: نسبة متوقعة (البطاقة 1.586) أو null. يرجّع الأركان بإحداثيات الصورة أو null */
function detectCV(img,exp){if(!cv)return null;
 const W0=img.width,H0=img.height,k=Math.min(1,WORK/Math.max(W0,H0));
 let id;if(img.getContext){const t=document.createElement("canvas");t.width=Math.round(W0*k);t.height=Math.round(H0*k);
  t.getContext("2d").drawImage(img,0,0,t.width,t.height);id=t.getContext("2d").getImageData(0,0,t.width,t.height)}else id=img;
 const kk=id.width/W0;
 const src=cv.matFromImageData(id),gray=new cv.Mat(),bl=new cv.Mat();const out=[];
 try{cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,bl,new cv.Size(5,5),0);
  const frame=id.width*id.height,minA=exp?MIN_A_SMALL:MIN_A,maxA=exp?MAX_A_SMALL:MAX_A;
  const run=m=>{try{candidates(m,frame,minA,maxA,exp,out)}finally{m.delete()}};
  run(edgeMask(bl));run(regionMask(bl,false));run(regionMask(bl,true));run(chromaMask(src));
  if(!out.length){const cl=new cv.CLAHE(3,new cv.Size(8,8)),eq=new cv.Mat(),eb=new cv.Mat();
   try{cl.apply(bl,eq);cv.GaussianBlur(eq,eb,new cv.Size(5,5),0);run(edgeMask(eb));run(regionMask(eb,false));run(regionMask(eb,true));run(edgeMask(bl,20,60));run(edgeMask(bl,10,35))}
   finally{cl.delete();eq.delete();eb.delete()}}}
 catch(e){return null}
 finally{src.delete();gray.delete();bl.delete()}
 if(!out.length)return null;out.sort((a,b)=>b.score-a.score);
 return out[0].q.map(p=>[Math.max(0,Math.min(W0,p[0]/kk)),Math.max(0,Math.min(H0,p[1]/kk))])}

G.loadCV=loadCV;G.detectCV=detectCV;G.cvReady=()=>!!cv;G.quadRatio=ratioOf;
if(typeof document!=="undefined")setTimeout(loadCV,300);
if(typeof module!=="undefined")module.exports={loadCV,detectCV,_set:m=>{cv=m}};
})(typeof window!=="undefined"?window:globalThis);
