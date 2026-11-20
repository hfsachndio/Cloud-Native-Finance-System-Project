// Domain rules ported from FinTrack.Shared/Domain (same behaviour as the .NET services).
export const round2 = (n) => Math.round(n * 100) / 100;
export const ymd = (d) => d.toISOString().slice(0, 10);
export const ym = (d) => (typeof d === "string" ? d : ymd(d)).slice(0, 7);
export const thisMonth = () => ym(new Date());
export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

import { categorise as aiCategorise } from "./ai.js";
// Categories come from the trained model in ai.js (the old keyword rules are the baseline in ml/reports).
export function categorise(description, amount) { return aiCategorise(description, amount).category; }

export function progress(b, txs) {
  const spent = round2(txs.filter((t) => t.amount < 0 && t.category.toLowerCase() === b.category.toLowerCase() && ym(t.date) === b.month)
    .reduce((s, t) => s - t.amount, 0));
  const percent = b.limit === 0 ? 0 : Math.round((spent / b.limit) * 1000) / 10;
  return { category: b.category, month: b.month, limit: b.limit, spent, remaining: Math.max(0, round2(b.limit - spent)), percent, overThreshold: spent >= b.limit * b.alertThreshold };
}

/** Port of SeedData.cs: the starter data every new workspace gets. */
export function seedData() {
  const now = new Date().toISOString();
  const today = new Date();
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return ymd(d); };
  const monthsAgo = (n) => { const d = new Date(today); d.setMonth(d.getMonth() - n); return ymd(d); };
  const ids = { checking: newId(), savings: newId(), card: newId(), cash: newId() };
  const accounts = [
    { id: ids.checking, name: "Main checking", kind: "Checking", mask: "4471", balance: 8240.5 },
    { id: ids.savings, name: "Savings", kind: "Savings", mask: "0921", balance: 3600 },
    { id: ids.card, name: "Credit card", kind: "CreditCard", mask: "2210", balance: -412.3 },
    { id: ids.cash, name: "Cash wallet", kind: "Cash", mask: "", balance: 1052.3 },
  ];
  const rows = [
    ["SALARY CREDIT ACME LTD", 3200, 1, "Completed", null], ["POS IMTIAZ SUPERMARKET KARACHI", -86.4, 1, "Processing", "receipt.pdf"],
    ["K-ELECTRIC BILL PAYMENT REF 88213", -64.1, 2, "Completed", "bill.png"], ["CAREEM RIDE 14/11", -12.75, 3, "Completed", null],
    ["Freelance payment Upwork", 450, 4, "Completed", "invoice.pdf"], ["D-WATSON PHARMACY ISB", -23.9, 5, "Completed", "rx.jpg"],
    ["CINEPAX CINEMA LAHORE", -28, 6, "Completed", null], ["DARAZ ONLINE ORDER #55120", -142.35, 7, "NeedsReview", "order.pdf"],
    ["KABABJEES RESTAURANT", -54.2, 8, "Completed", "bill.jpg"], ["NAYATEL BROADBAND", -39.99, 9, "Completed", null],
    ["APPLE STORE DOLMEN MALL", -1299, 10, "Completed", null],
  ];
  const transactions = rows.map(([description, amount, ago, status, receipt]) => { const g = aiCategorise(description, amount); return {
    id: newId(), accountId: ids.checking, description, amount, category: g.category, aiConfidence: g.confidence, aiSource: "model", date: daysAgo(ago),
    status, receiptBlob: receipt ? `samples/${receipt}` : null, receiptTotal: status === "Completed" && receipt ? Math.abs(amount) : null, createdAt: now,
  }; });
  let s = 42; // seeded PRNG so every workspace gets the same history
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let m = 1; m <= 5; m++) {
    const date = monthsAgo(m);
    transactions.push({ id: newId(), accountId: ids.checking, description: "Salary deposit", amount: 3200, category: "Income", date, status: "Completed", receiptBlob: null, receiptTotal: null, createdAt: now });
    const sample = { Groceries: "CARREFOUR HYPERMARKET", Bills: "SSGC GAS BILL", Transport: "PSO PETROL STATION", Dining: "STARBUCKS COFFEE", Shopping: "KHAADI DOLMEN MALL" };
    // steady monthly patterns with a gentle trend, so the forecast has something real to learn
    const base = { Groceries: 260, Bills: 150, Transport: 120, Dining: 110, Shopping: 180 }, slope = { Groceries: 12, Bills: 4, Transport: -6, Dining: 8, Shopping: 15 };
    for (const cat of ["Groceries", "Bills", "Transport", "Dining", "Shopping"])
      for (let k = 0; k < 3; k++)
        transactions.push({ id: newId(), accountId: ids.checking, description: sample[cat], amount: -round2(((base[cat] + slope[cat] * (5 - m)) / 3) * (0.85 + rnd() * 0.3)), category: cat, date: monthsAgo(m).slice(0, 8) + String(5 + k * 9).padStart(2, "0"), status: "Completed", receiptBlob: null, receiptTotal: null, createdAt: now });
  }
  const month = thisMonth();
  const budgets = [["Groceries", 450], ["Transport", 200], ["Bills", 450], ["Dining", 200], ["Entertainment", 150], ["Health", 120]]
    .map(([category, limit]) => ({ id: newId(), category, month, limit, alertThreshold: 0.9 }));
  return { accounts, transactions, budgets };
}
