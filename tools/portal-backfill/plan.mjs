// منطق التكملة نفسه — دوال بحتة من غير Firebase عشان تتختبر لوحدها.
// المدخل: وثائق الموكلين والقضايا كما هي في Firestore ({ id, data }).
// المخرج: الكتابات المطلوبة على portalEmails وعلى القضايا (clientEmails) + تقرير.

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

/* نفس تطبيع صفحة الدخول (portal/index.html): من غير مسافات وعلامات اتجاه،
   أرقام إنجليزية، «＠» ← @، حروف صغيرة. */
export function normalizeEmail(str) {
  return String(str || "")
    .replace(/[\s ​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/[٠-٩۰-۹]/g, (d) => { const i = ARABIC_INDIC.indexOf(d); return String(i !== -1 ? i : PERSIAN.indexOf(d)); })
    .replace(/＠/g, "@")
    .toLowerCase();
}

export function isValidEmail(e) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

/* تطبيع الأسماء العربية للمطابقة: من غير تشكيل/تطويل، أ إ آ ← ا، ة ← ه، ى ← ي، مسافة واحدة */
export function normalizeName(str) {
  return String(str || "")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function parseJson(raw) {
  try { return JSON.parse(raw || "{}") || {}; } catch { return {}; }
}

const NAME_KEYS = ["name", "fullName", "clientName", "full_name"];
export function clientName(c) {
  for (const k of NAME_KEYS) if (c[k]) return String(c[k]);
  return "";
}

/* أي حقل في JSON القضية اسمه شبه clientId / clientIds / client_ids — لو التطبيق بيخزّن الربط بالمعرّف */
export function explicitClientIds(caseJson) {
  const ids = [];
  for (const [k, v] of Object.entries(caseJson)) {
    if (!/^clients?_?ids?$/i.test(k)) continue;
    if (Array.isArray(v)) v.forEach((x) => x != null && ids.push(String(x)));
    else if (v != null && v !== "") ids.push(String(v));
  }
  return ids;
}

/* حقل clients في القضية نص واحد بيجمع أكتر من طرف مفصول بـ «·» (زي dashboard.html) */
export function caseClientNames(caseJson) {
  const v = caseJson.clients;
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" && x ? clientName(x) : String(x))).filter(Boolean);
  if (!v) return [];
  return String(v).split("·").map((s) => s.trim()).filter(Boolean);
}

const FOREIGN_ID = /جواز|إقامة|اقامة/;

export function buildPlan(clientDocs, caseDocs, existingIndex = new Map()) {
  const report = {
    clients: clientDocs.length, cases: caseDocs.length,
    invalidEmails: [],          // { clientId, raw }
    emails: 0,
    portalEmailsToWrite: 0,
    casesLinked: { byId: 0, byUid: 0, byName: 0 },
    casesWithoutClient: [],     // { caseId, names }
    ambiguousNames: [],         // { caseId, name, clientIds }
    unknownNames: [],           // { caseId, name }
    casesToWrite: 0,
  };

  // ---------- الموكلين: إيميلاتهم المطبّعة ----------
  const clients = new Map();   // id -> { emails, clientUid, foreign, name }
  const byEmail = new Map();   // email -> [clientId]
  const byUid = new Map();     // uid -> [clientId]
  const byName = new Map();    // normalizedName -> [clientId]
  for (const { id, data } of clientDocs) {
    const j = parseJson(data.json);
    const emails = [];
    for (const raw of Array.isArray(data.matchEmails) ? data.matchEmails : []) {
      const e = normalizeEmail(raw);
      if (!e) continue;
      if (!isValidEmail(e)) { report.invalidEmails.push({ clientId: id, raw: String(raw) }); continue; }
      if (!emails.includes(e)) emails.push(e);
    }
    const c = { emails, clientUid: data.clientUid || null, foreign: FOREIGN_ID.test(String(j.idType || "")), name: clientName(j) };
    clients.set(id, c);
    for (const e of emails) (byEmail.get(e) || byEmail.set(e, []).get(e)).push(id);
    if (c.clientUid) (byUid.get(c.clientUid) || byUid.set(c.clientUid, []).get(c.clientUid)).push(id);
    const n = normalizeName(c.name);
    if (n) (byName.get(n) || byName.set(n, []).get(n)).push(id);
  }
  report.emails = byEmail.size;

  // ---------- portalEmails/{email} ----------
  // linked: أي سجل للإيميل ده مربوط بحساب (أو الفهرس الحالي بيقول كده)
  // pending: سجلات الإيميل اللي لسه ما اتربطتش — صفحة الدخول بتربطها أول تسجيل
  // بنكتب الحقول دي بس (merge) — أي حقل تاني موجود (زي collab) بيفضل زي ما هو
  const portalEmails = [];
  for (const [email, ids] of byEmail) {
    const cur = existingIndex.get(email) || null;
    const next = {
      linked: ids.some((id) => clients.get(id).clientUid) || !!(cur && cur.linked),
      pending: ids.filter((id) => !clients.get(id).clientUid).sort(),
      foreign: ids.some((id) => clients.get(id).foreign),
    };
    const same = cur && cur.linked === next.linked && !!cur.foreign === next.foreign &&
      JSON.stringify([...(cur.pending || [])].sort()) === JSON.stringify(next.pending);
    if (!same) portalEmails.push({ email, data: next, existed: !!cur });
  }
  report.portalEmailsToWrite = portalEmails.length;

  // ---------- القضايا: clientEmails ----------
  // الموكلين بتوع القضية بالترتيب ده: معرّف صريح في JSON ← clientUids الحالية ← الاسم
  // (الاسم بس لو مطابق لموكل واحد — اسم متكرر بيتسجّل في التقرير ومش بيتربط، عشان
  //  قضية ما تظهرش لحد غير صاحبها)
  const caseWrites = [];
  for (const { id, data } of caseDocs) {
    const j = parseJson(data.json);
    const linked = new Set();
    let how = null;

    for (const cid of explicitClientIds(j)) if (clients.has(cid)) { linked.add(cid); how = how || "byId"; }
    for (const uid of Array.isArray(data.clientUids) ? data.clientUids : [])
      for (const cid of byUid.get(uid) || []) { if (!linked.has(cid)) { linked.add(cid); how = how || "byUid"; } }
    if (!linked.size) {
      for (const name of caseClientNames(j)) {
        const hits = byName.get(normalizeName(name)) || [];
        if (hits.length === 1) { linked.add(hits[0]); how = how || "byName"; }
        else if (hits.length > 1) report.ambiguousNames.push({ caseId: id, name, clientIds: hits });
        else report.unknownNames.push({ caseId: id, name });
      }
    }
    if (how) report.casesLinked[how]++;
    else report.casesWithoutClient.push({ caseId: id, names: caseClientNames(j) });

    const emails = new Set();
    for (const cid of linked) for (const e of clients.get(cid).emails) emails.add(e);
    const next = [...emails].sort();
    const cur = Array.isArray(data.clientEmails) ? [...data.clientEmails].sort() : null;
    if (JSON.stringify(cur) !== JSON.stringify(next) && !(cur === null && next.length === 0))
      caseWrites.push({ caseId: id, clientEmails: next });
  }
  report.casesToWrite = caseWrites.length;

  return { portalEmails, caseWrites, report };
}
