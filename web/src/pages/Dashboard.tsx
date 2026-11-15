import { api, money, monthLabel, session } from "../api";
import { useApi } from "../useApi";
import { Bar, Card, Kpi, Loading, Page, StatusPill } from "../components/ui";

export default function Dashboard() {
  const { data, error } = useApi(() => Promise.all([api.netWorth(), api.cashFlow(6), api.budgets(), api.transactions()]));
  if (!data) return <Loading error={error} />;
  const [worth, flow, budgets, txs] = data;
  const month = flow[flow.length - 1];
  const max = Math.max(...flow.flatMap((f) => [f.income, f.spending]), 1);
  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const first = session.user()?.guest ? "" : session.user()?.name.split(" ")[0];
  return (
    <Page title={first ? `${greeting}, ${first}` : greeting} subtitle="Your money at a glance" actions={<span className="sync">● Real-time sync</span>}>
      <div className="grid4">
        <Kpi label="Total balance" value={money(worth.total)} hint={`${worth.accounts} accounts`} />
        <Kpi label="Income this month" value={money(month.income)} good hint="Deposits" />
        <Kpi label="Spending this month" value={money(month.spending)} />
        <Kpi label="Saved this month" value={money(month.income - month.spending)} good hint={`${Math.round(((month.income - month.spending) / Math.max(month.income, 1)) * 100)}% of income`} />
      </div>
      <div className="grid2">
        <Card title="Cash flow" hint="Last 6 months">
          <div className="chart">
            {flow.map((f) => (
              <div key={f.month} className="col">
                <div className="bars"><i style={{ height: `${(f.income / max) * 180}px`, background: "#93C5FD" }} /><i style={{ height: `${(f.spending / max) * 180}px`, background: "#1D4ED8" }} /></div>
                <span>{monthLabel(f.month)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Budgets" hint="This month">
          {budgets.slice(0, 5).map((b) => (
            <div key={b.category} className="budget-row">
              <div className="row between"><b>{b.category}</b><span>{money(b.spent)} <span className="muted">/ {money(b.limit)}</span></span></div>
              <Bar value={b.percent} color={b.overThreshold ? "#DC2626" : "var(--blue)"} />
            </div>
          ))}
        </Card>
      </div>
      <Card title="Recent transactions" hint="Processed by Azure Functions">
        <table>
          <thead><tr><th>Description</th><th>Category</th><th>Date</th><th>Status</th><th className="right">Amount</th></tr></thead>
          <tbody>{txs.slice(0, 5).map((t) => (
            <tr key={t.id}><td><b>{t.description}</b></td><td>{t.category}</td><td className="muted">{t.date}</td><td><StatusPill status={t.status} /></td><td className={`right ${t.amount > 0 ? "good" : ""}`}><b>{money(t.amount, true)}</b></td></tr>
          ))}</tbody>
        </table>
      </Card>
    </Page>
  );
}
