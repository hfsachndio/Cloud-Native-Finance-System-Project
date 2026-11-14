import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import "./styles.css";
import { DEMO } from "./api";
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
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span>✓</span>FinTrack</div>
        {nav.map(([to, label]) => <NavLink key={to} to={to} end className="nav">{label}</NavLink>)}
        {DEMO && (
          <div className="demo-note">
            <b>Live demo</b>
            <small>Runs in your browser with sample data. Changes are saved locally.</small>
            <button onClick={() => { resetDemo(); location.reload(); }}>Reset data</button>
          </div>
        )}
        <div className="user"><span className="avatar">HZ</span><div><b>Hafsah Z.</b><small>Personal plan</small></div></div>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/reports" element={<Reports />} />
        </Routes>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>);
