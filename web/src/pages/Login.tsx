import { useState, type FormEvent } from "react";
import { afterLogin, auth, type User } from "../api";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const expired = new URLSearchParams(location.search).has("expired");
  const run = async (fn: () => Promise<User>) => {
    setBusy(true); setErr("");
    try { const u = await fn(); location.assign(afterLogin(u)); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void run(() => (mode === "login" ? auth.login(f.email, f.password) : auth.register(f.name, f.email, f.password))); };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="login">
      <section className="login-art">
        <div className="brand"><span>✓</span>FinTrack</div>
        <div>
          <h1>Personal finance, tracked end to end.</h1>
          <p>Accounts, transactions, budgets with alerts, receipt processing and reports.</p>
          <ul><li>Auto-categorised transactions</li><li>Budget alerts at 90% of the limit</li><li>Receipt upload and matching</li><li>Cash-flow and category reports</li></ul>
        </div>
        <small>Node API on Vercel · Turso (libSQL) · JWT auth · .NET 8 microservices on Azure in the main build</small>
      </section>
      <section className="login-form">
        <form onSubmit={submit}>
          <h2>{mode === "login" ? "Sign in" : "Create your account"}</h2>
          <p className="muted" style={{ margin: 0 }}>{mode === "login" ? "Welcome back. You\u2019ll continue where you left off." : "Your workspace starts empty: add an account, then your transactions and budgets."}</p>
          {mode === "register" && <label>Name<input value={f.name} onChange={set("name")} autoComplete="name" required /></label>}
          <label>Email<input type="email" value={f.email} onChange={set("email")} autoComplete="email" required /></label>
          <label>Password<input type="password" value={f.password} onChange={set("password")} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 8 : undefined} required /></label>
          {expired && !err && <div className="muted">Your session ended. Sign in to continue where you left off.</div>}
          {err && <div className="err">{err}</div>}
          <button type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
          <button type="button" className="alt" disabled={busy} onClick={() => void run(auth.demo)}>Try a demo workspace</button>
          <button type="button" className="switch" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}>
            {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}
