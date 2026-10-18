// topics.mjs - emergent hot topics over the recall index.
// Redis ZSET semantics emulated on node:sqlite:
//   ZINCRBY  -> score = score + weight
//   ZREVRANGE-> ORDER BY score DESC LIMIT n (expired and "transactional" rows filtered out)
//   ZEXPIRE  -> per-topic expire_at, refreshed on every hit
//   refs     -> bounded event pointers (session/seq/ts) for association
//
// Signal policy (learned from the first run, which surfaced 288k topics made of
// tool-argument field names): only human/assistant prose is mined; tool call and
// tool result payloads are skipped; user words weigh 3x; topics must appear in at
// least 2 records; and a topic present in >15% of all records is treated as
// transactional noise and hidden from the top list.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { MINE_DIR, DB_PATH, fmtTime } from "./lib.mjs";
import path from "node:path";

const L0 = path.join(MINE_DIR, "L0-INDEX.md");
const TTL_MS = 14 * 24 * 3600 * 1000;
const REFS_MAX = 5;
const MIN_HITS = 5;
const MAX_DOC_RATIO = 0.08;

const STOP = new Set(("" +
"的 了 是 在 我 你 他 她 它 这 那 我们 你们 他们 一个 什么 怎么 可以 这个 那个 现在 已经 就是 还是 因为 所以 但是 如果 然后 而且 或者 没有 不是 一下 这样 那样 时候 问题 需要 使用 进行 以及 关于 对于 通过 一些 这些 那些 之后 之前 同时 只是 可能 应该 必须 非常 比较 两个 三个 不能 不要 不会 还有 以后 以前 这里 那里 自己 大家 一起 一直 其实 当然 比如 例如 另外 于是 因此 而是 来说 而言 一般 通常 主要 相关 对应 内容 东西 事情 情况 方式 方法 地方 部分 方面 结果 影响 出现 发现 处理 完成 继续 开始 结束 等等 并且 如此 这种 那种 一切 任何 所有 每个 各种 目前 当前 本次 上面 下面 里面 外面 由于 为了 根据 按照 甚至 尤其 特别 十分 更加 有点 有些 直接 真实 完整 一条 全部 明确 一份 存在 要求 保留 判定 作区 这是 具体 确实 基本 主要 重要 关键 一定 一起 一般 通常 那是 完全 一次 这一 那 一 说明 建议 输出 运行 结构 生成 路径 确认 编号 消息 内容 方式 情况 结果 影响 使用 进行 需要 问题 系统 环境 设置 配置 版本 代码 项目 文档 信息 数据 服务 功能 参数 错误 失败 成功 默认 命令 时间 地方 状态 任务 工作 验证 目录 文件 脚本 工具 中文 具体 确实 基本 主要 重要 关键 简单 复杂 快速 系统 环境 设置 配置 版本 代码 项目 文档 信息 数据 服务 功能 参数 错误 失败 成功 默认 命令 时间 地方 状态 任务 工作 验证 目录 文件 脚本 工具 中文 一条 两条 每条 这条 那条"
+ " the a an and or but if then else for with without that this these those from have has had are was were is am be been being do does did will would shall should may might must can could not no nor only own same so than too very just don now you your yours our ours their theirs its it its he she they them we us i me my mine here there when where why how all any both each few more most other some such about into over under again further once off out up down"
+ " data type text true false null none undefined seq time role tool tools event events value item items name path file files code string number object array json http https com www dsh workspace users user tab index id uuid url uri"
+ " run_code ops_bash ops_glob ops_grep ops_inspect_local_file ops_replace ops_batch ops_result glob grep read write edit pwsh todo_write web_search web_fetch present skill job_output job_kill subagent read_image ask_user_question schedule_list create_goal load_workspace_dependencies execute command commandline description error exit stdout stderr output input new old updated update delete content arguments pattern"
+ " available access request search use run check system-reminder danger-full-access agent windows system environment version code project document information data service function parameter error failed success default config settings file path name value type text earlier runtime current context snapshot snapshots supersedes runtime-context message session sessions snippet item detail details note notes list lists result results sample samples example examples"
+ " the-class-of-classes"
).split(/\s+/).filter(function (s) { return s.length > 0; }));

// Strip injected system-reminder / runtime-context blocks that DSH attaches to
// user messages; otherwise they dominate the topic counts as fake user speech.
const INJECT = /(?:runtime-context|sandbox:policy|skill-catalog|time-context|agent-instructions|Current DSH file policy|Workspace instruction budget|Instructions removed|Instructions from:|This file changed after it was loaded|Time sampled while preparing|system-reminder)/;
function cleanText(s) {
  let t = String(s == null ? "" : s);
  t = t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, " ");
  // Anything still carrying an injection marker is synthetic context, not speech.
  if (INJECT.test(t)) return "";
  return t;
}

function extract(text) {
  const out = new Set();
  if (!text) return out;
  const en = text.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) || [];
  for (const w of en) {
    const k = w.toLowerCase();
    if (k.length < 3 || STOP.has(k)) continue;
    if (/^[0-9-]+$/.test(k)) continue;
    out.add(k);
  }
  const runs = text.match(/[\u4e00-\u9FFF]{2,}/g) || [];
  for (const run of runs) {
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= run.length; i++) {
        const g = run.slice(i, i + n);
        if (!STOP.has(g)) out.add(g);
      }
    }
  }
  return out;
}

function open() {
  const db = new DatabaseSync(DB_PATH);
  db.exec("CREATE TABLE IF NOT EXISTS topics(topic TEXT PRIMARY KEY, score REAL NOT NULL, hits INTEGER NOT NULL, first_seen INTEGER, last_seen INTEGER, expire_at INTEGER NOT NULL, refs TEXT NOT NULL DEFAULT '[]')");
  try { db.exec("ALTER TABLE topics ADD COLUMN sessions INTEGER NOT NULL DEFAULT 0"); } catch {}
  db.exec("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  return db;
}
function getMetaNum(db, key, def) {
  const r = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return r ? Number(r.value) : def;
}
function setMetaNum(db, key, val) {
  db.prepare("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, String(val));
}
function mergeRefs(oldArr, newArr) {
  const seen = new Set();
  const out = [];
  for (const r of newArr.concat(oldArr)) {
    const k = r.session + "#" + r.seq;
    if (seen.has(k)) continue;
    seen.add(k); out.push(r);
    if (out.length >= REFS_MAX) break;
  }
  return out;
}

function build() {
  const db = open();
  const now = Date.now();
  // Full rebuild every time: the mined set is only a few thousand records and
  // this keeps cross-session counts exact.
  db.exec("DELETE FROM topics");
  const rows = db.prepare("SELECT rowid, role, text, session, seq, ts FROM recall ORDER BY rowid").all();
  const agg = new Map();
  let mined = 0;
  for (const row of rows) {
    if (row.role === "tool-call" || row.role === "tool-result") continue;
    if (row.role === "meta" && !/^title:/.test(String(row.text))) continue;
    const text = cleanText(row.text);
    if (!text.trim()) continue;
    mined++;
    const weight = row.role === "user" ? 3 : 1;
    const ts = Number(row.ts) || 0;
    const ref = { session: row.session, seq: row.seq, ts: ts };
    for (const t of extract(text)) {
      let a = agg.get(t);
      if (!a) { a = { score: 0, hits: 0, lastSeen: 0, firstSeen: ts, refs: [], sessions: new Set() }; agg.set(t, a); }
      a.score += weight; a.hits += 1; a.sessions.add(row.session);
      if (ts > a.lastSeen) a.lastSeen = ts;
      if (!a.firstSeen && ts) a.firstSeen = ts;
      if (a.refs.length < REFS_MAX) a.refs.push(ref);
    }
  }
  const ins = db.prepare("INSERT INTO topics(topic,score,hits,sessions,first_seen,last_seen,expire_at,refs) VALUES(?,?,?,?,?,?,?,?)");
  let kept = 0;
  db.exec("BEGIN");
  try {
    for (const entry of agg) {
      const t = entry[0], a = entry[1];
      if (a.hits < MIN_HITS) continue;
      if (a.sessions.size < 2) continue;
      kept++;
      ins.run(t, a.score, a.hits, a.sessions.size, a.firstSeen, a.lastSeen, now + TTL_MS, JSON.stringify(a.refs));
    }
    // V2.3: model-extracted topics (higher score, shown first by writeL0/top).
    try {
      const modelPath = path.join(MINE_DIR, "topics-model.json");
      const j = JSON.parse(readFileSync(modelPath, "utf8"));
      if (j && Array.isArray(j.topics)) {
        const insM = db.prepare("INSERT INTO topics(topic,score,hits,sessions,first_seen,last_seen,expire_at,refs) VALUES(?,?,?,?,?,?,?,?)");
        for (const t of j.topics.slice(0, 20)) {
          insM.run(t.topic, 1000 + Number(t.score || 0), 20, 10, now, now, now + TTL_MS, JSON.stringify(t.refs || []));
        }
      }
    } catch {}
    setMetaNum(db, "topics_total_mined", mined);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  // The delete-and-rebuild above leaves free pages behind; reclaim them so the
  // database does not creep toward the 20 GB budget.
  try { db.exec("VACUUM"); } catch {}
  console.log("topics build: mined " + mined + " records, kept " + kept + " topics (of " + agg.size + " candidates); total topics=" + db.prepare("SELECT count(*) AS n FROM topics").get().n);
  writeL0(db);
}

function topRows(db, limit, days) {
  const now = Date.now();
  const since = days ? now - days * 24 * 3600 * 1000 : 0;
  const total = getMetaNum(db, "topics_total_mined", 1) || 1;
  const maxHits = Math.max(MIN_HITS, Math.floor(total * MAX_DOC_RATIO));
  return db.prepare("SELECT topic, score, hits, sessions, last_seen, expire_at FROM topics WHERE expire_at > ? AND hits >= ? AND hits <= ? AND sessions >= 2 AND last_seen >= ? ORDER BY score DESC, last_seen DESC LIMIT ?").all(now, MIN_HITS, maxHits, since, limit);
}
function writeL0(db) {
  let md;
  try { md = readFileSync(L0, "utf8"); } catch { return; }
  const BEGIN = "<!-- TOPICS:BEGIN -->", END = "<!-- TOPICS:END -->";
  if (md.indexOf(BEGIN) < 0 || md.indexOf(END) < 0) return;
  const rows = topRows(db, 15, 0);
  const body = rows.length
    ? rows.map(function (r, i) { return (i + 1) + ". **" + r.topic + "** - score " + Number(r.score).toFixed(0) + ", " + r.hits + " hits, last " + fmtTime(r.last_seen); }).join("\n")
    : "(no topics yet)";
  writeFileSync(L0, md.slice(0, md.indexOf(BEGIN) + BEGIN.length) + "\n" + body + "\n" + md.slice(md.indexOf(END)), "utf8");
  console.log("L0-INDEX hot topics updated (" + rows.length + " rows)");
}
function printTop(db, limit, days) {
  const rows = topRows(db, limit, days);
  if (!rows.length) { console.log("(no topics)"); return; }
  let i = 0;
  for (const r of rows) { i++;
    console.log(String(i).padStart(2) + ". " + String(r.topic).padEnd(20) + " score=" + Number(r.score).toFixed(0).padStart(7) + "  hits=" + String(r.hits).padStart(4) + "  sess=" + String(r.sessions).padStart(3) + "  last=" + fmtTime(r.last_seen));
  }
}
function printRefs(db, topic) {
  const row = db.prepare("SELECT * FROM topics WHERE topic = ?").get(topic);
  if (!row) { console.log("(no such topic: " + topic + ")"); return; }
  console.log("topic=" + row.topic + "  score=" + row.score + "  hits=" + row.hits + "  last=" + fmtTime(row.last_seen) + "  expire=" + fmtTime(row.expire_at));
  let arr = []; try { arr = JSON.parse(row.refs || "[]"); } catch {}
  const get = db.prepare("SELECT role, text FROM recall WHERE session = ? AND seq = ? LIMIT 1");
  for (const r of arr) {
    const hit = get.get(r.session, r.seq);
    const snippet = hit ? String(hit.text).replace(/\s+/g, " ").slice(0, 150) : "(text not found)";
    console.log("  " + fmtTime(r.ts) + "  " + String(r.session).slice(-8) + "#" + r.seq + "  " + (hit ? hit.role : "?") + "  " + snippet);
  }
}
function gc(db) {
  const before = Number(db.prepare("SELECT count(*) AS n FROM topics").get().n);
  db.prepare("DELETE FROM topics WHERE expire_at <= ?").run(Date.now());
  const after = Number(db.prepare("SELECT count(*) AS n FROM topics").get().n);
  console.log("topics gc: removed " + (before - after) + ", remaining " + after);
}

const cmd = (process.argv[2] || "top").toLowerCase();
const rest = process.argv.slice(3);
function opt(name, def) { const i = rest.indexOf("--" + name); return i >= 0 ? rest[i + 1] : def; }
const db = open();
if (cmd === "build") build();
else if (cmd === "top") printTop(db, Number(opt("limit", 20)), Number(opt("days", 0)));
else if (cmd === "refs") printRefs(db, rest.filter(function (a) { return a.indexOf("--") !== 0; })[0] || "");
else if (cmd === "gc") gc(db);
else if (cmd === "reset") { db.exec("DELETE FROM topics"); db.prepare("DELETE FROM meta WHERE key IN ('topics_last_rowid','topics_total_mined')").run(); console.log("topics reset"); }
else { console.log("usage: topics.mjs build | top [--limit N] [--days N] | refs <topic> | gc | reset"); }
