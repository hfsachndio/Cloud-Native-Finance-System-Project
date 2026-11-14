// In-browser stand-in for the FinTrack API, used by the static demo build (VITE_DEMO=true).
// It mirrors the behaviour of the .NET services and Azure Functions: auto-categorisation,
// budget progress, budget alerts, receipt processing, transfers and reports.
// Data is seeded like SeedData.cs and kept in localStorage, so the demo survives a refresh.
import type { Account, BudgetAlert, BudgetProgress, CashFlow, CategoryShare, Status, Transaction } from "./api";

interface Budget { id: string; category: string; month: string; limit: number; alertThreshold: number }
interface Store { accounts: Account[]; transactions: (Transaction & { createdAt: string })[]; budgets: Budget[]; alerts: (BudgetAlert & { month: string })[] }

const KEY = "fintrack-demo-v1";
const id = () => Math.random().toString(16).slice(2, 10) + Date.now().toString(16);
const round2 = (n: number) => Math.round(n * 100) / 100;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const ym = (d: string | Date) => (typeof d === "string" ? d : ymd(d)).slice(0, 7);
const thisMonth = () => ym(new Date());
const latency = <T>(value: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(value)), 120));

// ---------- Domain logic (ports of FinTrack.Shared/Domain) ----------
const RULES: [string, string[]][] = [
  ["Income", ["salary", "payroll", "freelance", "invoice", "refund", "dividend"]],
  ["Groceries", ["supermarket", "grocery", "mart", "bakery", "fresh"]],
  ["Bills", ["electric", "water bill", "gas bill", "internet", "phone bill", "utility"]],
  ["Transport", ["uber", "careem", "ride", "fuel", "petrol", "metro", "bus", "taxi"]],
  ["Dining", ["restaurant", "cafe", "coffee", "pizza", "burger", "food delivery"]],
  ["Health", ["pharmacy", "clinic", "hospital", "doctor", "medicine"]],
  ["Entertainment", ["cinema", "netflix", "spotify", "concert", "game"]],
  ["Shopping", ["online order", "amazon", "daraz", "store", "mall"]],
];
export function categorise(description: string, amount: number) {
  const text = description.toLowerCase();
  for (const [category, keywords] of RULES) if (keywords.some((k) => text.includes(k))) return category;
  return amount > 0 ? "Income" : "Uncategorised";
}

function progress(b: Budget, txs: Transaction[]): BudgetProgress {
  const spent = round2(txs.filter((t) => t.amount < 0 && t.category.toLowerCase() === b.category.toLowerCase() && ym(t.date) === b.month)
    .reduce((s, t) => s - t.amount, 0));
  const percent = b.limit === 0 ? 0 : Math.round((spent / b.limit) * 1000) / 10;
  return { category: b.category, month: b.month, limit: b.limit, spent, remaining: Math.max(0, round2(b.limit - spent)), percent, overThreshold: spent >= b.limit * b.alertThreshold };
}

// ---------- Seed (port of SeedData.cs) ----------
function seed(): Store {
  const now = new Date().toISOString();
  const today = new Date();
  const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return ymd(d); };
  const monthsAgo = (n: number) => { const d = new Date(today); d.setMonth(d.getMonth() - n); return ymd(d); };
  const accounts: Account[] = [
    { id: "acc-checking", name: "Main checking", kind: "Checking", mask: "4471", balance: 8240.5, currency: "USD", updatedAt: now },
    { id: "acc-savings", name: "Savings", kind: "Savings", mask: "0921", balance: 3600, currency: "USD", updatedAt: now },
    { id: "acc-card", name: "Credit card", kind: "CreditCard", mask: "2210", balance: -412.3, currency: "USD", updatedAt: now },
    { id: "acc-cash", name: "Cash wallet", kind: "Cash", mask: "", balance: 1052.3, currency: "USD", updatedAt: now },
  ];
  const rows: [string, number, number, Status, string | null][] = [
    ["Salary deposit", 3200, 1, "Completed", null], ["Supermarket", -86.4, 1, "Processing", "receipt.pdf"],
    ["Electricity bill", -64.1, 2, "Completed", "bill.png"], ["Ride share", -12.75, 3, "Completed", null],
    ["Freelance payment", 450, 4, "Completed", "invoice.pdf"], ["Pharmacy", -23.9, 5, "Completed", "rx.jpg"],
    ["Cinema tickets", -28, 6, "Completed", null], ["Online order", -142.35, 7, "NeedsReview", "order.pdf"],
    ["Restaurant", -54.2, 8, "Completed", "bill.jpg"], ["Internet bill", -39.99, 9, "Completed", null],
  ];
  const transactions: Store["transactions"] = rows.map(([description, amount, ago, status, receipt]) => ({
    id: id(), accountId: "acc-checking", description, amount, category: categorise(description, amount), date: daysAgo(ago),
    status, receiptBlob: receipt, receiptTotal: status === "Completed" && receipt ? Math.abs(amount) : null, createdAt: now,
  }));
  let s = 42; // small seeded PRNG so the history looks the same on every visit
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let m = 1; m <= 5; m++) {
    const date = monthsAgo(m);
    transactions.push({ id: id(), accountId: "acc-checking", description: "Salary deposit", amount: 3200, category: "Income", date, status: "Completed", createdAt: now });
    for (const cat of ["Groceries", "Bills", "Transport", "Dining", "Shopping"])
      transactions.push({ id: id(), accountId: "acc-checking", description: `${cat} spending`, amount: -round2(rnd() * 300 + 80), category: cat, date, status: "Completed", createdAt: now });
  }
  const month = thisMonth();
  const budgets: Budget[] = [["Groceries", 450], ["Transport", 200], ["Bills", 450], ["Dining", 200], ["Entertainment", 150], ["Health", 120]]
    .map(([category, limit]) => ({ id: id(), category: category as string, month, limit: limit as number, alertThreshold: 0.9 }));
  const store: Store = { accounts, transactions, budgets, alerts: [] };
  budgets.forEach((b) => checkBudget(store, b.category, month));
  return store;
}

// ---------- Persistence ----------
let store: Store | null = null;
function db(): Store {
  if (store) return store;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Store) : null;
    // Re-seed when the saved data belongs to an earlier month, so dates always look current.
    store = parsed && parsed.budgets.some((b) => b.month === thisMonth()) ? parsed : seed();
  } catch { store = seed(); }
  save();
  return store;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode: keep in memory */ } }
export function resetDemo() { store = seed(); save(); }

// Port of the BudgetAlert function: raise one alert per category and month once spending crosses the threshold.
function checkBudget(s: Store, category: string, month: string) {
  const b = s.budgets.find((x) => x.month === month && x.category.toLowerCase() === category.toLowerCase());
  if (!b) return;
  const p = progress(b, s.transactions);
  if (!p.overThreshold || s.alerts.some((a) => a.category === b.category && a.month === month)) return;
  s.alerts.push({ id: id(), category: b.category, month, raisedAt: new Date().toISOString(),
    message: `${b.category} is at ${p.percent}% of its $${b.limit} budget ($${p.spent.toFixed(2)} spent).` });
}

const fail = (status: number, message: string) => Promise.reject(new Error(`${message} (${status})`));
const byNewest = (a: Store["transactions"][number], b: Store["transactions"][number]) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

// ---------- API with the same shape as api.ts ----------
export const demoApi = {
  accounts: () => latency(db().accounts),
  netWorth: () => latency({ total: round2(db().accounts.reduce((s, a) => s + a.balance, 0)), accounts: db().accounts.length }),
  transfer: (fromAccountId: string, toAccountId: string, amount: number) => {
    const s = db();
    if (amount <= 0) return fail(400, "Amount must be positive");
    const from = s.accounts.find((a) => a.id === fromAccountId), to = s.accounts.find((a) => a.id === toAccountId);
    if (!from || !to) return fail(404, "Account not found");
    if (from.kind !== "CreditCard" && from.balance < amount) return fail(400, "Insufficient funds");
    const now = new Date().toISOString();
    from.balance = round2(from.balance - amount); from.updatedAt = now;
    to.balance = round2(to.balance + amount); to.updatedAt = now;
    save();
    return latency({ from, to });
  },
  transactions: (q: { month?: string; category?: string; status?: string } = {}) =>
    latency(db().transactions.filter((t) => (!q.month || ym(t.date) === q.month) &&
      (!q.category || t.category.toLowerCase() === q.category.toLowerCase()) && (!q.status || t.status === q.status)).sort(byNewest)),
  addTransaction: (req: { accountId: string; description: string; amount: number; category?: string }) => {
    const s = db();
    if (!req.description?.trim() || !req.amount) return fail(400, "Description and a non-zero amount are required");
    const t = { id: id(), accountId: req.accountId, description: req.description.trim(), amount: req.amount,
      category: req.category?.trim() || categorise(req.description, req.amount), date: ymd(new Date()),
      status: "Completed" as Status, receiptBlob: null, receiptTotal: null, createdAt: new Date().toISOString() };
    s.transactions.push(t);
    const account = s.accounts.find((a) => a.id === req.accountId);
    if (account) { account.balance = round2(account.balance + req.amount); account.updatedAt = t.createdAt; }
    checkBudget(s, t.category, ym(t.date));
    save();
    return latency(t);
  },
  // Port of ProcessReceipt: the upload sets "Processing", then the function fills in the total.
  uploadReceipt: (txId: string, file: File) => {
    const s = db();
    const t = s.transactions.find((x) => x.id === txId);
    if (!t) return fail(404, "Transaction not found");
    if (file.size === 0 || file.size > 10 * 1024 * 1024) return fail(400, "Receipt must be between 1 byte and 10 MB");
    t.receiptBlob = `demo-user/${file.name}`; t.status = "Processing"; save();
    setTimeout(() => { t.status = "Completed"; t.receiptTotal = Math.abs(t.amount); save(); }, 2500);
    return latency(t);
  },
  budgets: (month?: string) => {
    const s = db(), m = month ?? thisMonth();
    return latency(s.budgets.filter((b) => b.month === m).map((b) => progress(b, s.transactions)).sort((a, b) => b.percent - a.percent));
  },
  addBudget: (category: string, limit: number) => {
    const s = db();
    if (!category?.trim() || limit <= 0) return fail(400, "Category and a positive limit are required");
    const b = { id: id(), category: category.trim(), limit, month: thisMonth(), alertThreshold: 0.9 };
    s.budgets.push(b); checkBudget(s, b.category, b.month); save();
    return latency(b);
  },
  alerts: () => latency(db().alerts.map(({ month: _m, ...a }) => a).sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))),
  cashFlow: (months = 6): Promise<CashFlow[]> => {
    const n = Math.min(Math.max(months, 1), 24), txs = db().transactions;
    const start = new Date(); start.setDate(1); start.setMonth(start.getMonth() - (n - 1));
    return latency(Array.from({ length: n }, (_, i) => {
      const d = new Date(start); d.setMonth(start.getMonth() + i);
      const m = ym(d), inMonth = txs.filter((t) => ym(t.date) === m);
      return { month: m, income: round2(inMonth.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)),
        spending: round2(inMonth.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0)) };
    }));
  },
  categories: (year?: number): Promise<CategoryShare[]> => {
    const y = String(year ?? new Date().getFullYear());
    const spend = db().transactions.filter((t) => t.date.startsWith(y) && t.amount < 0);
    const total = spend.reduce((s, t) => s - t.amount, 0);
    const groups = new Map<string, number>();
    spend.forEach((t) => groups.set(t.category, (groups.get(t.category) ?? 0) - t.amount));
    return latency([...groups].map(([category, spent]) => ({ category, spent: round2(spent), share: total === 0 ? 0 : Math.round((spent / total) * 1000) / 10 }))
      .sort((a, b) => b.spent - a.spent));
  },
};
