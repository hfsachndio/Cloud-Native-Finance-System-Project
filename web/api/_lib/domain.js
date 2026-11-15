// Domain rules ported from FinTrack.Shared/Domain (same behaviour as the .NET services).
export const round2 = (n) => Math.round(n * 100) / 100;
export const ymd = (d) => d.toISOString().slice(0, 10);
export const ym = (d) => (typeof d === "string" ? d : ymd(d)).slice(0, 7);
export const thisMonth = () => ym(new Date());
export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

const RULES = [
  ["Income", ["salary", "payroll", "freelance", "invoice", "refund", "dividend"]],
  ["Groceries", ["supermarket", "grocery", "mart", "bakery", "fresh"]],
  ["Bills", ["electric", "water bill", "gas bill", "internet", "phone bill", "utility"]],
  ["Transport", ["uber", "careem", "ride", "fuel", "petrol", "metro", "bus", "taxi"]],
  ["Dining", ["restaurant", "cafe", "coffee", "pizza", "burger", "food delivery"]],
  ["Health", ["pharmacy", "clinic", "hospital", "doctor", "medicine"]],
  ["Entertainment", ["cinema", "netflix", "spotify", "concert", "game"]],
  ["Shopping", ["online order", "amazon", "daraz", "store", "mall"]],
];
export function categorise(description, amount) {
  const text = description.toLowerCase();
  for (const [category, keywords] of RULES) if (keywords.some((k) => text.includes(k))) return category;
  return amount > 0 ? "Income" : "Uncategorised";
}

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
    ["Salary deposit", 3200, 1, "Completed", null], ["Supermarket", -86.4, 1, "Processing", "receipt.pdf"],
    ["Electricity bill", -64.1, 2, "Completed", "bill.png"], ["Ride share", -12.75, 3, "Completed", null],
    ["Freelance payment", 450, 4, "Completed", "invoice.pdf"], ["Pharmacy", -23.9, 5, "Completed", "rx.jpg"],
    ["Cinema tickets", -28, 6, "Completed", null], ["Online order", -142.35, 7, "NeedsReview", "order.pdf"],
    ["Restaurant", -54.2, 8, "Completed", "bill.jpg"], ["Internet bill", -39.99, 9, "Completed", null],
  ];
  const transactions = rows.map(([description, amount, ago, status, receipt]) => ({
    id: newId(), accountId: ids.checking, description, amount, category: categorise(description, amount), date: daysAgo(ago),
    status, receiptBlob: receipt ? `samples/${receipt}` : null, receiptTotal: status === "Completed" && receipt ? Math.abs(amount) : null, createdAt: now,
  }));
  let s = 42; // seeded PRNG so every workspace gets the same history
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let m = 1; m <= 5; m++) {
    const date = monthsAgo(m);
    transactions.push({ id: newId(), accountId: ids.checking, description: "Salary deposit", amount: 3200, category: "Income", date, status: "Completed", receiptBlob: null, receiptTotal: null, createdAt: now });
    for (const cat of ["Groceries", "Bills", "Transport", "Dining", "Shopping"])
      transactions.push({ id: newId(), accountId: ids.checking, description: `${cat} spending`, amount: -round2(rnd() * 300 + 80), category: cat, date, status: "Completed", receiptBlob: null, receiptTotal: null, createdAt: now });
  }
  const month = thisMonth();
  const budgets = [["Groceries", 450], ["Transport", 200], ["Bills", 450], ["Dining", 200], ["Entertainment", 150], ["Health", 120]]
    .map(([category, limit]) => ({ id: newId(), category, month, limit, alertThreshold: 0.9 }));
  return { accounts, transactions, budgets };
}
