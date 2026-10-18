// recall-query.mjs - search the indexed transcripts and print verbatim hits.
import { DatabaseSync } from "node:sqlite";
import { DB_PATH, searchTokens, fmtTime } from "./lib.mjs";

const argv = process.argv.slice(2);
function opt(name, def) { const i = argv.indexOf("--" + name); return i >= 0 ? argv[i + 1] : def; }
const limit = Number(opt("limit", 10));
const session = opt("session", null);
const role = opt("role", null);
const asJson = argv.includes("--json");
const skip = new Set(["--limit", "--session", "--role"]);
const words = [];
for (let i = 0; i < argv.length; i++) {
  if (skip.has(argv[i])) { i++; continue; }
  if (argv[i].startsWith("--")) continue;
  words.push(argv[i]);
}
const query = words.join(" ").trim();
if (!query) { console.error('usage: node recall-query.mjs "keywords" [--limit 10] [--session NAME] [--role user] [--json]'); process.exit(2); }

const toks = searchTokens(query);
const matchExpr = toks.map(function (t) { return '"' + t.replace(/"/g, '""') + '"'; }).join(" AND ");
const db = new DatabaseSync(DB_PATH, { readOnly: true });
let sql = "SELECT session, seq, ts, role, text, bm25(recall) AS score FROM recall WHERE tokens MATCH ?";
const params = [matchExpr];
if (session) { sql += " AND session = ?"; params.push(session); }
if (role) { sql += " AND role = ?"; params.push(role); }
sql += " ORDER BY score LIMIT ?"; params.push(limit);
const rows = db.prepare(sql).all.apply(db.prepare(sql), params);

if (asJson) { console.log(JSON.stringify({ query: query, match: matchExpr, hits: rows }, null, 2)); process.exit(0); }
console.log("query: " + query + "   (match: " + matchExpr + ")   hits: " + rows.length + "\n");
let i = 0;
for (const r of rows) {
  i++;
  const text = String(r.text || "").replace(/\s+/g, " ").slice(0, 400);
  console.log("[" + i + "] " + fmtTime(r.ts) + "  " + r.session + "#" + r.seq + "  " + r.role);
  console.log("    " + text + (String(r.text || "").length > 400 ? " ..." : ""));
  console.log("");
}
