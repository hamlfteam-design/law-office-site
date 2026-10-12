/* Floating contact buttons (call + WhatsApp) and click tracking — added 2026-10-12 */
(function(){
try{
var PHONE='201208555806';
var en=(document.documentElement.lang||'').toLowerCase().indexOf('en')===0;
var L=en?{call:'Call the office',wa:'Chat on WhatsApp',msg:'Hello, I would like to ask about a legal consultation.'}
        :{call:'اتصل بالمكتب',wa:'راسلنا على واتساب',msg:'السلام عليكم، أرغب في الاستفسار عن استشارة قانونية.'};
function track(name){try{if(typeof gtag==='function')gtag('event',name,{event_category:'contact',page_path:location.pathname});}catch(e){}}
var st=document.createElement('style');
st.textContent='.hx-fab{position:fixed;inset-inline-end:16px;bottom:18px;z-index:900;display:flex;flex-direction:column;gap:10px}'+
'.hx-fab a{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.28);transition:transform .15s}'+
'.hx-fab a:hover{transform:scale(1.07)}'+
'.hx-fab .hx-call{background:#141414;border:2px solid #c9a35f}'+
'.hx-fab .hx-wa{background:#25D366}'+
'.hx-fab svg{width:26px;height:26px;display:block}'+
'@media print{.hx-fab{display:none}}';
document.head.appendChild(st);
var box=document.createElement('div');box.className='hx-fab';
box.innerHTML='<a class="hx-call" href="tel:+'+PHONE+'" aria-label="'+L.call+'" title="'+L.call+'"><svg viewBox="0 0 24 24" fill="#c9a35f"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z"/></svg></a>'+
'<a class="hx-wa" href="https://wa.me/'+PHONE+'?text='+encodeURIComponent(L.msg)+'" target="_blank" rel="noopener" aria-label="'+L.wa+'" title="'+L.wa+'"><svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.5 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.2 1.4z"/></svg></a>';
document.body.appendChild(box);
document.addEventListener('click',function(e){
var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;
var h=a.getAttribute('href')||'';
if(h.indexOf('tel:')===0)track('phone_click');
else if(h.indexOf('wa.me')>-1)track('whatsapp_click');
else if(/booking\.html/.test(h))track('booking_click');
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
