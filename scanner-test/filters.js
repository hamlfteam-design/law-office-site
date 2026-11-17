/* ============================================================
   الفلاتر ومقاس الورق — مطابقة لـ ImageProcessor و AutoEnhance
   و DocumentFormat في نسخة الأندرويد
   ============================================================ */
(function(){
"use strict";
// نفس ترتيب وأسماء PageFilter في الأندرويد
const FILTERS=[["auto","تحسين تلقائي"],["noshadow","بدون ظل"],["orig","أصلي"],["magic","مستند ملوّن"],
 ["gray","تدرّج رمادي"],["bw","أبيض وأسود"],["lighten","تفتيح"],["economy","توفير"]];
const norm=f=>f==="enh"?"auto":(FILTERS.some(x=>x[0]===f)?f:"auto");
const clamp=v=>v<0?0:v>255?255:v;

/* تقدير خلفية ناعمة (إضاءة الورقة) على نسخة مصغّرة ثم تكبيرها — بديل GaussianBlur الواسع */
function smoothField(src,w,h,divisor,channels){ // src: Uint8ClampedArray RGBA
 const S=256,s=Math.min(1,S/Math.max(w,h)),sw=Math.max(1,Math.round(w*s)),sh=Math.max(1,Math.round(h*s));
 const full=document.createElement("canvas");full.width=w;full.height=h;full.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(src),w,h),0,0);
 const sm=document.createElement("canvas");sm.width=sw;sm.height=sh;const sx=sm.getContext("2d");sx.imageSmoothingQuality="high";sx.drawImage(full,0,0,sw,sh);
 const id=sx.getImageData(0,0,sw,sh),d=id.data;
 const k=Math.max(w,h)/divisor*s,r=Math.max(1,Math.round(k/5));
 const tmp=new Float32Array(sw*sh);
 for(const ch of channels){const a=new Float32Array(sw*sh);for(let i=0;i<sw*sh;i++)a[i]=d[i*4+ch];
  for(let pass=0;pass<3;pass++){ // تمويه صندوقي ×3 ≈ جاوسي، مع تكرار الحافة (BORDER_REPLICATE)
   for(let y=0;y<sh;y++){let acc=0;for(let x=-r;x<=r;x++)acc+=a[y*sw+Math.min(sw-1,Math.max(0,x))];
    for(let x=0;x<sw;x++){tmp[y*sw+x]=acc/(2*r+1);acc+=a[y*sw+Math.min(sw-1,x+r+1)]-a[y*sw+Math.max(0,x-r)]}}
   for(let x=0;x<sw;x++){let acc=0;for(let y=-r;y<=r;y++)acc+=tmp[Math.min(sh-1,Math.max(0,y))*sw+x];
    for(let y=0;y<sh;y++){a[y*sw+x]=acc/(2*r+1);acc+=tmp[Math.min(sh-1,y+r+1)*sw+x]-tmp[Math.max(0,y-r)*sw+x]}}}
  for(let i=0;i<sw*sh;i++)d[i*4+ch]=a[i]}
 sx.putImageData(id,0,0);const out=full.getContext("2d");out.imageSmoothingQuality="high";out.clearRect(0,0,w,h);out.drawImage(sm,0,0,w,h);
 return out.getImageData(0,0,w,h).data}

function removeShadow(d,w,h,divisor){const bg=smoothField(d,w,h,divisor,[0,1,2]);
 for(let i=0;i<d.length;i+=4)for(let c=0;c<3;c++)d[i+c]=clamp(d[i+c]/Math.max(1,bg[i+c])*255)}
function whiteBalance(d){let r=0,g=0,b=0,n=d.length/4;for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2]}
 r/=n;g/=n;b/=n;const m=(r+g+b)/3,f=[m/Math.max(1,r),m/Math.max(1,g),m/Math.max(1,b)];
 for(let i=0;i<d.length;i+=4)for(let c=0;c<3;c++)d[i+c]=clamp(d[i+c]*f[c])}
function stretch(d){const hs=new Uint32Array(256),n=d.length/4;for(let i=0;i<d.length;i+=4)hs[(.299*d[i]+.587*d[i+1]+.114*d[i+2])|0]++;
 let acc=0,lo=0;for(let i=0;i<256;i++){acc+=hs[i];if(acc>n*.005){lo=i;break}}
 let mode=128,mc=0;for(let i=128;i<256;i++)if(hs[i]>mc){mc=hs[i];mode=i} // لون الورقة الغالب = الأبيض
 const hi=Math.max(lo+20,mode-4),sc=255/(hi-lo);
 for(let i=0;i<d.length;i+=4)for(let c=0;c<3;c++)d[i+c]=clamp((d[i+c]-lo)*sc)}
function unsharp(d,w,h,amt=.6){const s=new Uint8ClampedArray(d);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=(y*w+x)*4;
  for(let c=0;c<3;c++){const bl=(s[i+c-4]+s[i+c+4]+s[i+c-w*4]+s[i+c+w*4]+s[i+c]*4)/8;d[i+c]=clamp(s[i+c]+(s[i+c]-bl)*amt*2)}}}
function toGray(d){for(let i=0;i<d.length;i+=4){const v=.299*d[i]+.587*d[i+1]+.114*d[i+2];d[i]=d[i+1]=d[i+2]=v}}
function clahe(d,w,h,clip=2,tiles=8){ // CLAHE مبسّط بشبكة 8×8 واستيفاء خطي
 const g=new Uint8Array(w*h);for(let i=0;i<w*h;i++)g[i]=.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2];
 const tw=Math.ceil(w/tiles),th=Math.ceil(h/tiles),luts=[];
 for(let ty=0;ty<tiles;ty++)for(let tx=0;tx<tiles;tx++){const hs=new Float32Array(256);let n=0;
  for(let y=ty*th;y<Math.min(h,(ty+1)*th);y++)for(let x=tx*tw;x<Math.min(w,(tx+1)*tw);x++){hs[g[y*w+x]]++;n++}
  const lim=Math.max(1,clip*n/256);let ex=0;for(let i=0;i<256;i++)if(hs[i]>lim){ex+=hs[i]-lim;hs[i]=lim}
  const add=ex/256;let acc=0;const lut=new Uint8Array(256);for(let i=0;i<256;i++){acc+=hs[i]+add;lut[i]=clamp(Math.round(acc/Math.max(1,n)*255))}luts.push(lut)}
 for(let y=0;y<h;y++){const fy=Math.min(tiles-1,Math.max(0,(y-th/2)/th)),y0=Math.floor(fy),y1=Math.min(tiles-1,y0+1),ay=fy-y0;
  for(let x=0;x<w;x++){const fx=Math.min(tiles-1,Math.max(0,(x-tw/2)/tw)),x0=Math.floor(fx),x1=Math.min(tiles-1,x0+1),ax=fx-x0,v=g[y*w+x];
   const r=(luts[y0*tiles+x0][v]*(1-ax)+luts[y0*tiles+x1][v]*ax)*(1-ay)+(luts[y1*tiles+x0][v]*(1-ax)+luts[y1*tiles+x1][v]*ax)*ay,i=(y*w+x)*4;
   d[i]=d[i+1]=d[i+2]=r}}}
function adaptiveBW(d,w,h){toGray(d);const block=Math.min(51,Math.max(11,(Math.round(Math.max(w,h)/40))|1)),R=block>>1;
 const I=new Float64Array((w+1)*(h+1));
 for(let y=1;y<=h;y++){let r=0;for(let x=1;x<=w;x++){r+=d[((y-1)*w+x-1)*4];I[y*(w+1)+x]=I[(y-1)*(w+1)+x]+r}}
 const out=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const x1=Math.max(0,x-R),y1=Math.max(0,y-R),x2=Math.min(w,x+R+1),y2=Math.min(h,y+R+1);
  const m=(I[y2*(w+1)+x2]-I[y1*(w+1)+x2]-I[y2*(w+1)+x1]+I[y1*(w+1)+x1])/((x2-x1)*(y2-y1));out[y*w+x]=d[(y*w+x)*4]<m-12?0:255}
 for(let i=0;i<w*h;i++)d[i*4]=d[i*4+1]=d[i*4+2]=out[i]}
function magic(d,w,h){const gray=new Uint8ClampedArray(d);toGray(gray);const bg=smoothField(gray,w,h,12,[0]);
 for(let i=0;i<d.length;i+=4){const b=Math.max(1,bg[i]);for(let c=0;c<3;c++)d[i+c]=clamp(d[i+c]/b*255*1.15-12)}}
function linear(d,a,b){for(let i=0;i<d.length;i+=4)for(let c=0;c<3;c++)d[i+c]=clamp(d[i+c]*a+b)}

/* applyFilter(canvas, filter, brightness -100..100, contrast -100..100) */
function applyFilterX(c,f,bri=0,con=0){f=norm(f);if(f==="orig"&&!bri&&!con)return c;
 const o=document.createElement("canvas");o.width=c.width;o.height=c.height;const x=o.getContext("2d");x.drawImage(c,0,0);
 const im=x.getImageData(0,0,o.width,o.height),d=im.data,w=o.width,h=o.height;
 switch(f){
  case "auto":removeShadow(d,w,h,12);whiteBalance(d);stretch(d);unsharp(d,w,h);break;
  case "noshadow":removeShadow(d,w,h,18);break;
  case "magic":magic(d,w,h);break;
  case "gray":case "economy":clahe(d,w,h);break;
  case "bw":adaptiveBW(d,w,h);break;
  case "lighten":linear(d,1.35,25);break}
 if(bri||con)linear(d,con>=0?1+con/100:1+con/200,bri*1.2);
 x.putImageData(im,0,0);return o}

/* DocumentFormat.detect: الافتراضي A4، والبطاقة فقط تُكتشف تلقائياً */
const FORMATS={A4:1.4142,ID_CARD:1.5857};
function detectFormat(w,h){if(w<=0||h<=0)return"FREEFORM";const r=Math.max(w,h)/Math.min(w,h);
 if(r>=2)return"RECEIPT";if(Math.abs(r-FORMATS.ID_CARD)<=.06)return"ID_CARD";return r>=1.2?"A4":"FREEFORM"}
/* يعيد ضبط نسبة الصفحة للمقاس المكتشف بدون تكبير (لا تُخترع بكسلات) */
function normalizeFormat(c,maxEdge=2000){const fmt=detectFormat(c.width,c.height);if(!FORMATS[fmt])return{canvas:c,format:fmt};
 const ratio=FORMATS[fmt],long=Math.min(maxEdge,Math.max(c.width,c.height)),short=Math.min(Math.min(c.width,c.height),Math.round(long/ratio));
 const L=Math.round(short*ratio),W=c.width>=c.height?L:short,H=c.width>=c.height?short:L;
 if(W===c.width&&H===c.height)return{canvas:c,format:fmt};
 const o=document.createElement("canvas");o.width=W;o.height=H;const x=o.getContext("2d");x.imageSmoothingQuality="high";x.drawImage(c,0,0,W,H);return{canvas:o,format:fmt}}

window.FILTERS=FILTERS;window.normFilter=norm;window.applyFilterX=applyFilterX;
window.detectFormat=detectFormat;window.normalizeFormat=normalizeFormat;
})();
