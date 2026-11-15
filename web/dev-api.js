// Local API for `npm run dev:full`: same handler as Vercel, backed by a local SQLite file unless TURSO_* is set.
import http from "node:http";
import handler from "./api/index.js";
const port = Number(process.env.API_PORT || 5100);
http.createServer((req, res) => { void handler(req, res); }).listen(port, () => console.log(`FinTrack API on http://localhost:${port}`));
