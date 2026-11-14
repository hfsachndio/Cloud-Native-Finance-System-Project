import { useState } from "react";
import { api, money } from "../api";
import { useApi } from "../useApi";
import { Bar, Card, Loading, Page } from "../components/ui";

export default function Budgets() {
  const { data, error, reload } = useApi(() => Promise.all([api.budgets(), api.alerts()]));
  const [form, setForm] = useState({ category: "", limit: "" });
  if (!data) return <Loading error={error} />;
  const [budgets, alerts] = data;

  const add = async () => {
    if (!form.category || !Number(form.limit)) return;
    await api.addBudget(form.category, Number(form.limit));
    setForm({ category: "", limit: "" });
    reload();
  };

  return (
    <Page title="Budgets" subtitle="Live progress · alerts at 90% of a budget">
      {alerts.map((a) => <div key={a.id} className="alert">🔔 <b>{a.message}</b> <span className="muted">Raised by Azure Functions</span></div>)}
      <div className="grid3">
        {budgets.map((b) => (
          <Card key={b.category}>
            <div className="row between"><b>{b.category}</b><span className={`pill ${b.percent >= 90 ? "bad" : b.percent >= 75 ? "warn" : "ok"}`}>{b.percent}%</span></div>
            <div className="big">{money(b.spent)} <span className="muted">of {money(b.limit)}</span></div>
            <Bar value={b.percent} color={b.overThreshold ? "#DC2626" : "var(--blue)"} />
            <small className="muted">{money(b.remaining)} left</small>
          </Card>
        ))}
      </div>
      <Card title="New budget">
        <div className="row"><input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /><input placeholder="Monthly limit" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} /><button onClick={add}>Create</button></div>
      </Card>
    </Page>
  );
}
