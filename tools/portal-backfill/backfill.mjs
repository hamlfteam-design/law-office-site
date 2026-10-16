#!/usr/bin/env node
// تكملة بيانات بوابة الموكلين في Firestore — شوف README.md في نفس الفولدر.
//
//   node backfill.mjs --inspect   أسماء الحقول بس (من غير أي قيم) لعيّنة موكلين وقضايا
//   node backfill.mjs             تجربة: بيحسب كل حاجة ويكتب تقرير، من غير ما يغيّر Firestore
//   node backfill.mjs --apply     بيكتب فعلاً
//
// المفتاح: ملف Service Account في نفس الفولدر باسم service-account.json،
// أو مساره في متغيّر البيئة GOOGLE_APPLICATION_CREDENTIALS.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { buildPlan, parseJson } from "./plan.mjs";

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

// المفتاح: متغيّر FIREBASE_SERVICE_ACCOUNT (نص JSON — للتشغيل التلقائي على GitHub)،
// أو service-account.json في الفولدر، أو GOOGLE_APPLICATION_CREDENTIALS
const keyFile = join(HERE, "service-account.json");
const credential = process.env.FIREBASE_SERVICE_ACCOUNT
  ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  : existsSync(keyFile) ? cert(JSON.parse(readFileSync(keyFile, "utf8"))) : applicationDefault();
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

async function main() {
  console.log(`مشروع ${PROJECT_ID} — مكتب ${OFFICE_ID}`);
  const [clientDocs, caseDocs] = await Promise.all([readAll(CLIENTS), readAll(CASES)]);
  console.log(`الموكلين: ${clientDocs.length} — القضايا: ${caseDocs.length}`);

  if (INSPECT) {
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

  const ixSnap = await db.collection("portalEmails").get();
  const existingIndex = new Map(ixSnap.docs.map((d) => [d.id, d.data()]));
  const { portalEmails, clientWrites, caseWrites, report } = buildPlan(clientDocs, caseDocs, existingIndex);

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

  if (!APPLY) {
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
  console.log(`\n✓ اتكتب ${total} تعديل.`);
}

main().catch((e) => { console.error("فشل:", e.message || e); process.exit(1); });
