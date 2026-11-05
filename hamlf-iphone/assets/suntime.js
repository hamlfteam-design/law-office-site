/* =============================================================================
   وقت الشروق والغروب — «صباح» من الشروق للغروب، و«مساء» من الغروب للشروق،
   بحسب موقع الجهاز الفعلي (لا ساعة ثابتة ٦-١٨ لا تصلح لكل المواسم والبلاد).

   حساب فلكي قياسي (Sunrise/Sunset Algorithm — Almanac for Computers 1990،
   نفس الخوارزمية المستخدمة في sunrise-sunset.org) — بلا اتصال إنترنت ولا
   مكتبة خارجية. الموقع يُطلب مرة ويُخزَّن يوماً كاملاً (يكفي لدقة التحية).
   ============================================================================= */
(function (w) {
  "use strict";

  var CACHE_KEY = "proflawyer.geoCache.v1";

  function rad(d) { return d * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }
  function norm360(x) { x = x % 360; return x < 0 ? x + 360 : x; }
  function norm24(x) { x = x % 24; return x < 0 ? x + 24 : x; }
  function dayOfYear(d) {
    var start = Date.UTC(d.getUTCFullYear(), 0, 1);
    return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000) + 1;
  }

  /** ساعة UTC (٠-٢٤) لشروق أو غروب اليوم `date` عند (lat, lng)؛ null لو لا شروق/غروب (قطبي). */
  function calc(date, lat, lng, sunrise) {
    var N = dayOfYear(date);
    var lngHour = lng / 15;
    var t = sunrise ? N + ((6 - lngHour) / 24) : N + ((18 - lngHour) / 24);

    var M = 0.9856 * t - 3.289;
    var L = norm360(M + 1.916 * Math.sin(rad(M)) + 0.020 * Math.sin(rad(2 * M)) + 282.634);

    var RA = norm360(deg(Math.atan(0.91764 * Math.tan(rad(L)))));
    var Lq = Math.floor(L / 90) * 90, RAq = Math.floor(RA / 90) * 90;
    RA = (RA + (Lq - RAq)) / 15;

    var sinDec = 0.39782 * Math.sin(rad(L));
    var cosDec = Math.cos(Math.asin(sinDec));
    var zenith = 90.833;   // الانكسار الجوي + نصف قطر الشمس
    var cosH = (Math.cos(rad(zenith)) - sinDec * Math.sin(rad(lat))) / (cosDec * Math.cos(rad(lat)));
    if (cosH > 1 || cosH < -1) return null;

    var H = sunrise ? 360 - deg(Math.acos(cosH)) : deg(Math.acos(cosH));
    H = H / 15;

    var T = H + RA - 0.06571 * t - 6.622;
    var UT = norm24(T - lngHour);
    return UT;
  }

  function utcHourToDate(date, utcHour) {
    var d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    d.setUTCMinutes(Math.round(utcHour * 60));
    return d;
  }

  function sunTimes(date, lat, lng) {
    var rUT = calc(date, lat, lng, true), sUT = calc(date, lat, lng, false);
    if (rUT == null || sUT == null) return null;
    return { sunrise: utcHourToDate(date, rUT), sunset: utcHourToDate(date, sUT) };
  }

  function readCache() {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (c && Date.now() - c.at < 24 * 3600 * 1000) return c;
    } catch (e) { }
    return null;
  }
  function writeCache(lat, lon) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ lat: lat, lon: lon, at: Date.now() })); } catch (e) { }
  }

  /** true = نهار (بين الشروق والغروب) حسب الموقع الفعلي؛ null لو تعذّر الحساب (قطبي). */
  function isDaytimeNow(lat, lon) {
    var now = new Date();
    var t = sunTimes(now, lat, lon);
    if (!t) return null;
    var sunrise = t.sunrise.getTime(), sunset = t.sunset.getTime();
    if (sunset < sunrise) sunset += 24 * 3600 * 1000;   // غروب اليوم يقع تقويمياً بعد منتصف الليل التالي أحياناً حسب خط الطول
    return now.getTime() >= sunrise && now.getTime() < sunset;
  }

  /** يستدعي done(isDay) — يحاول الموقع الحقيقي (مخزَّن أو GPS سريع)، وإلا يرجع لتقريب ٦-١٨. */
  function whenDay(done) {
    var cached = readCache();
    if (cached) { done(isDaytimeNow(cached.lat, cached.lon)); return; }
    if (!navigator.geolocation) { done(fallback()); return; }
    var settled = false;
    var timer = setTimeout(function () { if (!settled) { settled = true; done(fallback()); } }, 2500);
    navigator.geolocation.getCurrentPosition(function (pos) {
      if (settled) return;
      settled = true; clearTimeout(timer);
      writeCache(pos.coords.latitude, pos.coords.longitude);
      done(isDaytimeNow(pos.coords.latitude, pos.coords.longitude));
    }, function () {
      if (settled) return;
      settled = true; clearTimeout(timer);
      done(fallback());
    }, { maximumAge: 3600000, timeout: 2000 });
  }
  function fallback() {
    var h = new Date().getHours();
    return h >= 6 && h < 18;
  }

  w.SunTime = { whenDay: whenDay, isDaytimeNow: isDaytimeNow, sunTimes: sunTimes };
})(window);
