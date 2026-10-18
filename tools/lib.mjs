// lib.mjs - shared helpers for dsh-memory-kit.
import { readdir, stat, readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import zlib from "node:zlib";
import { MINE_DIR, DB_DIR, DB_PATH, AUDIT_PATH, SESSIONS_ROOT, WORKSPACE } from "../config.mjs";

export { MINE_DIR, DB_DIR, DB_PATH, AUDIT_PATH, SESSIONS_ROOT, WORKSPACE };
export const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));

// A DSH sessions root contains one directory per workspace (--C-...-- style),
// and each workspace contains one directory per session. Scan one level down.
export function defaultSessionRoots() {
  try {
    const entries = readdirSync(SESSIONS_ROOT, { withFileTypes: true });
    const dirs = entries
      .filter(function (e) { return e.isDirectory() && e.name.indexOf("--") === 0; })
      .map(function (e) { return path.join(SESSIONS_ROOT, e.name); });
    return dirs.length ? dirs : [SESSIONS_ROOT];
  } catch { return [SESSIONS_ROOT]; }
}

export async function listSessionFiles(roots) {
  const list = roots && roots.length ? roots : defaultSessionRoots();
  const out = [];
  for (const root of list) {
    let entries;
    try { entries = await readdir(root, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const file = path.join(root, e.name, "session.v4.jsonl.zstd");
      try {
        const st = await stat(file);
        out.push({ session: e.name, file, mtimeMs: Math.round(st.mtimeMs), size: st.size });
      } catch {}
    }
  }
  out.sort(function (a, b) { return a.mtimeMs - b.mtimeMs; });
  return out;
}

// A DSH session file is a concatenation of zstd frames (one per append). Node's
// zstd helper only decodes the first frame, so scan for the frame magic and
// decode each frame separately.
export function decodeSessionBuffer(buf) {
  const starts = [];
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === 0x28 && buf[i + 1] === 0xB5 && buf[i + 2] === 0x2F && buf[i + 3] === 0xFD) starts.push(i);
  }
  const events = [];
  for (const s of starts) {
    let text;
    try { text = zlib.zstdDecompressSync(buf.subarray(s)).toString("utf8"); } catch { continue; }
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try { events.push(JSON.parse(t)); } catch {}
    }
  }
  return { events, frames: starts.length };
}

export async function decodeSessionFile(file) {
  const buf = await readFile(file);
  return decodeSessionBuffer(buf);
}

// FTS5 with unicode61 treats a whole CJK run as one token, which makes 2-char
// Chinese queries useless. Split CJK into single characters so any substring of
// Chinese works with a simple AND query.
const CJK = /([\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF])/g;
export function cjkTokens(s) {
  return String(s == null ? "" : s).replace(CJK, " $1 ").replace(/\s+/g, " ").trim();
}

export function searchTokens(q) {
  const rough = String(q == null ? "" : q).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const parts = rough.split(/\s+/).filter(Boolean).map(cjkTokens).join(" ").split(/\s+/).filter(Boolean);
  return [...new Set(parts)];
}

export function contentText(content) {
  if (!Array.isArray(content)) return "";
  return content.filter(function (c) { return c && c.type === "text" && typeof c.text === "string"; }).map(function (c) { return c.text; }).join("\n");
}

export function extractIndexable(ev) {
  const d = ev.data || {};
  switch (ev.type) {
    case "user/message":
      return { role: "user", text: contentText(d.content) };
    // agent/inbox/spliced duplicates user/message; skip it to avoid double hits.
    case "assistant/message":
      return { role: "assistant", text: contentText(d.message && d.message.content) };
    case "tool/call":
      return { role: "tool-call", text: (d.name || "?") + " " + String(d.arguments || "").slice(0, 2000) };
    case "tool/result":
      return { role: "tool-result", text: contentText(d.message && d.message.content).slice(0, 4000) };
    case "session/title":
      return { role: "meta", text: "title: " + (d.title || "") };
    case "deliverables/presented":
      return { role: "meta", text: "deliverables: " + (d.files || []).map(function (f) { return f.path; }).join(", ") };
    case "approval/asked":
      return { role: "meta", text: "approval asked: " + (d.toolName || "") + " " + String(d.reason || "").slice(0, 500) };
    case "todo/write":
      return { role: "meta", text: "todos: " + (d.todos || []).map(function (t) { return t.status + ":" + t.content; }).join(" | ") };
    case "compaction/prune":
      return { role: "meta", text: "compaction prune: " + JSON.stringify(d.shadowedSeqs || d.shadowedRange || {}) };
    default:
      return null;
  }
}

export function fmtTime(ms) {
  if (!ms) return "?";
  const d = new Date(Number(ms));
  const p = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}
