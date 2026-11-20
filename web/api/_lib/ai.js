// FinTrack AI: transaction categoriser (trained in ml/train_categoriser.py) and a spending forecast.
import { readFileSync } from "node:fs";

const model = JSON.parse(readFileSync(new URL("./models/categoriser.json", import.meta.url), "utf8"));
const index = new Map(model.vocab.map((t, i) => [t, i]));
const [MIN_N, MAX_N] = model.ngram;

// Same preprocessing and char_wb n-grams as scikit-learn's TfidfVectorizer used in training.
export function preprocess(s) {
  return String(s).toLowerCase().replace(/\S*\d\S*/g, " ").replace(/[^a-z&' ]+/g, " ").replace(/\s+/g, " ").trim();
}
function ngrams(text) {
  const out = [];
  for (const word of text.split(" ").filter(Boolean)) {
    const w = " " + word + " ";
    for (let n = MIN_N; n <= MAX_N; n++) {
      let offset = 0;
      out.push(w.slice(offset, offset + n));
      while (offset + n < w.length) { offset++; out.push(w.slice(offset, offset + n)); }
      if (offset === 0) break;
    }
  }
  return out;
}
function features(text) {
  const tf = new Map();
  for (const g of ngrams(preprocess(text))) { const i = index.get(g); if (i !== undefined) tf.set(i, (tf.get(i) || 0) + 1); }
  let norm = 0;
  for (const [i, c] of tf) { const v = (1 + Math.log(c)) * model.idf[i]; tf.set(i, v); norm += v * v; }
  norm = Math.sqrt(norm) || 1;
  for (const [i, v] of tf) tf.set(i, v / norm);
  return tf;
}

/** Probabilities for every category, highest first. */
export function predict(description) {
  const x = features(description);
  const z = model.labels.map((_, k) => { let s = model.intercept[k]; for (const [i, v] of x) s += model.coef[k][i] * v; return s; });
  const max = Math.max(...z); const e = z.map((v) => Math.exp(v - max)); const sum = e.reduce((a, b) => a + b, 0);
  return model.labels.map((label, k) => ({ label, p: e[k] / sum })).sort((a, b) => b.p - a.p);
}

export const MIN_CONFIDENCE = 0.4;
/** Category for a new transaction: the user's own corrections first, then the model. */
export function categorise(description, amount, learned) {
  const key = merchantKey(description);
  if (learned && key && learned.has(key)) return { category: learned.get(key), confidence: 1, source: "learned" };
  const [top, second] = predict(description);
  let category = top.p >= MIN_CONFIDENCE ? top.label : "Uncategorised";
  // money in can only be income or a transfer; money out is never income
  // money in is income unless the model is fairly sure it is a transfer between accounts
  let confidence = top.p;
  if (amount > 0) { const tr = predict(description).find((x) => x.label === "Transfers").p; category = tr >= 0.6 ? "Transfers" : "Income"; confidence = category === "Transfers" ? tr : 1 - tr; }
  if (amount < 0 && category === "Income") category = second && second.p >= 0.2 ? second.label : "Uncategorised";
  return { category, confidence: Math.round(confidence * 1000) / 1000, source: "model", alternatives: [top, second].filter(Boolean).map((a) => ({ label: a.label, p: Math.round(a.p * 1000) / 1000 })) };
}
/** Stable key for "the same merchant": the first two meaningful words without card prefixes. */
export function merchantKey(description) {
  const stop = new Set(["pos", "purchase", "card", "visa", "mc", "debit", "online", "ecom", "ib", "mb", "txn", "ref", "auth", "id", "pk"]);
  return preprocess(description).split(" ").filter((w) => w.length > 1 && !stop.has(w)).slice(0, 2).join(" ");
}
export const modelInfo = () => ({ name: model.name, type: model.type, labels: model.labels, features: model.vocab.length, metrics: model.metrics });

// ---------- forecasting ----------
/**
 * Holt's linear trend (double exponential smoothing). alpha/beta are chosen per series by
 * minimising one-step-ahead squared error on the user's own history, then the next value is projected.
 */
export function holt(series) {
  const y = series.map(Number);
  if (y.length === 0) return { forecast: 0, alpha: null, beta: null, mae: null, method: "none" };
  if (y.length < 3) { const m = y.reduce((a, b) => a + b, 0) / y.length; return { forecast: m, alpha: null, beta: null, mae: null, method: "mean" }; }
  let best = null;
  for (let a = 0.1; a <= 0.91; a += 0.1) for (let b = 0.0; b <= 0.61; b += 0.1) {
    let level = y[0], trend = y[1] - y[0], err = 0;
    for (let t = 1; t < y.length; t++) {
      const f = level + trend; err += Math.abs(y[t] - f);
      const prev = level; level = a * y[t] + (1 - a) * (level + trend); trend = b * (level - prev) + (1 - b) * trend;
    }
    const mae = err / (y.length - 1);
    if (!best || mae < best.mae) best = { mae, alpha: a, beta: b, forecast: level + trend };
  }
  const naive = y.slice(1).reduce((s, v, i) => s + Math.abs(v - y[i]), 0) / (y.length - 1);
  return { forecast: Math.max(0, best.forecast), alpha: +best.alpha.toFixed(1), beta: +best.beta.toFixed(1), mae: best.mae, naiveMae: naive, method: "holt" };
}

/** Projects this month's final spend from the days elapsed and the history-based forecast. */
export function blendMonth(spentSoFar, dayOfMonth, daysInMonth, historyForecast) {
  const pace = dayOfMonth > 0 ? (spentSoFar / dayOfMonth) * daysInMonth : 0;
  const w = Math.min(1, dayOfMonth / daysInMonth); // trust the current pace more as the month goes on
  if (!historyForecast) return Math.max(spentSoFar, pace);
  return Math.max(spentSoFar, w * pace + (1 - w) * historyForecast);
}

/** Flags transactions that are unusually large for their category (robust z-score using median/MAD). */
export function unusual(txs) {
  const by = new Map();
  for (const t of txs) if (t.amount < 0) { const a = by.get(t.category) || []; a.push(-t.amount); by.set(t.category, a); }
  const stats = new Map();
  for (const [c, a] of by) {
    if (a.length < 4) continue;
    const s = [...a].sort((x, y) => x - y); const med = s[Math.floor(s.length / 2)];
    const mad = [...s.map((v) => Math.abs(v - med))].sort((x, y) => x - y)[Math.floor(s.length / 2)] || med * 0.25 || 1;
    stats.set(c, { med, mad });
  }
  return txs.filter((t) => t.amount < 0 && stats.has(t.category)).map((t) => {
    const { med, mad } = stats.get(t.category); const z = (0.6745 * (-t.amount - med)) / mad;
    return { ...t, score: Math.round(z * 10) / 10, typical: Math.round(med * 100) / 100 };
  }).filter((t) => t.score >= 3.5).sort((a, b) => b.score - a.score).slice(0, 8);
}
