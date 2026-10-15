import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, normalizeEmail, normalizeName } from "./plan.mjs";

const client = (id, emails, extra = {}, json = {}) => ({ id, data: { matchEmails: emails, json: JSON.stringify(json), ...extra } });
const kase = (id, json, extra = {}) => ({ id, data: { json: JSON.stringify(json), ...extra } });

test("normalizeEmail: Arabic digits, spaces, case, fullwidth @", () => {
  assert.equal(normalizeEmail(" Ahmed١٩٨٠ @Hotmail.com‏"), "ahmed1980@hotmail.com");
  assert.equal(normalizeEmail("ali۲۳＠Yahoo.COM"), "ali23@yahoo.com");
});

test("normalizeName: hamza, taa marbuta, alef maqsura, tashkeel", () => {
  assert.equal(normalizeName("أحمد  مُحمّد  عطيّة"), normalizeName("احمد محمد عطيه"));
  assert.equal(normalizeName("مصطفى"), normalizeName("مصطفي"));
});

test("portalEmails: every valid email, linked/pending/foreign, invalid skipped", () => {
  const { portalEmails, report } = buildPlan([
    client("c1", ["Sara@Outlook.com"], { clientUid: "u1" }),
    client("c2", ["sara@outlook.com "]),                        // نفس الإيميل، سجل تاني مش مربوط
    client("c3", ["mona٥@yahoo.com"], {}, { idType: "جواز سفر" }),
    client("c4", ["not-an-email"]),
  ], []);
  const by = Object.fromEntries(portalEmails.map((p) => [p.email, p.data]));
  assert.deepEqual(by["sara@outlook.com"], { linked: true, pending: ["c2"], foreign: false });
  assert.deepEqual(by["mona5@yahoo.com"], { linked: false, pending: ["c3"], foreign: true });
  assert.equal(report.invalidEmails.length, 1);
});

test("portalEmails: unchanged entries are not rewritten, existing linked kept", () => {
  const existing = new Map([["a@x.com", { linked: true, pending: [], foreign: false, collab: false }]]);
  const { portalEmails } = buildPlan([client("c1", ["a@x.com"], { clientUid: "u1" })], [], existing);
  assert.equal(portalEmails.length, 0);
  const { portalEmails: p2 } = buildPlan([client("c1", ["a@x.com"])], [], existing);
  assert.equal(p2[0].data.linked, true);   // الفهرس قال مربوط — ما نرجّعوش false
});

test("cases: linked by explicit id, by uid, by unique name; ambiguous name skipped", () => {
  const clients = [
    client("c1", ["one@x.com"], {}, { name: "أحمد علي" }),
    client("c2", ["two@x.com"], { clientUid: "u2" }, { name: "منى حسن" }),
    client("c3", ["three@x.com"], {}, { name: "محمد سعيد" }),
    client("c4", ["four@x.com"], {}, { name: "محمد سعيد" }),   // نفس الاسم
  ];
  const cases = [
    kase("k1", { clientIds: ["c1"] }),
    kase("k2", { clients: "منى حسن" }, { clientUids: ["u2"] }),
    kase("k3", { clients: "احمد علي · شخص مش موجود" }),
    kase("k4", { clients: "محمد سعيد" }),
    kase("k5", { clients: "" }, { clientEmails: ["one@x.com"] }),   // اتشال موكلها — يتمسح
  ];
  const { caseWrites, report } = buildPlan(clients, cases);
  const by = Object.fromEntries(caseWrites.map((w) => [w.caseId, w.clientEmails]));
  assert.deepEqual(by.k1, ["one@x.com"]);
  assert.deepEqual(by.k2, ["two@x.com"]);
  assert.deepEqual(by.k3, ["one@x.com"]);
  assert.equal(by.k4, undefined);                // متكرر — ما يتربطش بحد
  assert.deepEqual(by.k5, []);
  assert.deepEqual(report.casesLinked, { byId: 1, byUid: 1, byName: 1 });
  assert.equal(report.ambiguousNames.length, 1);
  assert.equal(report.unknownNames.length, 1);
});

test("cases: no write when clientEmails already correct", () => {
  const { caseWrites } = buildPlan([client("c1", ["a@x.com"], { clientUid: "u1" })],
    [kase("k1", {}, { clientUids: ["u1"], clientEmails: ["a@x.com"] })]);
  assert.equal(caseWrites.length, 0);
});

test("client emails come from matchEmails and json email/emails; matchEmails filled", () => {
  const { clientWrites, portalEmails, report } = buildPlan([
    client("c1", undefined, {}, { email: "Ahmed@Hotmail.com", emails: ["ahmed@hotmail.com", "a2@x.com"] }),
    client("c2", ["b@x.com"], {}, { emails: "b@x.com, c@x.com" }),
    client("c3", ["d@x.com"], {}, { email: "d@x.com" }),           // مكتمل
    client("c4", undefined, {}, { email: "mo hamed@yahoo.com" }),   // مسافة جوه إيميل واحد
    client("c5", undefined, {}, { emails: "e@x.com f@y.com" }),     // اتنين بمسافة
  ], []);
  const by = Object.fromEntries(clientWrites.map((w) => [w.clientId, w.matchEmails]));
  assert.deepEqual(by.c1, ["ahmed@hotmail.com", "a2@x.com"]);
  assert.deepEqual(by.c2, ["b@x.com", "c@x.com"]);
  assert.equal(by.c3, undefined);
  assert.deepEqual(by.c4, ["mohamed@yahoo.com"]);
  assert.deepEqual(by.c5, ["e@x.com", "f@y.com"]);
  assert.equal(report.clientsWithEmails, 5);
  assert.ok(portalEmails.some((p) => p.email === "a2@x.com"));
});

test("case client names ignore capacity in parentheses", () => {
  const { caseWrites } = buildPlan([client("c1", ["a@x.com"], {}, { name: "سامي فؤاد" })],
    [kase("k1", { clients: "سامي فؤاد (مدعي)" })]);
  assert.deepEqual(caseWrites[0].clientEmails, ["a@x.com"]);
});
