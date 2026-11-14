import { useState } from "react";
import { api, money } from "../api";
import { useApi } from "../useApi";
import { Card, Loading, Page, StatusPill } from "../components/ui";

const steps = [
  ["Uploaded", "Blob Storage · private container"],
  ["Read", "ProcessReceipt function extracts the total"],
  ["Matched", "Compared with the transaction amount"],
  ["Done", "Completed, or flagged for review"],
];

export default function Receipts() {
  const { data, error, reload } = useApi(() => api.transactions());
  const [target, setTarget] = useState("");
  const [msg, setMsg] = useState("");
  if (!data) return <Loading error={error} />;
  const withReceipts = data.filter((t) => t.receiptBlob);
  const spending = data.filter((t) => t.amount < 0);

  const upload = async (file?: File) => {
    if (!file || !target) return setMsg("Choose a transaction first.");
    const t = await api.uploadReceipt(target, file);
    setMsg(`Uploaded ${file.name}. Status: ${t.status}.`);
    reload();
    setTimeout(() => { reload(); setMsg(`${file.name} processed.`); }, 3000);
  };

  return (
    <Page title="Receipts" subtitle="Stored securely in Azure Blob Storage">
      <Card title="How a receipt is processed" hint="Serverless pipeline">
        <div className="steps">{steps.map(([t, d], i) => <div key={t} className="step"><span>{i + 1}</span><b>{t}</b><small className="muted">{d}</small></div>)}</div>
      </Card>
      <Card title="Upload a receipt">
        <div className="row">
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose a transaction…</option>
            {spending.map((t) => <option key={t.id} value={t.id}>{t.description} · {money(t.amount)}</option>)}
          </select>
          <input type="file" accept="image/*,.pdf,.txt" onChange={(e) => upload(e.target.files?.[0])} />
          <span className="muted">{msg}</span>
        </div>
      </Card>
      <div className="grid3">
        {withReceipts.map((t) => (
          <Card key={t.id}>
            <div className="thumb">🧾</div>
            <div className="row between"><b>{t.description}</b><StatusPill status={t.status} /></div>
            <small className="muted">{t.receiptBlob?.split("/").pop()} · {t.date}</small>
            <div className="big">{money(Math.abs(t.amount))}</div>
          </Card>
        ))}
      </div>
    </Page>
  );
}
