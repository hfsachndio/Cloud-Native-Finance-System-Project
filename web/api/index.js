import * as s from "./_lib/service.js";

/**
 * FinTrack API for the Vercel deployment: the same routes the .NET gateway exposes,
 * backed by Turso (libSQL) with per-user workspaces and JWT auth.
 * vercel.json rewrites /api/<path> to /api?path=<path>.
 */
export default async function handler(req, res) {
  const url = new URL(req.url, "http://local");
  const path = (url.searchParams.get("path") || url.pathname.replace(/^\/api\/?/, "")).replace(/^\/+|\/+$/g, "");
  const qp = Object.fromEntries([...url.searchParams].filter(([k]) => k !== "path"));
  const method = req.method || "GET";
  const send = (status, body) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.setHeader("cache-control", "no-store"); res.end(body === undefined ? "" : JSON.stringify(body)); };
  try {
    let body = req.body;
    if (method !== "GET" && (body === undefined || typeof body === "string")) {
      if (typeof body !== "string") { const chunks = []; for await (const c of req) chunks.push(c); body = Buffer.concat(chunks).toString("utf8"); }
      body = body ? JSON.parse(body) : {};
    }
    body ??= {};
    const header = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const token = header;
    const uid = token ? s.verify(token) : null;
    const auth = () => { if (!uid) throw new s.HttpError(401, "Please sign in."); return uid; };
    const [a, b, c] = path.split("/");

    let out;
    if (method === "GET" && path === "health") out = await s.health();
    else if (method === "POST" && path === "auth/register") out = await s.register(body);
    else if (method === "POST" && path === "auth/login") out = await s.login(body);
    else if (method === "POST" && path === "auth/demo") out = await s.demo();
    else if (method === "GET" && path === "auth/me") out = await s.me(auth());
    else if (method === "POST" && path === "workspace/reset") out = await s.resetWorkspace(auth());
    else if (method === "GET" && path === "accounts") out = await s.accounts(auth());
    else if (method === "GET" && path === "accounts/net-worth") out = await s.netWorth(auth());
    else if (method === "POST" && path === "accounts/transfer") out = await s.transfer(auth(), body);
    else if (method === "GET" && path === "transactions") out = await s.transactions(auth(), qp);
    else if (method === "POST" && path === "transactions") out = await s.addTransaction(auth(), body);
    else if (method === "POST" && a === "transactions" && c === "receipt") out = await s.uploadReceipt(auth(), b, body);
    else if (method === "GET" && a === "transactions" && c === "receipt") {
      const f = await s.receiptFile(auth(), b);
      res.statusCode = 200; res.setHeader("content-type", f.type); res.setHeader("cache-control", "private, no-store");
      res.setHeader("content-disposition", `inline; filename="${f.name}"`); res.setHeader("x-content-type-options", "nosniff");
      return res.end(f.data);
    }
    else if (method === "GET" && path === "budgets") out = await s.budgets(auth(), qp.month);
    else if (method === "POST" && path === "budgets") out = await s.addBudget(auth(), body);
    else if (method === "GET" && path === "budgets/alerts") out = await s.alerts(auth());
    else if (method === "GET" && path === "reports/cash-flow") out = await s.cashFlow(auth(), qp.months);
    else if (method === "GET" && path === "reports/categories") out = await s.categories(auth(), qp.year);
    else throw new s.HttpError(404, "Not found");
    send(200, out);
  } catch (e) {
    const status = e.status || (e instanceof SyntaxError ? 400 : 500);
    if (status >= 500) console.error(e);
    send(status, { error: e.status ? e.message : status === 400 ? "Invalid JSON" : "Something went wrong" });
  }
}
