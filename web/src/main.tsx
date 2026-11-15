import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import "./styles.css";
import { api, auth, DEMO, session } from "./api";
import Login from "./pages/Login";
import { resetDemo } from "./demo";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Accounts from "./pages/Accounts";
import Budgets from "./pages/Budgets";
import Receipts from "./pages/Receipts";
import Reports from "./pages/Reports";

const nav = [
  ["/", "Dashboard"], ["/transactions", "Transactions"], ["/accounts", "Accounts"],
  ["/budgets", "Budgets"], ["/receipts", "Receipts"], ["/reports", "Reports"],
];

function App() {
  const { pathname } = useLocation();
  const user = session.user();
  if (pathname === "/login") return <Login />;
  if (!DEMO && !session.token()) return <Navigate to="/login" replace />;
  const initials = (user?.name ?? "Demo user").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span>✓</span>FinTrack</div>
        {nav.map(([to, label]) => <NavLink key={to} to={to} end className="nav">{label}</NavLink>)}
        {DEMO ? (
          <div className="demo-note">
            <b>Live demo</b>
            <small>Runs in your browser with sample data. Changes are saved locally.</small>
            <button onClick={() => { resetDemo(); location.reload(); }}>Reset data</button>
          </div>
        ) : user?.guest ? (
          <div className="demo-note">
            <b>Demo workspace</b>
            <small>Your own private data in the Turso database. Sign up to keep it.</small>
            <button onClick={async () => { await api.resetWorkspace(); location.reload(); }}>Reset data</button>
          </div>
        ) : null}
        <div className="user"><span className="avatar">{initials}</span><div className="grow"><b>{user?.name ?? "Hafsah Z."}</b><small>{user ? (user.guest ? "Guest workspace" : user.email) : "Personal plan"}</small></div>
          {!DEMO && <button className="signout" title="Sign out" onClick={auth.logout}>⎋</button>}</div>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>);
