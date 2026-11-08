/* =============================================================================
   §10 إخفاء/إظهار صفحات من الشاشة الرئيسية فقط — دون فقدان وظيفتها.

   يقرأ مجموعة الروابط المخفيّة من التخزين المحلي فيُخفي بطاقاتها في الرئيسية،
   ويضيف زرَّ «تخصيص الرئيسية»: في وضع التخصيص يظهر على كل قسم زر «✕ إخفاء»
   أو «↩ إظهار». الوظيفة تبقى كاملة داخل البرنامج — الإخفاء بصريٌّ للرئيسية فقط.
   ============================================================================= */
(function (w) {
  "use strict";
  var KEY = "proflawyer.homeHidden.v1";
  var editing = false, toggleWrap = null;

  function get() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function set(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { } }

  function items() {
    var out = [];
    /* التصميم القديم (section-grid/tile وrowlist) والتصميم الجديد (icon-grid/icon-card)
       كلاهما مدعوم هنا — الميزة تعمل مهما كان شكل الرئيسية الحالي. */
    document.querySelectorAll(".section-grid > a.tile").forEach(function (a) { out.push(a); });
    document.querySelectorAll("main .rowlist > li").forEach(function (li) { out.push(li); });
    document.querySelectorAll(".icon-grid > a.icon-card").forEach(function (a) { out.push(a); });
    return out;
  }
  function hrefOf(node) {
    var a = node.matches && node.matches("a") ? node : node.querySelector("a");
    return a ? a.getAttribute("href") : null;
  }

  function removeBadge(node) {
    var b = node.querySelector(".__hidebadge");
    if (b) b.remove();
    node.style.opacity = "";
  }
  function markBadge(node, isHidden, h) {
    removeBadge(node);
    node.style.position = "relative";
    node.style.opacity = isHidden ? "0.42" : "1";
    var b = document.createElement("button");
    b.type = "button"; b.className = "__hidebadge";
    b.textContent = isHidden ? "↩ إظهار" : "✕ إخفاء";
    b.style.cssText = "position:absolute;top:6px;left:6px;z-index:5;font-size:12px;" +
      "padding:5px 9px;border-radius:8px;border:0;font-family:inherit;color:#fff;" +
      "background:" + (isHidden ? "#1c6b4a" : "#b3261e");
    b.onclick = function (e) {
      e.preventDefault(); e.stopPropagation();
      var hid = get(), i = hid.indexOf(h);
      if (i >= 0) hid.splice(i, 1); else hid.push(h);
      set(hid); apply();
    };
    node.appendChild(b);
  }

  function apply() {
    var hidden = get();
    items().forEach(function (node) {
      var h = hrefOf(node); if (!h) return;
      var isHidden = hidden.indexOf(h) >= 0;
      if (editing) { node.style.display = ""; markBadge(node, isHidden, h); }
      else { removeBadge(node); node.style.display = isHidden ? "none" : ""; }
    });
  }

  function banner(on) {
    var ex = document.getElementById("__hidebanner");
    if (ex) ex.remove();
    if (!on || !toggleWrap) return;
    var d = document.createElement("div");
    d.id = "__hidebanner";
    d.style.cssText = "background:#fff4e0;border:1px solid #e8cf9a;border-radius:10px;" +
      "padding:10px 14px;margin:0 0 12px;font-size:13px;color:#6a4a12;line-height:1.8";
    d.textContent = "اضغط «✕ إخفاء» على أي قسم ليختفي من الرئيسية فقط — وظيفته تبقى داخل البرنامج. " +
      "«↩ إظهار» يعيده. اضغط «✓ إنهاء» بالأعلى لما تخلص.";
    toggleWrap.parentNode.insertBefore(d, toggleWrap.nextSibling);
  }

  function control() {
    var m = document.querySelector("main"); if (!m) return;
    toggleWrap = document.createElement("div");
    toggleWrap.style.cssText = "display:flex;justify-content:flex-start;margin-bottom:10px";
    var t = document.createElement("button");
    t.type = "button"; t.textContent = "👁 تخصيص الرئيسية";
    t.style.cssText = "background:var(--card);border:1px solid var(--line);border-radius:9px;" +
      "padding:9px 15px;font-family:inherit;font-size:13px;color:var(--brand);min-height:44px";
    t.onclick = function () {
      editing = !editing;
      t.textContent = editing ? "✓ إنهاء التخصيص" : "👁 تخصيص الرئيسية";
      banner(editing); apply();
    };
    toggleWrap.appendChild(t);
    m.insertBefore(toggleWrap, m.firstChild);
  }

  function init() { control(); apply(); }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})(window);
