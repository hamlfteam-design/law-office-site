#!/usr/bin/env node
// تكملة بيانات بوابة الموكلين في Firestore — شوف README.md في نفس الفولدر.
//
//   node backfill.mjs --inspect   أسماء الحقول بس (من غير أي قيم) لعيّنة موكلين وقضايا
//   node backfill.mjs             تجربة: بيحسب كل حاجة ويكتب تقرير، من غير ما يغيّر Firestore
//   node backfill.mjs --apply     بيكتب فعلاً
//   --full                        قراءة كاملة من Firestore (من غير الكاش)
//   --state=PATH                  مكان الكاش المحلي المشفّر (الافتراضي state/cache.bin)
//
// القراءة: أول مرة (أو مرة كل FULL_EVERY_DAYS أيام) بيقرا كل الموكلين والقضايا ويحفظهم
// في كاش محلي مشفّر. باقي المرات بيقرا من Firestore بس اللي updatedAt بتاعه اتغيّر
// من آخر تشغيل + الموكلين المربوطين بالبوابة، ويكمّل الباقي من الكاش.
// الكتابة: بس الوثايق اللي محتاجة تعديل فعلاً (plan.mjs بيقارن قبل ما يكتب).
//
// المفتاح: ملف Service Account في نفس الفولدر باسم service-account.json،
// أو مساره في متغيّر البيئة GOOGLE_APPLICATION_CREDENTIALS.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { buildPlan, parseJson } from "./plan.mjs";
import { CLIENT_FIELDS, CASE_FIELDS, pick, keyFrom, emptyState, loadState, saveState, applyWrites, toDocs } from "./state.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = "profissional-lawyer-updat";
const OFFICE_ID = process.env.OFFICE_ID || "office_UDdH9ctTHcd3";   // نفس portal/portal-config.js
const CLIENTS = `offices/${OFFICE_ID}/records/clients/items`;
const CASES = `offices/${OFFICE_ID}/records/cases/items`;

const argv = process.argv.slice(2);
const args = new Set(argv);
const APPLY = args.has("--apply");
const INSPECT = args.has("--inspect");
const NO_REPORT = args.has("--no-report");   // التشغيل التلقائي: من غير ملف تقرير (فيه إيميلات)
// حد أقصى للتعديلات في المرة الواحدة — لو اتعدّاه السكريبت بيقف من غير ما يكتب حاجة
// (حماية من تعديل جماعي غلط في التشغيل التلقائي). --max-writes=0 = من غير حد.
const maxArg = argv.find((a) => a.startsWith("--max-writes="));
const MAX_WRITES = maxArg ? Number(maxArg.split("=")[1]) : 0;
const FORCE_FULL = args.has("--full");
const stateArg = argv.find((a) => a.startsWith("--state="));
const STATE_FILE = stateArg ? stateArg.split("=")[1] : join(HERE, "state", "cache.bin");
const FULL_EVERY_DAYS = 7;          // قراءة كاملة احتياطي مرة في الأسبوع (حذف، أو تعديل من غير updatedAt)
const OVERLAP_MS = 15 * 60000;      // هامش فرق ساعات الأجهزة (updatedAt بيتكتب بساعة الجهاز)

// المفتاح: متغيّر FIREBASE_SERVICE_ACCOUNT (نص JSON — للتشغيل التلقائي على GitHub)،
// أو service-account.json في الفولدر، أو GOOGLE_APPLICATION_CREDENTIALS
const keyFile = join(HERE, "service-account.json");
const saJson = process.env.FIREBASE_SERVICE_ACCOUNT || (existsSync(keyFile) ? readFileSync(keyFile, "utf8") : null);
const credential = saJson ? cert(JSON.parse(saJson)) : applicationDefault();
// مفتاح تشفير الكاش من المفتاح الخاص بحساب الخدمة — من غيره مفيش كاش (قراءة كاملة كل مرة)
const STATE_KEY = saJson ? keyFrom(JSON.parse(saJson).private_key || saJson) : null;
initializeApp({
  credential,
  projectId: PROJECT_ID,
});
const db = getFirestore();

async function readAll(path) {
  const snap = await db.collection(path).get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

function keysSummary(docs) {
  const top = new Map(), inner = new Map();
  for (const { data } of docs) {
    for (const k of Object.keys(data)) top.set(k, (top.get(k) || 0) + 1);
    for (const k of Object.keys(parseJson(data.json))) inner.set(k, (inner.get(k) || 0) + 1);
  }
  const fmt = (m) => [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join(", ");
  return { top: fmt(top), json: fmt(inner) };
}

let reads = 0;
const count = (snap) => { reads += Math.max(1, snap.size); return snap.docs; };
const toMap = (docs, fields) => Object.fromEntries(docs.map((d) => [d.id, pick(d.data(), fields)]));

/* بيرجّع الكاش بعد ما يتحدّث من Firestore — كامل أو باللي اتغيّر بس */
async function syncState(startedAt) {
  const cached = STATE_KEY && !FORCE_FULL ? loadState(STATE_FILE, STATE_KEY) : null;
  const stale = !cached || !cached.fullAt || startedAt - Date.parse(cached.fullAt) > FULL_EVERY_DAYS * 864e5;
  if (stale) {
    const [cl, ca, ix] = await Promise.all([
      db.collection(CLIENTS).get(), db.collection(CASES).get(), db.collection("portalEmails").get()]);
    const s = emptyState();
    s.clients = toMap(count(cl), CLIENT_FIELDS);
    s.cases = toMap(count(ca), CASE_FIELDS);
    s.portalEmails = Object.fromEntries(count(ix).map((d) => [d.id, d.data()]));
    s.fullAt = new Date(startedAt).toISOString();
    return { state: s, mode: "كاملة" };
  }
  const since = Timestamp.fromMillis(Date.parse(cached.lastRunAt) - OVERLAP_MS);
  const [cl, ca, linked] = await Promise.all([
    db.collection(CLIENTS).where("updatedAt", ">", since).get(),
    db.collection(CASES).where("updatedAt", ">", since).get(),
    // ربط البوابة (clientUid) بيتكتب من غير ما يغيّر updatedAt — نفس اللي التطبيق بيعمله
    db.collection(CLIENTS).where("clientUid", ">", "").get(),
  ]);
  for (const d of [...count(cl), ...count(linked)]) cached.clients[d.id] = pick(d.data(), CLIENT_FIELDS);
  for (const d of count(ca)) cached.cases[d.id] = pick(d.data(), CASE_FIELDS);
  return { state: cached, mode: `باللي اتغيّر بس (موكلين ${cl.size}، قضايا ${ca.size})` };
}

/* قبل الكتابة: نتأكد إن الوثايق اللي هنعدّلها لسه موجودة (ممكن تكون اتمسحت والكاش لسه فاكرها).
   قراءة واحدة لكل وثيقة هتتكتب بس، والممسوح بيتشال من الكاش. */
async function dropDeleted(state, plan) {
  const refs = [...plan.clientWrites.map((w) => db.collection(CLIENTS).doc(w.clientId)),
    ...plan.caseWrites.map((w) => db.collection(CASES).doc(w.caseId))];
  if (!refs.length) return plan;
  const snaps = await db.getAll(...refs);
  reads += snaps.length;
  const gone = new Set(snaps.filter((s) => !s.exists).map((s) => s.ref.path));
  if (!gone.size) return plan;
  for (const p of gone) { const id = p.split("/").pop(); delete state.clients[id]; delete state.cases[id]; }
  console.log(`وثايق اتمسحت من Firestore واتشالت من الكاش: ${gone.size} — بنعيد الحساب.`);
  return buildPlan(toDocs(state.clients), toDocs(state.cases), new Map(Object.entries(state.portalEmails)));
}

async function main() {
  console.log(`مشروع ${PROJECT_ID} — مكتب ${OFFICE_ID}`);
  const startedAt = Date.now();

  if (INSPECT) {
    const [clientDocs, caseDocs] = await Promise.all([readAll(CLIENTS), readAll(CASES)]);
    console.log(`الموكلين: ${clientDocs.length} — القضايا: ${caseDocs.length}`);
    // أسماء الحقول وعدد الوثائق اللي فيها كل حقل — من غير أي بيانات موكلين
    const c = keysSummary(clientDocs), k = keysSummary(caseDocs);
    console.log("\nحقول وثيقة الموكل:", c.top, "\nجوه json الموكل:", c.json);
    console.log("\nحقول وثيقة القضية:", k.top, "\nجوه json القضية:", k.json);

    // شكل حقول الإيميل جوه json الموكل — أنواع وأعداد بس، من غير أي قيمة
    const shapes = new Map();
    const bump = (k) => shapes.set(k, (shapes.get(k) || 0) + 1);
    const shapeOf = (v) => {
      if (v === undefined) return "مش موجود";
      if (v === null) return "null";
      if (Array.isArray(v)) return v.length ? `قايمة[${[...new Set(v.map(shapeOf))].join("|")}]` : "قايمة فاضية";
      if (typeof v === "object") return `كائن{${Object.keys(v).sort().join(",")}}`;
      if (typeof v === "string") return v.trim() === "" ? "نص فاضي" : v.includes("@") ? "نص فيه @" : "نص من غير @";
      return typeof v;
    };
    for (const { data } of clientDocs) {
      const j = parseJson(data.json);
      for (const f of ["email", "emails"]) bump(`${f}: ${shapeOf(j[f])}`);
    }
    console.log("\nشكل الإيميلات جوه json الموكل:");
    for (const [k, n] of [...shapes].sort()) console.log(`  ${k} — ${n}`);
    return;
  }

  const { state, mode } = await syncState(startedAt);
  const clientDocs = toDocs(state.clients), caseDocs = toDocs(state.cases);
  console.log(`القراءة: ${mode} — ${reads} قراءة من Firestore`);
  console.log(`الموكلين: ${clientDocs.length} — القضايا: ${caseDocs.length}`);
  let plan = buildPlan(clientDocs, caseDocs, new Map(Object.entries(state.portalEmails)));
  if (APPLY) plan = await dropDeleted(state, plan);
  const { portalEmails, clientWrites, caseWrites, report } = plan;

  let reportFile = "(من غير تقرير)";
  if (!NO_REPORT) {
    reportFile = join(HERE, `report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(reportFile, JSON.stringify({ apply: APPLY, report, portalEmails, clientWrites, caseWrites }, null, 2));
  }

  console.log(`
موكلين ليهم إيميل: ${report.clientsWithEmails} من ${report.clients}
إيميلات موكلين صالحة: ${report.emails}
موكلين matchEmails هيتكمّل عندهم:     ${report.clientsToWrite}
إيميلات مكتوبة غلط (اتسابت):          ${report.invalidEmails.length}
وثائق portalEmails هتتكتب/تتحدّث:     ${report.portalEmailsToWrite}
قضايا اتعرف موكلها — بالمعرّف: ${report.casesLinked.byId}، بالحساب: ${report.casesLinked.byUid}، بالاسم: ${report.casesLinked.byName}
قضايا من غير موكل معروف:              ${report.casesWithoutClient.length}
أسماء متكررة لأكتر من موكل (اتسابت):  ${report.ambiguousNames.length}
قضايا clientEmails هيتحدّث فيها:       ${report.casesToWrite}
التقرير الكامل (فيه إيميلات — ما تشاركوش): ${reportFile}`);

  const persist = () => {
    if (!STATE_KEY) return;
    state.lastRunAt = new Date(startedAt).toISOString();
    saveState(STATE_FILE, state, STATE_KEY);
  };

  if (!APPLY) {
    persist();   // الكاش نفسه صح (اللي في Firestore)، التجربة بس ما كتبتش
    console.log("\nده كان تجربة بس — ماتغيّرش حاجة. راجع التقرير وبعدين شغّل: node backfill.mjs --apply");
    return;
  }

  const planned = portalEmails.length + clientWrites.length + caseWrites.length;
  if (MAX_WRITES > 0 && planned > MAX_WRITES) {
    console.error(`\n✗ ${planned} تعديل أكتر من الحد (${MAX_WRITES}) — ماتكتبش حاجة. شغّله يدوي بـ dry-run وراجع التقرير.`);
    process.exit(2);
  }

  // دفعات ≤ 400 كتابة (حد Firestore 500)
  let batch = db.batch(), n = 0, total = 0;
  const flush = async () => { if (n) { await batch.commit(); total += n; batch = db.batch(); n = 0; } };
  const add = async (fn) => { fn(batch); if (++n >= 400) await flush(); };

  for (const { email, data } of portalEmails) {
    if (email.includes("/")) continue;   // مينفعش يبقى معرّف وثيقة
    await add((b) => b.set(db.collection("portalEmails").doc(email),
      { ...data, backfilledAt: FieldValue.serverTimestamp() }, { merge: true }));
  }
  for (const { clientId, matchEmails } of clientWrites)
    await add((b) => b.update(db.collection(CLIENTS).doc(clientId), { matchEmails }));
  for (const { caseId, clientEmails } of caseWrites)
    await add((b) => b.update(db.collection(CASES).doc(caseId), { clientEmails }));
  await flush();
  applyWrites(state, plan);
  persist();
  console.log(`\n✓ اتكتب ${total} تعديل — إجمالي القراءات ${reads}.`);
}

main().catch((e) => { console.error("فشل:", e.message || e); process.exit(1); });
