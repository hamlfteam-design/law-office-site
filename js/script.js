/* Floating contact buttons (call + book consultation) and click tracking — added 2026-10-12 */
(function(){
try{
var PHONE='201208555806';var BOOK='https://hamlf.com/#contact-consult';
var en=(document.documentElement.lang||'').toLowerCase().indexOf('en')===0;
var L=en?{call:'Call the office',wa:'Book a consultation'}
        :{call:'اتصل بالمكتب',wa:'احجز استشارة'};
function track(name){try{if(typeof gtag==='function')gtag('event',name,{event_category:'contact',page_path:location.pathname});}catch(e){}}
var st=document.createElement('style');
st.textContent='.hx-fab{position:fixed;inset-inline-end:16px;bottom:18px;z-index:900;display:flex;flex-direction:column;gap:10px}'+
'.hx-fab a{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.28);transition:transform .15s}'+
'.hx-fab a:hover{transform:scale(1.07)}'+
'.hx-fab .hx-call{background:#141414;border:2px solid #c9a35f}'+
'.hx-fab .hx-wa{background:#c9a35f}'+
'.hx-fab svg{width:26px;height:26px;display:block}'+
'@media print{.hx-fab{display:none}}';
document.head.appendChild(st);
var box=document.createElement('div');box.className='hx-fab';
box.innerHTML='<a class="hx-call" href="tel:+'+PHONE+'" aria-label="'+L.call+'" title="'+L.call+'"><svg viewBox="0 0 24 24" fill="#c9a35f"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z"/></svg></a>'+
'<a class="hx-wa" href="'+BOOK+'" aria-label="'+L.wa+'" title="'+L.wa+'"><svg viewBox="0 0 24 24" fill="#141414"><path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm-2 8h14v10H5V10z"/></svg></a>';
document.body.appendChild(box);
document.addEventListener('click',function(e){
var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;
var h=a.getAttribute('href')||'';
if(h.indexOf('tel:')===0)track('phone_click');
else if(h.indexOf('contact-consult')>-1)track('booking_click');
else if(/booking\.html/.test(h))track('booking_click');
else if(h.indexOf('writereview')>-1||h.indexOf('g.page/r/')>-1||/\/review\/?$/.test(h))track('review_click');
});
}catch(e){}
})();

document.getElementById('year').textContent = new Date().getFullYear();

const menuToggle = document.getElementById('menuToggle');
const mainNav = document.getElementById('mainNav');

menuToggle.addEventListener('click', () => {
  mainNav.classList.toggle('open');
});

mainNav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => mainNav.classList.remove('open'));
});
