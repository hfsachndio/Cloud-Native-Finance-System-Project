// Tests for FinTrack's AI: run with `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { predict, categorise, merchantKey, holt, blendMonth, unusual, preprocess } from "../api/_lib/ai.js";

test("JS inference reproduces scikit-learn's predictions exactly", () => {
  const samples = JSON.parse(readFileSync(new URL("../../ml/reports/parity.json", import.meta.url), "utf8"));
  for (const s of samples) {
    const [top] = predict(s.text);
    assert.equal(top.label, s.label, s.text);
    assert.ok(Math.abs(top.p - s.p) < 0.002, `${s.text}: ${top.p} vs ${s.p}`);
  }
});

test("categorises realistic statement lines", () => {
  const cases = { "POS IMTIAZ SUPERMARKET KARACHI": "Groceries", "CAREEM RIDE 14/11": "Transport", "K-ELECTRIC BILL REF 99812": "Bills", "D-WATSON PHARMACY": "Health",
    "NETFLIX.COM SUBSCRIPTION": "Entertainment", "PIZZA HUT GULBERG": "Dining", "DARAZ ONLINE ORDER #5512": "Shopping", "RAAST TRANSFER TO ALI": "Transfers" };
  for (const [text, want] of Object.entries(cases)) assert.equal(categorise(text, -25).category, want, text);
});

test("money in is income unless clearly a transfer; money out is never income", () => {
  assert.equal(categorise("Monthly salary credit", 3000).category, "Income");
  assert.equal(categorise("Freelance payment Upwork", 450).category, "Income");
  assert.notEqual(categorise("Salary credit", -50).category, "Income");
});

test("user corrections override the model for that merchant", () => {
  const learned = new Map([[merchantKey("POS ALI BHAI KIRYANA 2231"), "Groceries"]]);
  const r = categorise("ali bhai kiryana store", -12, learned);
  assert.equal(r.category, "Groceries"); assert.equal(r.source, "learned");
});

test("low confidence falls back to Uncategorised", () => {
  const r = categorise("xqzv", -10);
  assert.ok(r.confidence < 0.4 ? r.category === "Uncategorised" : true);
});

test("preprocess strips reference numbers and punctuation", () => {
  assert.equal(preprocess("POS #5512 Daraz.pk ORDER-99"), "pos daraz pk");
});

test("Holt forecast follows a trend and beats the naive forecast on it", () => {
  const h = holt([100, 120, 140, 160, 180, 200]);
  assert.ok(Math.abs(h.forecast - 220) < 5, `forecast ${h.forecast}`);
  assert.ok(h.mae <= h.naiveMae);
  assert.equal(holt([]).method, "none"); assert.equal(holt([50, 70]).method, "mean");
});

test("month projection blends pace and forecast and never drops below what is spent", () => {
  assert.equal(blendMonth(300, 30, 30, 100), 300);
  assert.ok(blendMonth(100, 10, 30, 400) > 100);
  assert.equal(blendMonth(50, 5, 30, 0), 300);
});

test("unusual payments: a huge grocery bill is flagged, normal ones are not", () => {
  const txs = [20, 25, 22, 30, 27, 24, 400].map((a, i) => ({ id: String(i), description: "shop", category: "Groceries", amount: -a, date: "2026-11-01" }));
  const u = unusual(txs);
  assert.equal(u.length, 1); assert.equal(u[0].amount, -400);
});
