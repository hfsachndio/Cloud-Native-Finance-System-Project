import { api, money, monthLabel } from "../api";
import { useApi } from "../useApi";
import { Card, Empty, Kpi, Loading, Page } from "../components/ui";

const colors = ["#F59E0B", "#2563EB", "#4F46E5", "#DB2777", "#0D9488", "#7C3AED", "#94A3B8"];

export default function Reports() {
  const { data, error } = useApi(() => Promise.all([api.categories(), api.cashFlow(12)]));
  if (!data) return <Loading error={error} />;
  const [cats, flow] = data;
  const income = flow.reduce((s, f) => s + f.income, 0);
  const spending = flow.reduce((s, f) => s + f.spending, 0);
  let acc = 0;
  const gradient = cats.map((c, i) => `${colors[i % colors.length]} ${acc}% ${(acc += c.share)}%`).join(",");
  const maxSaved = Math.max(...flow.map((f) => f.income - f.spending), 1);
  return (
    <Page title="Reports" subtitle="Insights from your spending">
      {income === 0 && spending === 0 && <Empty title="Nothing to report yet">Reports fill in as you add transactions.</Empty>}
      <div className="grid4">
        <Kpi label="Income (12 months)" value={money(income)} />
        <Kpi label="Spending (12 months)" value={money(spending)} />
        <Kpi label="Savings rate" value={`${Math.round(((income - spending) / Math.max(income, 1)) * 100)}%`} good hint="Target 40%" />
        <Kpi label="Top category" value={cats[0]?.category ?? "—"} hint={cats[0] ? `${cats[0].share}% of spending` : ""} />
      </div>
      <div className="grid2">
        <Card title="Spending by category">
          <div className="row">
            <div className="donut" style={{ background: cats.length ? `conic-gradient(${gradient})` : "#E5E7EB" }}><div>{money(cats.reduce((s, c) => s + c.spent, 0))}</div></div>
            <div className="legend">{cats.map((c, i) => <div key={c.category}><i style={{ background: colors[i % colors.length] }} />{c.category}<b>{c.share}%</b></div>)}</div>
          </div>
        </Card>
        <Card title="Monthly savings" hint="Income minus spending">
          <div className="chart">{flow.map((f) => (
            <div key={f.month} className="col"><div className="bars"><i style={{ height: `${Math.max(0, (f.income - f.spending) / maxSaved) * 180}px`, width: 26, background: "linear-gradient(#60A5FA,#2563EB)" }} /></div><span>{monthLabel(f.month)}</span></div>
          ))}</div>
        </Card>
      </div>
    </Page>
  );
}
