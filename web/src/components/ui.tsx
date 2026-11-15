import type { ReactNode } from "react";
import type { Status } from "../api";

export function Page({ title, subtitle, actions, children }: { title: string; subtitle: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="page">
      <header className="page-head">
        <div><h1>{title}</h1><p>{subtitle}</p></div>
        <div className="row">{actions}</div>
      </header>
      {children}
    </div>
  );
}

export const Card = ({ title, hint, children, className = "" }: { title?: string; hint?: string; children: ReactNode; className?: string }) => (
  <section className={`card ${className}`}>
    {title && <div className="card-head"><h2>{title}</h2>{hint && <span className="muted">{hint}</span>}</div>}
    {children}
  </section>
);

export const Kpi = ({ label, value, hint, good }: { label: string; value: string; hint?: string; good?: boolean }) => (
  <div className="card kpi"><span className="muted">{label}</span><strong>{value}</strong>{hint && <small className={good ? "good" : "muted"}>{hint}</small>}</div>
);

const tone: Record<Status, string> = { Completed: "ok", Processing: "info", Pending: "info", NeedsReview: "warn" };
const label: Record<Status, string> = { Completed: "Completed", Processing: "Processing", Pending: "Pending", NeedsReview: "Needs review" };
export const StatusPill = ({ status }: { status: Status }) => <span className={`pill ${tone[status]}`}>{label[status]}</span>;

export const Bar = ({ value, color = "var(--blue)" }: { value: number; color?: string }) => (
  <div className="bar"><i style={{ width: `${Math.min(100, value)}%`, background: color }} /></div>
);

export const Loading = ({ error }: { error?: string | null }) =>
  <div className="card muted">{error ? `Could not load data: ${error}` : "Loading…"}</div>;
