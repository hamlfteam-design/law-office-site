/* ============================================================
   شاشة الروتيت: زراير ٩٠° بتلف الصورة قدامك بحركة، وشريط ميل
   بالدرجة (−٤٥° لـ +٤٥°) والصورة بتلف معاه وانت بتحرّكه.
   ============================================================ */
"use strict";
(function(){
const css=`#rotScr{position:fixed;inset:0;z-index:18;background:#111;display:flex;flex-direction:column;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
#rotScr .tp{display:flex;align-items:center;gap:8px;padding:10px;color:#fff}#rotScr .tp span{flex:1;font-weight:600}
#rotScr .st{flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}
#rotScr img{max-width:86%;max-height:86%;transition:transform .35s ease;box-shadow:0 0 0 1px #444}
#rotScr .grid{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.12) 1px,transparent 1px);background-size:40px 40px;opacity:0;transition:opacity .2s}
#rotScr .grid.on{opacity:1}#rotScr .ctl{padding:10px 14px;color:#ddd}
#rotScr .ctl .r{display:flex;gap:8px;align-items:center;justify-content:center;margin-bottom:10px}
#rotScr input[type=range]{width:100%;padding:0}#rotScr .deg{min-width:64px;text-align:center;font-weight:700;color:#fff}
#rotScr .acts{display:flex;gap:10px;padding:6px 14px 14px}#rotScr .acts .btn{flex:1}`;
const st=document.createElement("style");st.textContent=css;document.head.appendChild(st);

/* يلف الصورة: الربع لفات بتغيّر الأبعاد، والميل بيلف حوالين النص بخلفية بيضا وبنفس المقاس */
function render(img,quarter,fine){const q=((quarter%4)+4)%4,sw=q%2?img.height:img.width,sh=q%2?img.width:img.height;
 const c=document.createElement("canvas");c.width=sw;c.height=sh;const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,sw,sh);
 x.translate(sw/2,sh/2);x.rotate(q*Math.PI/2+fine*Math.PI/180);
 if(fine){const a=Math.abs(fine*Math.PI/180),k=Math.max((sw*Math.cos(a)+sh*Math.sin(a))/sw,(sw*Math.sin(a)+sh*Math.cos(a))/sh);x.scale(k,k)} // تكبير بسيط عشان مايبقاش فيه أركان فاضية
 x.imageSmoothingQuality="high";x.drawImage(img,-img.width/2,-img.height/2);return c}
window.rotateCanvasFine=render;

window.rotateRender=render;
window.rotateScreen=function(src){return new Promise(async resolve=>{
 const img=new Image();img.src=src;await img.decode();let quarter=0,fine=0;
 const d=document.createElement("div");d.id="rotScr";
 d.innerHTML=`<div class="tp"><button class="btn sec" data-x>✕</button><span>تدوير الصفحة</span></div>
 <div class="st"><img alt=""><div class="grid"></div></div>
 <div class="ctl"><div class="r"><button class="btn sec" data-l>↺ ٩٠° شمال</button><button class="btn sec" data-r>↻ ٩٠° يمين</button></div>
  <div class="r"><span>📐 الميل</span><input type="range" min="-45" max="45" step="0.5" value="0" data-f><span class="deg">0°</span><button class="btn sec" data-z style="padding:6px 10px">صفر</button></div></div>
 <div class="acts"><button class="btn sec" data-c>إلغاء</button><button class="btn warn" data-ok>✔ حفظ</button></div>`;
 document.body.appendChild(d);
 const im=d.querySelector("img"),grid=d.querySelector(".grid"),sl=d.querySelector("[data-f]"),dg=d.querySelector(".deg");im.src=src;
 const fmt=v=>(v>0?"+":"")+v+"°";
 const show=(anim=true)=>{im.style.transition=anim?"transform .35s ease":"none";
  // في ربع اللفة الصورة بتتصغّر شوية عشان تفضل كلها باينة وهي بتلف
  const sideways=Math.abs(quarter)%2===1,k=sideways?Math.min(1,im.clientHeight/Math.max(1,im.clientWidth),im.clientWidth/Math.max(1,im.clientHeight)):1;
  im.style.transform=`rotate(${quarter*90+fine}deg) scale(${k})`;dg.textContent=fmt(fine)};
 d.querySelector("[data-l]").onclick=()=>{quarter--;show()};d.querySelector("[data-r]").onclick=()=>{quarter++;show()};
 sl.oninput=()=>{fine=+sl.value;grid.classList.add("on");show(false)};
 sl.onchange=()=>grid.classList.remove("on");
 d.querySelector("[data-z]").onclick=()=>{fine=0;sl.value=0;show()};
 const done=v=>{d.remove();resolve(v)};
 d.querySelector("[data-x]").onclick=d.querySelector("[data-c]").onclick=()=>done(null);
 d.querySelector("[data-ok]").onclick=()=>{if(!(((quarter%4)+4)%4)&&!fine)return done(null);busy(1);
  setTimeout(()=>{const c=render(img,quarter,fine);busy(0);done({canvas:c,quarter,fine})},20)};
})};
})();
