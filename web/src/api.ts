import { demoApi } from "./demo";

export type Status = "Pending" | "Processing" | "Completed" | "NeedsReview";
export interface Account { id: string; name: string; kind: string; mask: string; balance: number; currency: string; updatedAt: string }
export interface Transaction {
  id: string; accountId: string; description: string; category: string; amount: number;
  date: string; status: Status; receiptBlob?: string | null; receiptTotal?: number | null; hasFile?: boolean;
}
export interface BudgetProgress { category: string; month: string; limit: number; spent: number; remaining: number; percent: number; overThreshold: boolean }
export interface CashFlow { month: string; income: number; spending: number }
export interface CategoryShare { category: string; spent: number; share: number }
export interface BudgetAlert { id: string; category: string; message: string; raisedAt: string }

export interface User { id: string; name: string; email: string; guest: boolean }

// ---------- session (JWT from the FinTrack API) ----------
const TOKEN_KEY = "fintrack-token", USER_KEY = "fintrack-user";
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
export const session = {
  token: () => read(TOKEN_KEY),
  user: (): User | null => { const u = read(USER_KEY); return u ? (JSON.parse(u) as User) : null; },
  set(token: string, user: User) { try { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* ignore */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch { /* ignore */ } },
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = session.token();
  const res = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (res.status === 401 && !path.startsWith("/api/auth/")) { session.clear(); location.assign("/login"); }
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `${init.method ?? "GET"} ${path} failed with ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
  r.onerror = () => reject(new Error("Could not read the file"));
  r.readAsDataURL(file);
});
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const httpApi = {
  accounts: () => request<Account[]>("/api/accounts"),
  netWorth: () => request<{ total: number; accounts: number }>("/api/accounts/net-worth"),
  transfer: (fromAccountId: string, toAccountId: string, amount: number) => request("/api/accounts/transfer", json("POST", { fromAccountId, toAccountId, amount })),
  transactions: (q: { month?: string; category?: string; status?: string } = {}) =>
    request<Transaction[]>(`/api/transactions?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`),
  addTransaction: (t: { accountId: string; description: string; amount: number; category?: string }) => request<Transaction>("/api/transactions", json("POST", t)),
  uploadReceipt: async (id: string, file: File) =>
    request<Transaction>(`/api/transactions/${id}/receipt`, json("POST", { name: file.name, type: file.type, data: await toBase64(file) })),
  /** Opens the stored receipt file (fetched with the auth header, never a token in the URL). */
  openReceipt: async (id: string) => {
    const res = await fetch(`/api/transactions/${id}/receipt`, { headers: { Authorization: `Bearer ${session.token() ?? ""}` } });
    if (!res.ok) throw new Error("Receipt file not found");
    window.open(URL.createObjectURL(await res.blob()), "_blank", "noopener");
  },
  budgets: (month?: string) => request<BudgetProgress[]>(`/api/budgets${month ? `?month=${month}` : ""}`),
  addBudget: (category: string, limit: number) => request("/api/budgets", json("POST", { category, limit })),
  alerts: () => request<BudgetAlert[]>("/api/budgets/alerts"),
  cashFlow: (months = 6) => request<CashFlow[]>(`/api/reports/cash-flow?months=${months}`),
  categories: (year?: number) => request<CategoryShare[]>(`/api/reports/categories${year ? `?year=${year}` : ""}`),
  resetWorkspace: () => request("/api/workspace/reset", json("POST", {})),
};

type AuthResult = { token: string; user: User };
const remember = (r: AuthResult) => { session.set(r.token, r.user); return r.user; };
export const auth = {
  login: (email: string, password: string) => request<AuthResult>("/api/auth/login", json("POST", { email, password })).then(remember),
  register: (name: string, email: string, password: string) => request<AuthResult>("/api/auth/register", json("POST", { name, email, password })).then(remember),
  demo: () => request<AuthResult>("/api/auth/demo", json("POST", {})).then(remember),
  logout: () => { session.clear(); location.assign("/login"); },
};

// `--mode demo` builds a backend-free version that uses the in-browser implementation in demo.ts.
// The Vercel deployment talks to the real API (api/index.js on Turso); local dev talks to the .NET gateway.
export const DEMO = import.meta.env.VITE_DEMO === "true";
export const api: typeof httpApi = DEMO ? ({ ...demoApi, openReceipt: async () => {}, resetWorkspace: async () => demoApi } as unknown as typeof httpApi) : httpApi;

export const money = (n: number, sign = false) =>
  `${sign && n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleString("en-US", { month: "short" });
