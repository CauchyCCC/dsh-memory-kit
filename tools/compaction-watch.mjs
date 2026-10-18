// compaction-watch.mjs - snapshot memory when a session gets compacted.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { MINE_DIR, DB_DIR, DB_PATH, AUDIT_PATH, listSessionFiles, decodeSessionFile, fmtTime } from "./lib.mjs";

const OUT = path.join(MINE_DIR, "reinject");
mkdirSync(OUT, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("CREATE TABLE IF NOT EXISTS compaction_state(session TEXT PRIMARY KEY, maxSeq INTEGER NOT NULL, updatedAt INTEGER NOT NULL)");
try { db.exec("ALTER TABLE compaction_state ADD COLUMN mtimeMs INTEGER"); } catch {}
const get = db.prepare("SELECT maxSeq, mtimeMs FROM compaction_state WHERE session = ?");
const set = db.prepare("INSERT INTO compaction_state(session, maxSeq, mtimeMs, updatedAt) VALUES(?,?,?,?) ON CONFLICT(session) DO UPDATE SET maxSeq=excluded.maxSeq, mtimeMs=excluded.mtimeMs, updatedAt=excluded.updatedAt");

function readText(p) { try { return existsSync(p) ? readFileSync(p, "utf8") : ""; } catch { return ""; } }
function l1Active(limit) {
  const t = readText(path.join(MINE_DIR, "L1-FACTS.md"));
  const out = [];
  for (const line of t.split("\n")) {
    if (!line.startsWith("- ")) continue;
    if (line.indexOf("F-") < 0) continue;
    if (line.indexOf("active") < 0) continue;
    out.push(line.trim());
    if (out.length >= limit) break;
  }
  return out;
}
function topTopics(limit) {
  try {
    return db.prepare("SELECT topic, score, hits FROM topics WHERE expire_at > ? ORDER BY score DESC LIMIT ?").all(Date.now(), limit);
  } catch { return []; }
}
function auditTail(session, limit) {
  const t = readText(AUDIT_PATH);
  const short = session.slice(-8);
  const lines = t.split("\n").filter(function (l) { return l.indexOf("| " + short + " |") >= 0; });
  return lines.slice(-limit);
}
function buildSnapshot(session, evTime, evType) {
  const now = new Date();
  const parts = [];
  parts.push("# 记忆快照 · " + session);
  parts.push("");
  parts.push("> 自动生成于 " + fmtTime(now.getTime()) + "；检测到该会话在 **" + fmtTime(evTime) + "** 发生了 " + evType + "。");
  parts.push("> 压缩会甩掉对话历史里的细节；这份快照是重注入用的最小上下文。");
  parts.push("");
  parts.push("## 稳定事实（L1 active，最多 20 条）");
  const facts = l1Active(20);
  parts.push(facts.length ? facts.join("\n") : "（暂无）");
  parts.push("");
  parts.push("## 热话题（Top 10）");
  const topics = topTopics(10);
  parts.push(topics.length ? topics.map(function (t, i) { return (i + 1) + ". " + t.topic + "（score " + Number(t.score).toFixed(0) + "）"; }).join("\n") : "（暂无）");
  parts.push("");
  parts.push("## 该会话最近动作（AUDIT 尾部 10 条）");
  const tail = auditTail(session, 10);
  parts.push(tail.length ? tail.join("\n") : "（暂无）");
  parts.push("");
  parts.push("## 怎么用");
  parts.push("如果上下文被压缩、你感到失忆：先读本文件，再按需读 L0-INDEX.md / L1-FACTS.md；");
  parts.push("要找回逐字原话，用 tools/recall-query.mjs 搜索关键词。");
  return parts.join("\n");
}

const files = await listSessionFiles();
let snapshots = 0;
for (const f of files) {
  const row = get.get(f.session);
  if (row && row.mtimeMs === f.mtimeMs) continue;
  const decoded = await decodeSessionFile(f.file);
  const since = row ? Number(row.maxSeq) : -1;
  let maxSeq = since, lastTime = 0, lastType = "";
  for (const ev of decoded.events) {
    const seq = typeof ev.seq === "number" ? ev.seq : 0;
    if (seq > maxSeq) maxSeq = seq;
    if (seq <= since) continue;
    if (ev.type && ev.type.indexOf("compaction/") === 0) {
      if ((ev.time || 0) >= lastTime) { lastTime = ev.time || 0; lastType = ev.type; }
    }
  }
  if (lastTime) {
    writeFileSync(path.join(OUT, f.session + ".md"), buildSnapshot(f.session, lastTime, lastType), "utf8");
    writeFileSync(path.join(OUT, "latest.md"), buildSnapshot(f.session, lastTime, lastType), "utf8");
    snapshots++;
    console.log("snapshot: " + f.session.slice(-12) + " (" + lastType + " @ " + fmtTime(lastTime) + ")");
  }
  if (maxSeq > since || !row) set.run(f.session, maxSeq, f.mtimeMs, Date.now());
}
console.log("compaction-watch: " + snapshots + " new snapshot(s) across " + files.length + " sessions");
