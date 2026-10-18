// audit-compile.mjs - compile DSH session events into a compact AUDIT.log timeline.
// Sources are split by channel: rpcId starting with "weixin-" => im, otherwise web.
import { DatabaseSync } from "node:sqlite";
import { appendFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MINE_DIR, DB_DIR, DB_PATH, AUDIT_PATH, listSessionFiles, decodeSessionFile, contentText, fmtTime } from "./lib.mjs";

const EVENTS_DIR = path.join(MINE_DIR, "L2-EVENTS");
mkdirSync(DB_DIR, { recursive: true });
mkdirSync(EVENTS_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("CREATE TABLE IF NOT EXISTS audit_state(session TEXT PRIMARY KEY, maxSeq INTEGER NOT NULL, updatedAt INTEGER NOT NULL)");
try { db.exec("ALTER TABLE audit_state ADD COLUMN mtimeMs INTEGER"); } catch {}
const getState = db.prepare("SELECT maxSeq, mtimeMs FROM audit_state WHERE session = ?");
const setState = db.prepare("INSERT INTO audit_state(session, maxSeq, updatedAt, mtimeMs) VALUES(?,?,?,?) ON CONFLICT(session) DO UPDATE SET maxSeq=excluded.maxSeq, updatedAt=excluded.updatedAt, mtimeMs=excluded.mtimeMs");

function oneLine(s, n) {
  const x = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return x.length > n ? x.slice(0, n) + "..." : x;
}
function argsSummary(ev) {
  const d = ev.data || {};
  let a = {};
  try { a = JSON.parse(d.arguments || "{}"); } catch {}
  const bits = [];
  if (a.description) bits.push(a.description);
  else if (a.command) bits.push(oneLine(a.command, 110));
  if (a.file_path) bits.push(a.file_path);
  else if (a.pattern) bits.push(oneLine(JSON.stringify(a.pattern), 70));
  return oneLine(bits.join(" | "), 170);
}
function dayKey(ts) {
  const d = new Date(Number(ts));
  const p = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function channelOf(events) {
  let im = 0, web = 0;
  for (const ev of events) {
    const srcs = ev.type === "agent/inbox/spliced"
      ? (ev.data && ev.data.inserted || []).map(function (m) { return m.source; })
      : ev.type === "user/message" ? [ev.data && ev.data.source] : [];
    for (const s of srcs) {
      if (s && typeof s.rpcId === "string") { if (s.rpcId.indexOf("weixin-") === 0) im++; else web++; }
    }
  }
  return im > web ? "im" : "web";
}

const files = await listSessionFiles();
let total = 0;
for (const f of files) {
  const row = getState.get(f.session);
  if (row && row.mtimeMs === f.mtimeMs) continue;
  const since = row ? Number(row.maxSeq) : -1;
  const decoded = await decodeSessionFile(f.file);
  const channel = channelOf(decoded.events);
  let maxSeq = since;
  const auditLines = [];
  const dayLines = new Map();
  for (const ev of decoded.events) {
    const seq = typeof ev.seq === "number" ? ev.seq : 0;
    if (seq > maxSeq) maxSeq = seq;
    if (seq <= since) continue;
    const d = ev.data || {};
    const t = fmtTime(ev.time);
    const turn = d.turn ? "t" + d.turn : "";
    let line = null, dayWorthy = false;
    switch (ev.type) {
      case "user/message": line = "USER: " + oneLine(contentText(d.content), 200); dayWorthy = true; break;
      case "assistant/message": { const x = contentText(d.message && d.message.content); line = x ? "AI: " + oneLine(x, 150) : null; break; }
      case "tool/call": line = "TOOL " + (d.name || "?") + ": " + argsSummary(ev); break;
      case "deliverables/presented": line = "DELIVERED: " + (d.files || []).map(function (x) { return x.path; }).join(", "); dayWorthy = true; break;
      case "approval/asked": line = "APPROVAL ASKED: " + (d.toolName || ""); dayWorthy = true; break;
      case "approval/decided": line = "APPROVAL " + (d.outcome || ""); dayWorthy = true; break;
      case "compaction/prune": line = "COMPACTION: pruned " + JSON.stringify(d.shadowedSeqs || d.shadowedRange || {}); dayWorthy = true; break;
      case "turn/end": line = "turn " + (d.turn || "?") + " end (" + ((d.reason && d.reason.kind) || "") + ")"; break;
      case "todo/write": line = "TODO: " + oneLine((d.todos || []).map(function (x) { return x.status + ":" + x.content; }).join(" | "), 150); break;
      default: line = null;
    }
    if (!line) continue;
    const full = t + " | " + channel + " | " + f.session.slice(-8) + " | " + turn + " | " + line;
    auditLines.push(full);
    if (dayWorthy) {
      const k = channel + "|" + dayKey(ev.time);
      if (!dayLines.has(k)) dayLines.set(k, []);
      dayLines.get(k).push(full);
    }
  }
  if (auditLines.length) appendFileSync(AUDIT_PATH, auditLines.join("\n") + "\n", "utf8");
  for (const entry of dayLines) {
    const parts = entry[0].split("|");
    const p = path.join(EVENTS_DIR, parts[0] + "-" + parts[1] + ".md");
    if (!existsSync(p)) writeFileSync(p, "# L2 事件 · " + parts[0] + " · " + parts[1] + "\n\n> 由 tools/audit-compile.mjs 自动生成（高价值事件；按来源分文件）。\n\n", "utf8");
    appendFileSync(p, entry[1].join("\n") + "\n", "utf8");
  }
  setState.run(f.session, maxSeq, Date.now(), f.mtimeMs);
  total += auditLines.length;
}
console.log("audit lines appended: " + total + " across " + files.length + " sessions");
