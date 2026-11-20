import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money } from "../api";
import { useApi } from "../useApi";
import { Card, Empty, Loading, Page, StatusPill } from "../components/ui";

const filters = [["", "All"], ["Completed", "Completed"], ["Processing", "Processing"], ["NeedsReview", "Needs review"]];

export default function Transactions() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ description: "", amount: "" });
  const { data, error, reload } = useApi(() => api.transactions({ status }), [status]);
  const accounts = useApi(() => api.accounts());
  const [accountId, setAccountId] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => { if (accounts.data?.length) setAccountId((a) => a || accounts.data![0].id); }, [accounts.data]);

  const add = async () => {
    const amount = Number(form.amount);
    if (!form.description || !amount) return setMsg("Enter a description and a non-zero amount.");
    try {
      const t = await api.addTransaction({ accountId, description: form.description, amount });
      setForm({ description: "", amount: "" });
      setMsg(`Added · categorised as ${t.category}.`);
      reload();
    } catch (e) { setMsg((e as Error).message); }
  };
  const noAccounts = accounts.data && accounts.data.length === 0;

  const rows = (data ?? []).filter((t) => `${t.description} ${t.category}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <Page title="Transactions" subtitle="Auto-categorised as they arrive">
      {noAccounts ? (
        <Empty title="Add an account first" action={<Link className="btn" to="/accounts">Add an account</Link>}>Transactions are recorded against one of your accounts.</Empty>
      ) : (
        <Card title="Add transaction" hint="The API picks the category from the description">
          <div className="row">
            <select aria-label="Account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <input placeholder="Description, e.g. Supermarket" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input placeholder="Amount (negative for spending)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <button onClick={add}>Add</button><span className="muted">{msg}</span>
          </div>
        </Card>
      )}
      <div className="row">
        <div className="tabs">{filters.map(([v, l]) => <button key={v} className={status === v ? "on" : ""} onClick={() => setStatus(v)}>{l}</button>)}</div>
        <input className="grow" placeholder="Search description or category" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {!data ? <Loading error={error} /> : data.length === 0 && !status ? (
        <Empty title="No transactions yet">Add your first one above. Income is positive, spending is negative.</Empty>
      ) : (
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
