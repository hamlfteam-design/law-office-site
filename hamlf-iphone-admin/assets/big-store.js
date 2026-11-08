/* =============================================================================
   تخزين البيانات الكبيرة في ملفات على مساحة الجهاز، مش في localStorage.

   localStorage سقفه ~٥ مليون حرف مهما كانت مساحة الموبايل. القضايا والموكلين
   والطابور وصلوا السقف يوم ٤-١١-٢٠٢٦، فكل الحفظ وقف («المساحة ممتلئة»)، والطابور
   كان بيفشل في صمت. هنا المفاتيح الكبيرة بتتكتب ملفات عن طريق AndroidStore،
   فالسقف بقى مساحة الجهاز، وباقي الكود بيفضل يكتب localStorage عادي.

   لازم يتحمّل أول سكربت في كل صفحة: أي كود بيلف Storage.prototype بعده (زي
   drive-file-sync.js وcase-scope.js) بيلف الطبقة دي، فمفاتيحها بتعدّي عليه.
   الكمبيوتر والمواقع مفيهاش AndroidStore، فالملف ده مش بيعمل حاجة هناك.
   ============================================================================= */
(function (w) {
  "use strict";
  var N = w.AndroidStore, S = w.localStorage;
  if (!N || !S || w.__bigStore) return;
  w.__bigStore = true;

  var P = Storage.prototype;
  var rawGet = P.getItem, rawSet = P.setItem, rawRemove = P.removeItem, rawKey = P.key, rawClear = P.clear;
  var rawLen = Object.getOwnPropertyDescriptor(P, "length");
  var BIG = /^(proflawyer\.(agenda\.|team\.v1$|cloudqueue\.v1$|bulkpush\.|regs\.|screens\.|appointments\.|att\.|backup\.|courtAddr\.|portalindex\.|clientlinks\.|sync\.[a-z-]+\.hashes$)|hamlf\.backup\.)[A-Za-z0-9._-]*$/;
  var cache = {}, names = null;

  /* نقل مرة واحدة: المفتاح ما يتمسحش من localStorage غير بعد ما الملف يتقري ويطابق حرفياً */
  (function migrate() {
    var keys = [], n = rawLen.get.call(S), i;
    for (i = 0; i < n; i++) { var k = rawKey.call(S, i); if (BIG.test(k)) keys.push(k); }
    keys.forEach(function (k) {
      var v = rawGet.call(S, k);
      if (v == null) return;
      if (N.set(k, v) && N.get(k) === v) rawRemove.call(S, k);
    });
  })();

  /* النسخة من الملف بتتقري مرة، والبصمة (stamp) بتقول لو حد كتب بعدها */
  function read(k) {
    var st = N.stamp(k);
    if (!st) return rawGet.call(S, k);
    var c = cache[k];
    if (c && c.st === st) return c.v;
    var v = N.get(k);
    cache[k] = { st: st, v: v };
    return v;
  }
  function allNames() {
    if (names) return names;
    var seen = {}, out = [], n = rawLen.get.call(S), i;
    for (i = 0; i < n; i++) { var k = rawKey.call(S, i); seen[k] = 1; out.push(k); }
    JSON.parse(N.keys()).forEach(function (k2) { if (!seen[k2]) out.push(k2); });
    return (names = out);
  }

  P.getItem = function (k) {
    return this === S && BIG.test(k) ? read(String(k)) : rawGet.call(this, k);
  };
  P.setItem = function (k, v) {
    if (this !== S) return rawSet.call(this, k, v);
    names = null;
    k = String(k);
    if (!BIG.test(k)) return rawSet.call(this, k, v);
    v = String(v);
    if (!N.set(k, v)) throw new DOMException("تعذّرت الكتابة على مساحة الجهاز", "QuotaExceededError");
    cache[k] = { st: N.stamp(k), v: v };
    if (rawGet.call(S, k) != null) rawRemove.call(S, k);
  };
  P.removeItem = function (k) {
    if (this === S) {
      names = null;
      if (BIG.test(k)) { delete cache[k]; N.remove(String(k)); }
    }
    return rawRemove.call(this, k);
  };
  /* حذف عضو من الفريق بيمسح جهازه بـlocalStorage.clear() (wipeAndLockOut في team.js):
     من غير ده بيانات المكتب كانت هتفضل في الملفات على موبايله. */
  P.clear = function () {
    if (this === S) {
      names = null; cache = {};
      JSON.parse(N.keys()).forEach(function (k) { N.remove(k); });
    }
    return rawClear.call(this);
  };
  /* النسخ الاحتياطي والمزامنة بيلفّوا على localStorage.key(i): لازم يشوفوا الملفات كمان */
  P.key = function (i) {
    if (this !== S) return rawKey.call(this, i);
    var a = allNames();
    return i < a.length ? a[i] : null;
  };
  Object.defineProperty(P, "length", {
    configurable: true, enumerable: true,
    get: function () { return this === S ? allNames().length : rawLen.get.call(this); }
  });
})(window);
