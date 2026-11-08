// كاش محلي مشفّر لبيانات التكملة — عشان التشغيل العادي يقرا من Firestore اللي اتغيّر بس.
// فيه إيميلات موكلين، فبيتحفظ مشفّر AES-256-GCM بمفتاح مشتق من مفتاح الخدمة (Secret)،
// يعني لو حد وصل لملف الكاش من غير الـSecret مش هيقدر يقراه.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const VERSION = 1;

// الحقول اللي منطق التكملة (plan.mjs) محتاجها بس — مش بنحتفظ بأي حاجة غيرها
export const CLIENT_FIELDS = ["json", "matchEmails", "clientUid"];
export const CASE_FIELDS = ["json", "clientUids", "clientEmails"];

export function pick(data, fields) {
  const out = {};
  for (const f of fields) if (data[f] !== undefined) out[f] = data[f];
  return out;
}

export function keyFrom(secret) {
  return createHash("sha256").update("portal-backfill-state:" + secret).digest();
}

export function emptyState() {
  return { v: VERSION, fullAt: null, lastRunAt: null, clients: {}, cases: {}, portalEmails: {} };
}

export function encrypt(obj, key) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function decrypt(buf, key) {
  const d = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8"));
}

/* بيرجّع null لو مفيش كاش، أو تالف، أو المفتاح اتغيّر، أو نسخة قديمة — ساعتها قراءة كاملة */
export function loadState(path, key) {
  if (!existsSync(path)) return null;
  try {
    const s = decrypt(readFileSync(path), key);
    return s && s.v === VERSION ? s : null;
  } catch { return null; }
}

export function saveState(path, state, key) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encrypt(state, key));
}

/* بعد الكتابة: نحدّث الكاش بنفس اللي اتكتب، من غير ما نقرا تاني من Firestore */
export function applyWrites(state, { portalEmails, clientWrites, caseWrites }) {
  for (const { email, data } of portalEmails)
    state.portalEmails[email] = { ...(state.portalEmails[email] || {}), ...data };
  for (const { clientId, matchEmails } of clientWrites)
    if (state.clients[clientId]) state.clients[clientId].matchEmails = matchEmails;
  for (const { caseId, clientEmails } of caseWrites)
    if (state.cases[caseId]) state.cases[caseId].clientEmails = clientEmails;
}

export const toDocs = (map) => Object.entries(map).map(([id, data]) => ({ id, data }));
