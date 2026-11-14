import { useState } from "react";
import { api, money } from "../api";
import { useApi } from "../useApi";
import { Card, Loading, Page } from "../components/ui";

export default function Accounts() {
  const { data, error, reload } = useApi(() => api.accounts());
  const [amount, setAmount] = useState("100");
  const [msg, setMsg] = useState("");
  if (!data) return <Loading error={error} />;
  const total = data.reduce((s, a) => s + a.balance, 0);

  const transfer = async () => {
    try {
      await api.transfer("acc-checking", "acc-savings", Number(amount));
      setMsg(`Moved ${money(Number(amount))} to savings.`);
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <Page title="Accounts" subtitle={`${data.length} linked accounts · net worth ${money(total)}`} actions={<span className="sync">● Real-time sync</span>}>
      <div className="grid4">
        {data.map((a) => (
          <div key={a.id} className="card kpi"><span className="muted">{a.kind}{a.mask ? ` · ****${a.mask}` : ""}</span><b>{a.name}</b><strong>{money(a.balance)}</strong><small className="muted">Updated {new Date(a.updatedAt).toLocaleTimeString()}</small></div>
        ))}
      </div>
      <Card title="Move money to savings">
        <div className="row"><input value={amount} onChange={(e) => setAmount(e.target.value)} /><button onClick={transfer}>Transfer</button><span className="muted">{msg}</span></div>
      </Card>
    </Page>
  );
}
