import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keyFrom, emptyState, loadState, saveState, applyWrites, pick, CLIENT_FIELDS } from "./state.mjs";

const dir = mkdtempSync(join(tmpdir(), "pb-"));

test("الكاش بيتحفظ مشفّر ويرجع زي ما هو", () => {
  const key = keyFrom("secret-a"), p = join(dir, "s.bin");
  const s = emptyState(); s.clients.c1 = { json: '{"email":"a@b.co"}' };
  saveState(p, s, key);
  assert.deepEqual(loadState(p, key), s);
});

test("مفتاح غلط أو ملف تالف = مفيش كاش (قراءة كاملة)", () => {
  const p = join(dir, "s2.bin");
  saveState(p, emptyState(), keyFrom("a"));
  assert.equal(loadState(p, keyFrom("b")), null);
  writeFileSync(p, "garbage"); assert.equal(loadState(p, keyFrom("a")), null);
  assert.equal(loadState(join(dir, "none.bin"), keyFrom("a")), null);
});

test("pick بياخد حقول المنطق بس", () => {
  assert.deepEqual(pick({ json: "{}", owner: "x", clientUid: "u" }, CLIENT_FIELDS), { json: "{}", clientUid: "u" });
});

test("applyWrites بيحدّث الكاش باللي اتكتب", () => {
  const s = emptyState(); s.clients.c1 = { json: "{}" }; s.cases.k1 = { json: "{}" };
  applyWrites(s, { portalEmails: [{ email: "a@b.co", data: { linked: false, pending: ["c1"], foreign: false } }],
    clientWrites: [{ clientId: "c1", matchEmails: ["a@b.co"] }], caseWrites: [{ caseId: "k1", clientEmails: ["a@b.co"] }] });
  assert.deepEqual(s.clients.c1.matchEmails, ["a@b.co"]);
  assert.deepEqual(s.cases.k1.clientEmails, ["a@b.co"]);
  assert.deepEqual(s.portalEmails["a@b.co"].pending, ["c1"]);
});
