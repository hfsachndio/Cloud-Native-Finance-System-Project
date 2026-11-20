import { useEffect, useState } from "react";
import { api, money } from "../api";
import { useApi } from "../useApi";
import { Card, Empty, Loading, Page } from "../components/ui";

const KINDS = [["Checking", "Checking"], ["Savings", "Savings"], ["CreditCard", "Credit card"], ["Cash", "Cash"]];

export default function Accounts() {
  const { data, error, reload } = useApi(() => api.accounts());
  const [amount, setAmount] = useState("100");
  const [msg, setMsg] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [form, setForm] = useState({ name: "", kind: "Checking", balance: "", mask: "" });
  const [formMsg, setFormMsg] = useState("");
  useEffect(() => {
    if (data && data.length) { setFrom((f) => f || data[0].id); setTo((t) => t || (data[1] ?? data[0]).id); }
  }, [data]);
  if (!data) return <Loading error={error} />;
  const total = data.reduce((s, a) => s + a.balance, 0);

  const transfer = async () => {
    try {
      if (from === to) throw new Error("Choose two different accounts.");
      await api.transfer(from, to, Number(amount));
      setMsg(`Moved ${money(Number(amount))} to ${data.find((a) => a.id === to)?.name}.`);
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const add = async () => {
    try {
      const a = await api.addAccount({ name: form.name, kind: form.kind, balance: Number(form.balance) || 0, mask: form.mask });
      setForm({ name: "", kind: "Checking", balance: "", mask: "" });
      setFormMsg(`Added ${a.name}.`);
      reload();
    } catch (e) { setFormMsg((e as Error).message); }
  };

  return (
    <Page title="Accounts" subtitle={`${data.length} linked account${data.length === 1 ? "" : "s"} · net worth ${money(total)}`} actions={<span className="sync">● Real-time sync</span>}>
      {data.length === 0 ? (
        <Empty title="No accounts yet">Add your first account below with its current balance. Transactions, transfers and reports all start from here.</Empty>
      ) : (
        <div className="grid4">
          {data.map((a) => (
            <div key={a.id} className="card kpi"><span className="muted">{a.kind === "CreditCard" ? "Credit card" : a.kind}{a.mask ? ` · ****${a.mask}` : ""}</span><b>{a.name}</b><strong>{money(a.balance)}</strong><small className="muted">Updated {new Date(a.updatedAt).toLocaleTimeString()}</small></div>
          ))}
        </div>
      )}
      <Card title="Add an account">
        <div className="row">
          <input placeholder="Name, e.g. Meezan current" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select aria-label="Type" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <input placeholder="Current balance" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} />
          <input placeholder="Last 4 digits (optional)" value={form.mask} onChange={(e) => setForm({ ...form, mask: e.target.value })} />
          <button onClick={add}>Add account</button><span className="muted">{formMsg}</span>
        </div>
      </Card>
      {data.length >= 2 && (
        <Card title="Transfer between accounts">
          <div className="row"><select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From">{data.map((a) => <option key={a.id} value={a.id}>From: {a.name}</option>)}</select><select value={to} onChange={(e) => setTo(e.target.value)} aria-label="To">{data.map((a) => <option key={a.id} value={a.id}>To: {a.name}</option>)}</select><input aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} /><button onClick={transfer}>Transfer</button><span className="muted">{msg}</span></div>
        </Card>
      )}
    </Page>
  );
}
