import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { categorise, newId, progress, round2, seedData, thisMonth, ym, ymd } from "./domain.js";

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

// ---------- Turso (libSQL) ----------
let client, ready;
export function db() {
  client ??= createClient({ url: process.env.TURSO_DATABASE_URL || "file:fintrack-local.db", authToken: process.env.TURSO_AUTH_TOKEN });
  ready ??= migrate(client).catch((e) => { ready = undefined; throw e; });
  return ready.then(() => client);
}
async function migrate(c) {
  await c.batch([
    `create table if not exists users (id text primary key, email text not null unique, name text not null, password_hash text not null, is_guest integer not null default 0, created_at text not null)`,
    `create table if not exists accounts (id text primary key, user_id text not null references users(id) on delete cascade, name text not null, kind text not null, mask text not null default '', balance real not null default 0, currency text not null default 'USD', updated_at text not null)`,
    `create table if not exists transactions (id text primary key, user_id text not null references users(id) on delete cascade, account_id text not null, description text not null, category text not null, amount real not null, date text not null, status text not null, receipt_blob text, receipt_total real, processing_at text, created_at text not null)`,
    `create index if not exists tx_user_date on transactions(user_id, date desc)`,
    `create table if not exists receipts (tx_id text primary key, user_id text not null references users(id) on delete cascade, name text not null, type text not null, size integer not null, data blob not null, uploaded_at text not null)`,
    `create table if not exists budgets (id text primary key, user_id text not null references users(id) on delete cascade, category text not null, month text not null, limit_amount real not null, alert_threshold real not null default 0.9, unique (user_id, category, month))`,
    `create table if not exists alerts (id text primary key, user_id text not null references users(id) on delete cascade, category text not null, month text not null, message text not null, raised_at text not null, unique (user_id, category, month))`,
  ], "write");
  await c.execute("pragma foreign_keys = on").catch(() => {});
}

// ---------- auth ----------
const SECRET = () => process.env.JWT_SECRET || "fintrack-local-dev-secret";
const tokenFor = (u) => jwt.sign({ sub: u.id, name: u.name, email: u.email, guest: !!u.is_guest }, SECRET(), { expiresIn: "7d" });
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, guest: !!u.is_guest });

export function verify(token) {
  try { return jwt.verify(token, SECRET()).sub; } catch { return null; }
}

async function createUser(c, { email, name, password, guest = false, seed = guest }) {
  const u = { id: newId(), email, name, password_hash: await bcrypt.hash(password, 10), is_guest: guest ? 1 : 0, created_at: new Date().toISOString() };
  try {
    await c.execute({ sql: "insert into users (id, email, name, password_hash, is_guest, created_at) values (?,?,?,?,?,?)", args: [u.id, u.email, u.name, u.password_hash, u.is_guest, u.created_at] });
  } catch (e) {
    if (/UNIQUE/i.test(String(e.message))) throw new HttpError(409, "An account with this email already exists.");
    throw e;
  }
  // Demo workspaces come with sample data; real accounts start empty.
  if (seed) await seedWorkspace(c, u.id);
  return u;
}

export async function register(body) {
  const email = String(body.email || "").trim().toLowerCase(), name = String(body.name || "").trim(), password = String(body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  if (name.length < 2) throw new HttpError(400, "Enter your name.");
  if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters.");
  const c = await db();
  const u = await createUser(c, { email, name, password });
  return { token: tokenFor(u), user: publicUser(u) };
}

export async function login(body) {
  const c = await db();
  const r = await c.execute({ sql: "select * from users where email = ?", args: [String(body.email || "").trim().toLowerCase()] });
  const u = r.rows[0];
  if (!u || !(await bcrypt.compare(String(body.password || ""), u.password_hash))) throw new HttpError(401, "Incorrect email or password.");
  return { token: tokenFor(u), user: publicUser(u) };
}

/** A private, freshly seeded guest workspace for portfolio visitors. Old guests are cleaned up. */
export async function demo() {
  const c = await db();
  await c.execute({ sql: "delete from users where is_guest = 1 and created_at < ?", args: [new Date(Date.now() - 3 * 864e5).toISOString()] });
  const u = await createUser(c, { email: `guest-${newId()}@demo.fintrack`, name: "Demo user", password: newId() + newId(), guest: true });
  return { token: tokenFor(u), user: publicUser(u) };
}

export async function me(uid) {
  const c = await db();
  const u = (await c.execute({ sql: "select * from users where id = ?", args: [uid] })).rows[0];
  if (!u) throw new HttpError(401, "Account not found. Please sign in again.");
  return publicUser(u);
}

// ---------- workspace data ----------
async function seedWorkspace(c, uid) {
  const s = seedData(), now = new Date().toISOString();
  const stmts = [
    ...s.accounts.map((a) => ({ sql: "insert into accounts (id, user_id, name, kind, mask, balance, currency, updated_at) values (?,?,?,?,?,?,'USD',?)", args: [a.id, uid, a.name, a.kind, a.mask, a.balance, now] })),
    ...s.transactions.map((t) => ({ sql: "insert into transactions (id, user_id, account_id, description, category, amount, date, status, receipt_blob, receipt_total, processing_at, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)", args: [t.id, uid, t.accountId, t.description, t.category, t.amount, t.date, t.status, t.receiptBlob, t.receiptTotal, t.status === "Processing" ? now : null, t.createdAt] })),
    ...s.budgets.map((b) => ({ sql: "insert into budgets (id, user_id, category, month, limit_amount, alert_threshold) values (?,?,?,?,?,?)", args: [b.id, uid, b.category, b.month, b.limit, b.alertThreshold] })),
  ];
  await c.batch(stmts, "write");
  for (const b of s.budgets) await checkBudget(c, uid, b.category, b.month);
}

/** Clears the workspace; demo (guest) workspaces get the sample data back, real accounts start empty again. */
export async function resetWorkspace(uid) {
  const c = await db();
  const u = (await c.execute({ sql: "select is_guest from users where id = ?", args: [uid] })).rows[0];
  await c.batch(["accounts", "transactions", "receipts", "budgets", "alerts"].map((t) => ({ sql: `delete from ${t} where user_id = ?`, args: [uid] })), "write");
  if (u?.is_guest) await seedWorkspace(c, uid);
  return { ok: true };
}

const KINDS = ["Checking", "Savings", "CreditCard", "Cash"];
export async function addAccount(uid, body) {
  const name = String(body.name || "").trim().slice(0, 40);
  const kind = KINDS.includes(body.kind) ? body.kind : "Checking";
  const balance = round2(Number(body.balance) || 0);
  const mask = String(body.mask || "").replace(/\D/g, "").slice(-4);
  if (!name) throw new HttpError(400, "Give the account a name");
  const c = await db();
  const a = { id: newId(), name, kind, mask, balance, currency: "USD", updated_at: new Date().toISOString() };
  await c.execute({ sql: "insert into accounts (id, user_id, name, kind, mask, balance, currency, updated_at) values (?,?,?,?,?,?,?,?)", args: [a.id, uid, a.name, a.kind, a.mask, a.balance, a.currency, a.updated_at] });
  return toAccount(a);
}

const toAccount = (r) => ({ id: r.id, name: r.name, kind: r.kind, mask: r.mask, balance: Number(r.balance), currency: r.currency, updatedAt: r.updated_at });
const toTx = (r) => ({ id: r.id, accountId: r.account_id, description: r.description, category: r.category, amount: Number(r.amount), date: r.date, status: r.status, receiptBlob: r.receipt_blob, receiptTotal: r.receipt_total == null ? null : Number(r.receipt_total), hasFile: !!r.has_file });
const toBudget = (r) => ({ id: r.id, category: r.category, month: r.month, limit: Number(r.limit_amount), alertThreshold: Number(r.alert_threshold) });

/** Port of the ProcessReceipt Azure Function: receipts in "Processing" for 2.5 s are read and matched. */
async function processReceipts(c, uid) {
  const cutoff = new Date(Date.now() - 2500).toISOString();
  await c.execute({ sql: "update transactions set status = 'Completed', receipt_total = abs(amount), processing_at = null where user_id = ? and status = 'Processing' and processing_at is not null and processing_at < ?", args: [uid, cutoff] });
}

/** Port of the BudgetAlert function: one alert per category and month once spending crosses the threshold. */
async function checkBudget(c, uid, category, month) {
  const b = (await c.execute({ sql: "select * from budgets where user_id = ? and month = ? and lower(category) = lower(?)", args: [uid, month, category] })).rows[0];
  if (!b) return;
  const txs = (await c.execute({ sql: "select category, amount, date from transactions where user_id = ? and date like ?", args: [uid, `${month}%`] })).rows.map((r) => ({ category: r.category, amount: Number(r.amount), date: r.date }));
  const p = progress(toBudget(b), txs);
  if (!p.overThreshold) return;
  await c.execute({ sql: "insert or ignore into alerts (id, user_id, category, month, message, raised_at) values (?,?,?,?,?,?)", args: [newId(), uid, b.category, month, `${b.category} is at ${p.percent}% of its $${p.limit} budget ($${p.spent.toFixed(2)} spent).`, new Date().toISOString()] });
}

export async function accounts(uid) {
  const c = await db();
  return (await c.execute({ sql: "select * from accounts where user_id = ? order by rowid", args: [uid] })).rows.map(toAccount);
}
export async function netWorth(uid) {
  const list = await accounts(uid);
  return { total: round2(list.reduce((s, a) => s + a.balance, 0)), accounts: list.length };
}
export async function transfer(uid, body) {
  const amount = Number(body.amount);
  if (!(amount > 0)) throw new HttpError(400, "Amount must be positive");
  if (body.fromAccountId === body.toAccountId) throw new HttpError(400, "Choose two different accounts");
  const c = await db();
  const tx = await c.transaction("write");
  try {
    const get = async (id) => (await tx.execute({ sql: "select * from accounts where id = ? and user_id = ?", args: [id, uid] })).rows[0];
    const from = await get(body.fromAccountId), to = await get(body.toAccountId);
    if (!from || !to) throw new HttpError(404, "Account not found");
    if (from.kind !== "CreditCard" && Number(from.balance) < amount) throw new HttpError(400, "Insufficient funds");
    const now = new Date().toISOString();
    await tx.execute({ sql: "update accounts set balance = ?, updated_at = ? where id = ?", args: [round2(Number(from.balance) - amount), now, from.id] });
    await tx.execute({ sql: "update accounts set balance = ?, updated_at = ? where id = ?", args: [round2(Number(to.balance) + amount), now, to.id] });
    await tx.commit();
    return { from: toAccount({ ...from, balance: round2(Number(from.balance) - amount), updated_at: now }), to: toAccount({ ...to, balance: round2(Number(to.balance) + amount), updated_at: now }) };
  } catch (e) { await tx.rollback().catch(() => {}); throw e; }
}

export async function transactions(uid, q) {
  const c = await db();
  await processReceipts(c, uid);
  const where = ["t.user_id = ?"], args = [uid];
  if (q.month) { where.push("t.date like ?"); args.push(`${q.month}%`); }
  if (q.category) { where.push("lower(t.category) = lower(?)"); args.push(q.category); }
  if (q.status) { where.push("t.status = ?"); args.push(q.status); }
  const r = await c.execute({ sql: `select t.*, (select 1 from receipts r where r.tx_id = t.id) as has_file from transactions t where ${where.join(" and ")} order by t.date desc, t.created_at desc`, args });
  return r.rows.map(toTx);
}

export async function addTransaction(uid, body) {
  const description = String(body.description || "").trim(), amount = Number(body.amount);
  if (!description || !amount) throw new HttpError(400, "Description and a non-zero amount are required");
  const c = await db();
  const account = (await c.execute({ sql: "select * from accounts where id = ? and user_id = ?", args: [body.accountId, uid] })).rows[0];
  if (!account) throw new HttpError(404, "Account not found");
  const now = new Date().toISOString();
  const t = { id: newId(), accountId: account.id, description: description.slice(0, 120), amount: round2(amount), category: String(body.category || "").trim() || categorise(description, amount), date: ymd(new Date()), status: "Completed", receiptBlob: null, receiptTotal: null };
  await c.batch([
    { sql: "insert into transactions (id, user_id, account_id, description, category, amount, date, status, created_at) values (?,?,?,?,?,?,?,?,?)", args: [t.id, uid, t.accountId, t.description, t.category, t.amount, t.date, t.status, now] },
    { sql: "update accounts set balance = round(balance + ?, 2), updated_at = ? where id = ?", args: [t.amount, now, account.id] },
  ], "write");
  await checkBudget(c, uid, t.category, ym(t.date));
  return t;
}

export async function uploadReceipt(uid, txId, body) {
  const c = await db();
  const t = (await c.execute({ sql: "select * from transactions where id = ? and user_id = ?", args: [txId, uid] })).rows[0];
  if (!t) throw new HttpError(404, "Transaction not found");
  const buf = Buffer.from(String(body.data || ""), "base64");
  if (buf.length === 0 || buf.length > 2 * 1024 * 1024) throw new HttpError(400, "Receipt must be between 1 byte and 2 MB");
  const name = String(body.name || "receipt").replace(/[^\w.\- ]/g, "_").slice(0, 80);
  const type = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)$/.test(body.type) ? body.type : "application/octet-stream";
  const now = new Date().toISOString();
  await c.batch([
    { sql: "insert into receipts (tx_id, user_id, name, type, size, data, uploaded_at) values (?,?,?,?,?,?,?) on conflict(tx_id) do update set name = excluded.name, type = excluded.type, size = excluded.size, data = excluded.data, uploaded_at = excluded.uploaded_at", args: [txId, uid, name, type, buf.length, buf, now] },
    { sql: "update transactions set receipt_blob = ?, status = 'Processing', receipt_total = null, processing_at = ? where id = ?", args: [`${uid}/${name}`, now, txId] },
  ], "write");
  return { ...toTx({ ...t, receipt_blob: `${uid}/${name}`, status: "Processing", receipt_total: null }), hasFile: true };
}

export async function receiptFile(uid, txId) {
  const c = await db();
  const r = (await c.execute({ sql: "select name, type, data from receipts where tx_id = ? and user_id = ?", args: [txId, uid] })).rows[0];
  if (!r) throw new HttpError(404, "Receipt not found");
  return { name: r.name, type: r.type, data: Buffer.from(r.data) };
}

export async function budgets(uid, month) {
  const c = await db(), m = month || thisMonth();
  const list = (await c.execute({ sql: "select * from budgets where user_id = ? and month = ?", args: [uid, m] })).rows.map(toBudget);
  const txs = (await c.execute({ sql: "select category, amount, date from transactions where user_id = ? and date like ?", args: [uid, `${m}%`] })).rows.map((r) => ({ category: r.category, amount: Number(r.amount), date: r.date }));
  return list.map((b) => progress(b, txs)).sort((a, b) => b.percent - a.percent);
}
export async function addBudget(uid, body) {
  const category = String(body.category || "").trim(), limit = Number(body.limit);
  if (!category || !(limit > 0)) throw new HttpError(400, "Category and a positive limit are required");
  const c = await db(), b = { id: newId(), category, limit, month: thisMonth(), alertThreshold: 0.9 };
  await c.execute({ sql: "insert into budgets (id, user_id, category, month, limit_amount, alert_threshold) values (?,?,?,?,?,?) on conflict(user_id, category, month) do update set limit_amount = excluded.limit_amount", args: [b.id, uid, b.category, b.month, b.limit, b.alertThreshold] });
  await checkBudget(c, uid, b.category, b.month);
  return b;
}
export async function alerts(uid) {
  const c = await db();
  return (await c.execute({ sql: "select id, category, message, raised_at from alerts where user_id = ? order by raised_at desc", args: [uid] })).rows.map((r) => ({ id: r.id, category: r.category, message: r.message, raisedAt: r.raised_at }));
}

export async function cashFlow(uid, months) {
  const n = Math.min(Math.max(Number(months) || 6, 1), 24);
  const c = await db();
  const start = new Date(); start.setDate(1); start.setMonth(start.getMonth() - (n - 1));
  const r = await c.execute({ sql: "select substr(date,1,7) as m, sum(case when amount > 0 then amount else 0 end) as income, sum(case when amount < 0 then -amount else 0 end) as spending from transactions where user_id = ? and date >= ? group by m", args: [uid, ymd(start).slice(0, 7) + "-01"] });
  const by = new Map(r.rows.map((x) => [x.m, x]));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start); d.setMonth(start.getMonth() + i);
    const m = ym(d), row = by.get(m);
    return { month: m, income: round2(Number(row?.income || 0)), spending: round2(Number(row?.spending || 0)) };
  });
}
export async function categories(uid, year) {
  const y = String(Number(year) || new Date().getFullYear());
  const c = await db();
  const r = await c.execute({ sql: "select category, sum(-amount) as spent from transactions where user_id = ? and amount < 0 and date like ? group by category order by spent desc", args: [uid, `${y}%`] });
  const total = r.rows.reduce((s, x) => s + Number(x.spent), 0);
  return r.rows.map((x) => ({ category: x.category, spent: round2(Number(x.spent)), share: total === 0 ? 0 : Math.round((Number(x.spent) / total) * 1000) / 10 }));
}

export async function health() {
  const c = await db();
  const r = await c.execute("select (select count(*) from users) as users, (select count(*) from transactions) as transactions");
  return { ok: true, database: process.env.TURSO_DATABASE_URL ? "turso (libsql)" : "sqlite file (local)", users: Number(r.rows[0].users), transactions: Number(r.rows[0].transactions) };
}
