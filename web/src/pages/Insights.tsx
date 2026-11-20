import { Link } from "react-router-dom";
import { api, money } from "../api";
import { useApi } from "../useApi";
import { Bar, Card, Empty, Kpi, Loading, Page } from "../components/ui";

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

/** Tiny sparkline of six months of history plus the forecast point. */
function Spark({ history, next }: { history: number[]; next: number }) {
  const all = [...history, next], max = Math.max(1, ...all), w = 140, h = 36, step = w / (all.length - 1);
  const pts = all.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts.slice(0, -1).join(" ")} fill="none" stroke="var(--blue)" strokeWidth="2" />
      <polyline points={pts.slice(-2).join(" ")} fill="none" stroke="var(--violet, #8b5cf6)" strokeWidth="2" strokeDasharray="4 3" />
      <circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]} r="3" fill="var(--violet, #8b5cf6)" />
    </svg>
  );
}

export default function Insights() {
  const { data, error } = useApi(() => api.insights());
  if (!data) return <Page title="AI insights" subtitle="Forecasts and checks from FinTrack's models"><Loading error={error} /></Page>;
  const m = data.model;
  return (
    <Page title="AI insights" subtitle="Spending forecast, budget risk and unusual payments, worked out from your own history">
      {!data.enoughHistory ? (
        <Empty title="Not enough history yet" action={<Link className="btn" to="/transactions">Add transactions</Link>}>
          Forecasts need at least 10 transactions. Until then FinTrack projects from this month's pace only.
        </Empty>
      ) : null}
      <div className="grid4">
        <Kpi label="Spent so far this month" value={money(data.total.spentThisMonth)} hint={`Day ${data.dayOfMonth} of ${data.daysInMonth}`} />
        <Kpi label="Projected by month end" value={money(data.total.projectedThisMonth)} hint="Current pace blended with the forecast" />
        <Kpi label="Forecast for next month" value={money(data.total.nextMonth)} hint={data.total.method === "holt" ? "Holt's trend model" : "Average of your months"} />
        <Kpi label="Forecast error (MAE)" value={data.total.mae == null ? "—" : money(data.total.mae)}
          hint={data.total.mae != null && data.total.naiveMae ? `vs ${money(data.total.naiveMae)} for "same as last month"` : "Needs 3+ months"} good={!!(data.total.mae != null && data.total.naiveMae && data.total.mae < data.total.naiveMae)} />
      </div>

      <Card title="Forecast by category" hint="Solid line: last 6 months · dashed: next month">
        {data.byCategory.length === 0 ? <p className="muted">No spending recorded yet.</p> : (
          <table>
            <thead><tr><th>Category</th><th>Trend</th><th className="right">This month</th><th className="right">Projected</th><th>Budget</th><th className="right">Next month</th></tr></thead>
            <tbody>{data.byCategory.map((c) => (
              <tr key={c.category}>
                <td><b>{c.category}</b></td>
                <td><Spark history={c.history} next={c.nextMonth} /></td>
                <td className="right">{money(c.spentThisMonth)}</td>
                <td className="right"><b>{money(c.projectedThisMonth)}</b></td>
                <td style={{ minWidth: 150 }}>{c.budget == null ? <span className="muted">No budget</span> : <>
                  <Bar value={(c.projectedThisMonth / c.budget) * 100} color={c.overBudgetRisk ? "var(--red, #ef4444)" : "var(--green, #22c55e)"} />
                  <small className={c.overBudgetRisk ? "bad" : "muted"}>{c.overBudgetRisk ? `Likely over ${money(c.budget)}` : `On track for ${money(c.budget)}`}</small></>}</td>
                <td className="right">{money(c.nextMonth)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      <div className="grid2 grid2-auto">
        <Card title="Unusual payments" hint="Much larger than your typical amount in that category">
          {data.unusual.length === 0 ? <p className="muted">Nothing unusual. Payments are checked with a robust z-score (median and MAD) per category.</p> : (
            <table><tbody>{data.unusual.map((t) => (
              <tr key={t.id}><td><b>{t.description}</b><br /><small className="muted">{t.category} · {t.date} · typical {money(t.typical)}</small></td><td className="right bad"><b>{money(t.amount, true)}</b><br /><small>score {t.score}</small></td></tr>
            ))}</tbody></table>
          )}
        </Card>
        <Card title="About the categoriser" hint="Model card">
          <ul className="model-card">
            <li><b>Model:</b> character n-gram TF-IDF + multinomial logistic regression ({m.features.toLocaleString()} features, {m.labels.length} categories)</li>
            <li><b>Trained on:</b> {m.metrics.train_rows.toLocaleString()} labelled bank-statement lines (card prefixes, typos, truncation)</li>
            <li><b>Accuracy, new lines from known merchants:</b> {pct(m.metrics.known_merchants_accuracy)}</li>
            <li><b>Accuracy, merchants never seen in training:</b> {pct(m.metrics.test_accuracy)} (keyword rules: 33.6%)</li>
            <li><b>Learns from you:</b> change a category and later payments from that merchant follow your choice</li>
            <li><b>Forecast:</b> Holt's linear trend, smoothing tuned per category on your own history</li>
          </ul>
        </Card>
      </div>
    </Page>
  );
}
