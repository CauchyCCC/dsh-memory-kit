// recall-index.mjs - index session transcripts into a local FTS5 database.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { DB_DIR, DB_PATH, listSessionFiles, decodeSessionFile, cjkTokens, extractIndexable } from "./lib.mjs";

mkdirSync(DB_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS recall USING fts5(tokens, text UNINDEXED, session UNINDEXED, seq UNINDEXED, ts UNINDEXED, role UNINDEXED, tokenize='unicode61')");
db.exec("CREATE TABLE IF NOT EXISTS recall_state(session TEXT PRIMARY KEY, maxSeq INTEGER NOT NULL, indexedAt INTEGER NOT NULL)");

const files = await listSessionFiles();
try { db.exec("ALTER TABLE recall_state ADD COLUMN mtimeMs INTEGER"); } catch {}
const getState = db.prepare("SELECT maxSeq, mtimeMs FROM recall_state WHERE session = ?");
const setState = db.prepare("INSERT INTO recall_state(session, maxSeq, indexedAt, mtimeMs) VALUES(?,?,?,?) ON CONFLICT(session) DO UPDATE SET maxSeq=excluded.maxSeq, indexedAt=excluded.indexedAt, mtimeMs=excluded.mtimeMs");
const insert = db.prepare("INSERT INTO recall(tokens, text, session, seq, ts, role) VALUES(?,?,?,?,?,?)");

let totalNew = 0;
for (const f of files) {
  const row = getState.get(f.session);
  if (row && row.mtimeMs === f.mtimeMs) continue;
  const since = row ? Number(row.maxSeq) : -1;
  const decoded = await decodeSessionFile(f.file);
  let maxSeq = since;
  const rows = [];
  for (const ev of decoded.events) {
    const seq = typeof ev.seq === "number" ? ev.seq : 0;
    if (seq > maxSeq) maxSeq = seq;
    if (seq <= since) continue;
    const x = extractIndexable(ev);
    if (!x || !x.text || !x.text.trim()) continue;
    rows.push([cjkTokens(x.text), x.text, f.session, seq, ev.time || 0, x.role]);
  }
  if (rows.length) {
    db.exec("BEGIN");
    try {
      for (const r of rows) insert.run(r[0], r[1], r[2], r[3], r[4], r[5]);
      setState.run(f.session, maxSeq, Date.now(), f.mtimeMs);
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
  } else {
    setState.run(f.session, maxSeq, Date.now(), f.mtimeMs);
  }
  totalNew += rows.length;
  console.log(f.session.slice(0, 26) + "  events=" + decoded.events.length + "  new=" + rows.length);
}
console.log("\nindexed new rows: " + totalNew + " across " + files.length + " sessions");
console.log("total rows now: " + db.prepare("SELECT count(*) AS n FROM recall").get().n);
