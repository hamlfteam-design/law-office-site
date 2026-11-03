/*
 * صفحة الدفع الثابتة لغير المصريين: hamlf.com/pay/<الخدمة>/
 * بتعرض قيمة الخدمة بالدولار + ما يعادلها بالجنيه المصري، وخطوات الدفع، وبعدين زرار يفتح صفحة OPay.
 * البيانات من pay/links.js. الرابط العام: hamlf.com/pay/general/?usd=750
 */
(function () {
  // ---- markup + style (one place for all pay/<service>/ pages) ----
  (function () {
    var st = document.createElement('style'); st.textContent = ".py-wrap{max-width:640px;margin:0 auto;padding:32px 16px 80px;}\n.py-card{background:var(--white);border:1px solid #e7e4dd;border-radius:var(--radius);padding:26px 22px;}\n.py-top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;}\n.py-top a{font-size:.85rem;color:var(--gold);font-weight:700;}\n.py-welcome{border-inline-start:3px solid var(--gold);background:var(--bg);padding:10px 14px;border-radius:6px;font-size:.92rem;line-height:1.8;margin:6px 0 18px;}\n.py-service{font-size:1.25rem;color:var(--navy);margin:0 0 14px;}\n.py-amount{text-align:center;background:var(--bg);border:1px solid #e2ddd1;border-radius:10px;padding:16px;margin-bottom:16px;}\n.py-amount small{display:block;color:var(--muted);font-size:.85rem;}\n.py-usd{font-size:2rem;font-weight:900;color:var(--navy);line-height:1.4;}\n.py-egp{font-size:1rem;color:var(--muted);}\n.py-card h2{font-size:1.05rem;color:var(--navy);margin:16px 0 6px;}\n.py-card p,.py-card li{line-height:1.9;font-size:.95rem;}\n.py-card ol{padding-inline-start:22px;margin:6px 0 0;}\n.py-actions{display:flex;flex-direction:column;gap:10px;margin-top:20px;}\n.py-actions a{text-align:center;}\n.py-note{font-size:.82rem;color:var(--muted);margin-top:16px;}\n.py-ask input{width:100%;padding:12px;border:1px solid #d8d4cb;border-radius:8px;font:inherit;margin:8px 0;direction:ltr;}\n[hidden]{display:none !important;}\n"; document.head.appendChild(st);
    var wrap = document.createElement('div'); wrap.innerHTML = "<header class=\"site-header\">\n  <div class=\"container header-inner\">\n    <div class=\"brand\"><a href=\"/\"><img src=\"/assets/images/logo.png\" alt=\"Hamlf Law Firm\" class=\"brand-logo\"></a></div>\n  </div>\n</header>\n<div class=\"py-wrap\">\n  <div class=\"py-card\">\n    <div class=\"py-top\"><span></span><a href=\"#\" id=\"payLang\"></a></div>\n    <div class=\"py-welcome\" id=\"payWelcome\"></div>\n    <h1 class=\"py-service\" id=\"payService\"></h1>\n    <div id=\"payBox\" hidden>\n      <div class=\"py-amount\"><small id=\"payAmountLabel\"></small><div class=\"py-usd\" id=\"payUsd\"></div><div class=\"py-egp\" id=\"payEgp\"></div></div>\n      <h2 id=\"payHowTitle\"></h2>\n      <p id=\"payHow\"></p>\n      <ol id=\"paySteps\"></ol>\n      <div class=\"py-actions\">\n        <a href=\"#\" id=\"payGo\" class=\"btn-primary\" rel=\"noopener\"></a>\n        <a href=\"#\" id=\"payWa\" class=\"btn-outline\" style=\"color:var(--navy);border-color:#d8d4cb;\" target=\"_blank\" rel=\"noopener\"></a>\n      </div>\n    </div>\n    <form id=\"askForm\" class=\"py-ask\"><div id=\"askBox\" hidden><label id=\"askLabel\" for=\"askInput\"></label><input type=\"number\" id=\"askInput\" min=\"1\" step=\"any\" inputmode=\"decimal\" placeholder=\"750\"><button type=\"submit\" class=\"btn-primary\" id=\"askBtn\" style=\"border:0;cursor:pointer;font:inherit;\"></button></div></form>\n    <p class=\"py-note\" id=\"payNote\"></p>\n  </div>\n</div>\n";
    var ref = document.body.firstChild;
    while (wrap.firstChild) document.body.insertBefore(wrap.firstChild, ref);
  })();
  var key = document.body.getAttribute('data-key') || 'general';
  var P = (window.HB_PAY || {})[key] || (window.HB_PAY || {}).general;
  var G = (window.HB_PAY || {}).general || {};
  var rate = window.HB_PAY_RATE || 0;
  var q = new URLSearchParams(location.search);
  var lang = q.get('lang') || ((navigator.language || '').toLowerCase().indexOf('ar') === 0 ? 'ar' : 'en');
  var ar = lang === 'ar';

  var usd = P.usd;
  if (!usd) { var u = parseFloat(q.get('usd')); if (u > 0 && u < 1000000) usd = Math.round(u * 100) / 100; }
  var useGeneral = !P.url;                     // مفيش رابط خاص → الرابط العام بالكمية
  var url = P.url || G.url;
  var egp = (!useGeneral && P.egp) ? P.egp : (usd && rate ? Math.round(usd * rate * 100) / 100 : null);
  var egpExact = !useGeneral && !!P.egp;

  function n(x) { return Number(x).toLocaleString('en-US', { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
  function el(id) { return document.getElementById(id); }

  document.documentElement.lang = ar ? 'ar' : 'en';
  document.documentElement.dir = ar ? 'rtl' : 'ltr';
  document.title = (ar ? 'الدفع — ' : 'Payment — ') + (ar ? P.ar : P.en) + (ar ? ' | مؤسسة د. حسن عبد المنعم حسن' : ' | Hamlf Law Firm');

  var T = ar ? {
    welcome: 'يسعدنا أن نكون إلى جانبك، وأن نساعدك ونحافظ على حقوقك. ثقتك بنا محل تقديرنا، وحقك أمانة عندنا.',
    amount: 'قيمة الخدمة', usdUnit: 'دولار أمريكي',
    egpLine: function (e) { return (egpExact ? 'تعادل ' : 'تعادل حوالي ') + n(e) + ' جنيه مصري'; },
    howTitle: 'هتدفع إزاي؟',
    how: function (e) {
      return 'صفحة الدفع الآمنة (OPay) بتعرض المبلغ بالجنيه المصري' + (e ? ' (' + n(e) + ' جنيه)' : '') +
        ' — وده نفس قيمة ' + n(usd) + ' دولار. بنكك بيخصم المبلغ من كارتك <strong>بعملتك</strong> بما يعادل حوالي ' + n(usd) +
        ' دولار، وممكن البنك يضيف رسوم تحويل بسيطة حسب سياسته.';
    },
    steps: [
      useGeneral ? 'في خانة <b>Quantity</b> اكتب <b>' + (usd || '…') + '</b> (كل وحدة = 1 دولار).' : null,
      'اكتب اسمك، واختر <b>كود دولتك</b> في خانة الهاتف (مثلاً +212 المغرب، +966 السعودية، +971 الإمارات) واكتب رقمك، ثم بريدك الإلكتروني.',
      'اضغط <b>Pay Now</b>، واختر <b>Bank Card</b>.',
      'أدخل بيانات البطاقة (فيزا / ماستركارد) واضغط <b>Pay Now</b>.',
      'ابعت لنا صورة تأكيد الدفع على واتساب.'
    ],
    go: 'متابعة للدفع الآمن', wa: 'إرسال تأكيد الدفع على واتساب',
    note: 'الأسعار قابلة للتغيير في أي وقت دون إشعار مسبق، ويُطبَّق السعر الظاهر وقت الدفع.',
    askAmount: 'اكتب قيمة الأتعاب المتفق عليها بالدولار:', show: 'عرض', other: 'English',
    noAmount: 'من فضلك اكتب قيمة الأتعاب المتفق عليها مع المكتب.'
  } : {
    welcome: 'We are pleased to stand by your side, to help you and protect your rights. Your trust is highly valued, and your rights are a trust we hold dear.',
    amount: 'Fee', usdUnit: 'US dollars',
    egpLine: function (e) { return (egpExact ? 'Equal to EGP ' : 'About EGP ') + n(e) + ' (Egyptian pounds)'; },
    howTitle: 'How you pay',
    how: function (e) {
      return 'The secure payment page (OPay) shows the amount in Egyptian pounds' + (e ? ' (EGP ' + n(e) + ')' : '') +
        ' — the same value as USD ' + n(usd) + '. Your bank charges your card <strong>in your own currency</strong>, equal to about USD ' + n(usd) +
        ', and may add a small conversion fee according to its policy.';
    },
    steps: [
      useGeneral ? 'In the <b>Quantity</b> field, enter <b>' + (usd || '…') + '</b> (1 unit = USD 1).' : null,
      'Enter your name, choose <b>your country code</b> in the phone field (e.g. +212 Morocco, +966 Saudi Arabia, +971 UAE, +44 UK) and your number, then your email.',
      'Tap <b>Pay Now</b>, then choose <b>Bank Card</b>.',
      'Enter your card details (Visa / Mastercard) and tap <b>Pay Now</b>.',
      'Send us a screenshot of the payment confirmation on WhatsApp.'
    ],
    go: 'Continue to secure payment', wa: 'Send payment confirmation on WhatsApp',
    note: 'Prices are subject to change at any time without prior notice. The price shown at the time of payment applies.',
    askAmount: 'Enter the agreed fee in USD:', show: 'Show', other: 'العربية',
    noAmount: 'Please enter the fee agreed with the firm.'
  };

  el('payWelcome').textContent = T.welcome;
  el('payService').textContent = ar ? P.ar : P.en;
  el('payLang').textContent = T.other;
  q.set('lang', ar ? 'en' : 'ar'); el('payLang').href = '?' + q.toString();

  if (usd) {
    el('payAmountLabel').textContent = T.amount;
    if (ar && egp) {   // العربي: المبلغ بالجنيه المصري بما يعادل السعر الثابت بالدولار
      el('payUsd').textContent = n(egp) + ' جنيه مصري';
      el('payEgp').textContent = 'تعادل ' + n(usd) + ' دولار أمريكي، أو ما يعادلها بعملتك';
    } else {
      el('payUsd').textContent = (ar ? n(usd) + ' ' + T.usdUnit : 'USD ' + n(usd));
      el('payEgp').textContent = egp ? T.egpLine(egp) : '';
    }
    el('payHowTitle').textContent = T.howTitle;
    el('payHow').innerHTML = T.how(egp);
    el('paySteps').innerHTML = T.steps.filter(Boolean).map(function (s) { return '<li>' + s + '</li>'; }).join('');
    el('payGo').textContent = T.go; el('payGo').href = url;
    el('payBox').hidden = false;
  } else {
    el('askLabel').textContent = T.askAmount; el('askBtn').textContent = T.show;
    el('askBox').hidden = false;
    el('askForm').onsubmit = function (e) {
      e.preventDefault();
      var v = parseFloat(el('askInput').value);
      if (!(v > 0)) { alert(T.noAmount); return; }
      q.set('usd', v); q.set('lang', lang); location.search = q.toString();
    };
  }
  var waTxt = (ar ? 'تم الدفع — ' + P.ar : 'Payment done — ' + P.en) + (usd ? ' (USD ' + usd + ')' : '');
  el('payWa').textContent = T.wa; el('payWa').href = 'https://wa.me/201208555806?text=' + encodeURIComponent(waTxt);
  el('payNote').textContent = T.note;
})();
