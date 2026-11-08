/* =============================================================================
   نسخة الآيفون: بديل AndroidStore (MainActivity.java) علشان بيانات المكتب كلها
   تتخزن على الموبايل، مش في localStorage اللي سقفه ~٥ ميجا.

   الكود كله بيقرا localStorage بشكل متزامن، وIndexedDB مش متزامن. فالحل:
   sw.js بيحقن كل البيانات المحفوظة في الصفحة نفسها (window.__BIG) قبل ما تتحمّل،
   والكتابة بتروح لـsw.js برسالة، وهو بيحدّث نسخته في الذاكرة ويحفظها في IndexedDB
   بالترتيب — فالصفحة اللي بعدها بتاخد آخر نسخة دايماً.
   لو الصفحة ما جاتش من sw.js (أول فتحة، أو المتصفح منعه) الملف ده ما بيعملش حاجة،
   وbig-store.js بيفضل على localStorage عادي، وأول ما sw.js يشتغل بينقلها.
   ============================================================================= */
(function (w) {
  "use strict";
  var data = w.__BIG, sw = navigator.serviceWorker && navigator.serviceWorker.controller;
  if (!data || typeof data !== "object" || !sw || w.AndroidStore) return;
  try { delete w.__BIG; } catch (e) { w.__BIG = undefined; }
  var stamps = {}, seq = 0;
  Object.keys(data).forEach(function (k) { stamps[k] = "i" + (++seq); });
  function post(m) { try { (navigator.serviceWorker.controller || sw).postMessage(m); return true; } catch (e) { return false; } }
  w.AndroidStore = {
    get: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    set: function (k, v) {
      if (!post({ hamlfStore: "set", k: k, v: v })) return false;
      data[k] = v; stamps[k] = "w" + (++seq); return true;
    },
    remove: function (k) { post({ hamlfStore: "remove", k: k }); delete data[k]; delete stamps[k]; return true; },
    keys: function () { return JSON.stringify(Object.keys(data)); },
    stamp: function (k) { return stamps[k] || ""; }
  };
  w.HAMLF_WEBSTORE = true;
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
})(window);
