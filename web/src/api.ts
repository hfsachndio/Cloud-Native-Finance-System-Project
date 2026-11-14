export type Status = "Pending" | "Processing" | "Completed" | "NeedsReview";
export interface Account { id: string; name: string; kind: string; mask: string; balance: number; currency: string; updatedAt: string }
export interface Transaction {
  id: string; accountId: string; description: string; category: string; amount: number;
  date: string; status: Status; receiptBlob?: string | null; receiptTotal?: number | null;
}
export interface BudgetProgress { category: string; month: string; limit: number; spent: number; remaining: number; percent: number; overThreshold: boolean }
export interface CashFlow { month: string; income: number; spending: number }
export interface CategoryShare { category: string; spent: number; share: number }
export interface BudgetAlert { id: string; category: string; message: string; raisedAt: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed with ${res.status}`);
  return res.status === 204 ? (undefined as T) : res.json();
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  accounts: () => request<Account[]>("/api/accounts"),
  netWorth: () => request<{ total: number; accounts: number }>("/api/accounts/net-worth"),
  transfer: (fromAccountId: string, toAccountId: string, amount: number) => request("/api/accounts/transfer", json("POST", { fromAccountId, toAccountId, amount })),
  transactions: (q: { month?: string; category?: string; status?: string } = {}) =>
    request<Transaction[]>(`/api/transactions?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`),
  addTransaction: (t: { accountId: string; description: string; amount: number; category?: string }) => request<Transaction>("/api/transactions", json("POST", t)),
  uploadReceipt: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Transaction>(`/api/transactions/${id}/receipt`, { method: "POST", body: form });
  },
  budgets: (month?: string) => request<BudgetProgress[]>(`/api/budgets${month ? `?month=${month}` : ""}`),
  addBudget: (category: string, limit: number) => request("/api/budgets", json("POST", { category, limit })),
  alerts: () => request<BudgetAlert[]>("/api/budgets/alerts"),
  cashFlow: (months = 6) => request<CashFlow[]>(`/api/reports/cash-flow?months=${months}`),
  categories: (year?: number) => request<CategoryShare[]>(`/api/reports/categories${year ? `?year=${year}` : ""}`),
};

export const money = (n: number, sign = false) =>
  `${sign && n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleString("en-US", { month: "short" });
