/* =============================================================================
   مولّد QR من غير مكتبات ولا إنترنت — منقول من «تقويم الجلسات».
   نمط البايت، تصحيح خطأ M. مقفول على الإصدارات ٢–٦ (لحد ~١٠٠ بايت):
   دي اللي اتقارنت بمرجع (مكتبة qrcode في Python) وطلعت مطابقة خلية بخلية
   ومقروءة بـ OpenCV. الإصدار ١ كان مختلف، و٧ وأكبر ناقصهم «معلومات الإصدار»
   فما بيتقروش (قاعدة ٧٥: أي مولّد رموز يتقارن بمرجع قبل اعتماده).
   ============================================================================= */
(function (w) {
"use strict";
const QR=(function(){
  /* جداول جالوا */
  const EXP=new Array(512), LOG=new Array(256);
  (function(){ let x=1;
    for(let i=0;i<255;i++){ EXP[i]=x; LOG[x]=i; x<<=1; if(x&256) x^=0x11d; }
    for(let i=255;i<512;i++) EXP[i]=EXP[i-255];
  })();
  const mul=(a,b)=>(a===0||b===0)?0:EXP[LOG[a]+LOG[b]];
  function rsPoly(n){ let p=[1];
    for(let i=0;i<n;i++){ const q=[1,EXP[i]], r=new Array(p.length+1).fill(0);
      for(let j=0;j<p.length;j++){ r[j]^=mul(p[j],q[0]); r[j+1]^=mul(p[j],q[1]); }
      p=r; }
    return p; }
  function rsEnc(data,n){
    const gen=rsPoly(n), res=new Array(n).fill(0);
    for(const d of data){ const f=d^res[0]; res.shift(); res.push(0);
      if(f) for(let i=0;i<n;i++) res[i]^=mul(gen[i+1],f); }
    return res; }
  /* سعة نمط البايت وتصحيح M لكل إصدار */
  /* لكل إصدار: [إجمالى الكلمات، كلمات التصحيح للكتلة، كتل [عدد،طول]] — مستوى M */
  const VER={1:[26,10,[[1,16]]], 2:[44,16,[[1,28]]], 3:[70,26,[[1,44]]],
             4:[100,18,[[2,32]]], 5:[134,24,[[2,43]]], 6:[172,16,[[4,27]]],
             7:[196,18,[[4,31]]], 8:[242,22,[[2,38],[2,39]]],
             9:[292,22,[[3,36],[2,37]]], 10:[346,26,[[4,43],[1,44]]]};
  const ALIGN=[[],[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];
  const FMT=[0x5412,0x5125,0x5E7C,0x5B4B,0x45F9,0x40CE,0x4F97,0x4AA0];  /* M + قناع ٠..٧ */

  function encode(str){
    const utf=new TextEncoder().encode(str);
    let ver=0;
    for(let v=2;v<=6;v++){
      const [tot,ecw,blk]=VER[v];
      const nd=tot-ecw*blk.reduce((n,x)=>n+x[0],0);
      const need=Math.ceil((4+(v<10?8:16)+utf.length*8)/8);
      if(need<=nd){ ver=v; break; }
    }
    if(!ver) throw new Error("النص أطول من طاقة الرمز");
    const [total,ecw,blocks]=VER[ver];
    const ndata=total-ecw*blocks.reduce((n,x)=>n+x[0],0);
    const size=17+4*ver;

    const bits=[];
    const push=(v,n)=>{ for(let i=n-1;i>=0;i--) bits.push((v>>i)&1); };
    push(4,4); push(utf.length, ver<10?8:16);
    for(const b of utf) push(b,8);
    push(0, Math.min(4, ndata*8-bits.length));
    while(bits.length%8) bits.push(0);
    const by=[];
    for(let i=0;i<bits.length;i+=8){ let v=0; for(let j=0;j<8;j++) v=(v<<1)|bits[i+j]; by.push(v); }
    const PAD=[0xEC,0x11]; let p=0;
    while(by.length<ndata) by.push(PAD[p++%2]);

    const dblk=[]; let o=0;
    for(const [cnt,len] of blocks) for(let i=0;i<cnt;i++){ dblk.push(by.slice(o,o+len)); o+=len; }
    const eblk=dblk.map(d=>rsEnc(d,ecw));
    const out=[];
    const mx=Math.max(...dblk.map(d=>d.length));
    for(let i=0;i<mx;i++) for(const d of dblk) if(i<d.length) out.push(d[i]);
    for(let i=0;i<ecw;i++) for(const e of eblk) out.push(e[i]);

    const M=[],R=[];
    for(let i=0;i<size;i++){ M.push(new Array(size).fill(0)); R.push(new Array(size).fill(0)); }
    const st=(r,c,v)=>{ M[r][c]=v?1:0; R[r][c]=1; };
    const finder=(r,c)=>{ for(let i=-1;i<8;i++) for(let j=-1;j<8;j++){
        const y=r+i,x=c+j; if(y<0||x<0||y>=size||x>=size) continue;
        const on=(i>=0&&i<=6&&(j===0||j===6))||(j>=0&&j<=6&&(i===0||i===6))||(i>=2&&i<=4&&j>=2&&j<=4);
        st(y,x,on); } };
    finder(0,0); finder(0,size-7); finder(size-7,0);
    for(let i=8;i<size-8;i++){ st(6,i,i%2===0); st(i,6,i%2===0); }
    for(const a2 of ALIGN[ver]) for(const b2 of ALIGN[ver]){
      if((a2<9&&b2<9)||(a2<9&&b2>size-10)||(a2>size-10&&b2<9)) continue;
      for(let i=-2;i<=2;i++) for(let j=-2;j<=2;j++)
        st(a2+i,b2+j, Math.max(Math.abs(i),Math.abs(j))!==1); }
    for(let i=0;i<9;i++) if(i!==6){ R[8][i]=1; R[i][8]=1; }
    R[8][6]=1; R[6][8]=1;
    for(let i=0;i<8;i++){ R[8][size-1-i]=1; R[size-1-i][8]=1; }
    st(size-8,8,1);

    let bi=0, up=true;
    for(let c=size-1;c>0;c-=2){
      if(c===6) c--;
      for(let k=0;k<size;k++){
        const r=up?size-1-k:k;
        for(const cc of [c,c-1]){
          if(R[r][cc]) continue;
          let v=((bi>>3)<out.length) ? ((out[bi>>3]>>(7-(bi&7)))&1) : 0;
          bi++;
          if((r+cc)%2===0) v^=1;            /* القناع ٠ */
          M[r][cc]=v;
        }
      }
      up=!up;
    }
    const f=FMT[0];
    for(let i=0;i<15;i++){
      const b=(f>>(14-i))&1;                /* الجدول يُقرأ من الأعلى للأدنى */
      if(i<6) M[8][i]=b; else if(i===6) M[8][7]=b; else if(i===7) M[8][8]=b;
      else if(i===8) M[7][8]=b; else M[14-i][8]=b;
      if(i<7) M[size-1-i][8]=b; else M[8][size-15+i]=b;
    }
    M[size-8][8]=1;
    return M;
  }
  function draw(cv,str,px){
    const M=encode(str), n=M.length, q=4, S=px||6;
    cv.width=cv.height=(n+q*2)*S;
    const g=cv.getContext("2d");
    g.fillStyle="#fff"; g.fillRect(0,0,cv.width,cv.height);
    g.fillStyle="#000";
    for(let r=0;r<n;r++) for(let c=0;c<n;c++)
      if(M[r][c]) g.fillRect((c+q)*S,(r+q)*S,S,S);
    return cv;
  }
  return {encode,draw};
})();

w.QR = QR;
})(window);
