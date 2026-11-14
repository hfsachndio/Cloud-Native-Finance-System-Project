import { useState } from "react";
import { Link } from "react-router-dom";
import { api, money } from "../api";
import { useApi } from "../useApi";
import { Card, Loading, Page, StatusPill } from "../components/ui";

const filters = [["", "All"], ["Completed", "Completed"], ["Processing", "Processing"], ["NeedsReview", "Needs review"]];

export default function Transactions() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ description: "", amount: "" });
  const { data, error, reload } = useApi(() => api.transactions({ status }), [status]);

  const add = async () => {
    const amount = Number(form.amount);
    if (!form.description || !amount) return;
    await api.addTransaction({ accountId: "acc-checking", description: form.description, amount });
    setForm({ description: "", amount: "" });
    reload();
  };

  const rows = (data ?? []).filter((t) => `${t.description} ${t.category}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <Page title="Transactions" subtitle="Auto-categorised as they arrive">
      <Card title="Add transaction" hint="Leave the category empty and the API picks one">
        <div className="row">
          <input placeholder="Description, e.g. Supermarket" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input placeholder="Amount (negative for spending)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <button onClick={add}>Add</button>
        </div>
      </Card>
      <div className="row">
        <div className="tabs">{filters.map(([v, l]) => <button key={v} className={status === v ? "on" : ""} onClick={() => setStatus(v)}>{l}</button>)}</div>
        <input className="grow" placeholder="Search description or category" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {!data ? <Loading error={error} /> : (
        <Card>
          <table>
            <thead><tr><th>Description</th><th>Category</th><th>Date</th><th>Receipt</th><th>Status</th><th className="right">Amount</th></tr></thead>
            <tbody>{rows.map((t) => (
              <tr key={t.id}><td><b>{t.description}</b></td><td>{t.category}</td><td className="muted">{t.date}</td><td>{t.receiptBlob ? <Link className="link" to="/receipts">{t.receiptBlob.split("/").pop()}</Link> : <span className="muted">—</span>}</td><td><StatusPill status={t.status} /></td><td className={`right ${t.amount > 0 ? "good" : ""}`}><b>{money(t.amount, true)}</b></td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </Page>
  );
}
