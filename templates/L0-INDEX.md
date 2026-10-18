# L0 · Memory index

> **Entry point.** Read this first in every new session, then follow the "read when" column.
> Keep this file short: it is the map, not the territory.

## Layout

| Path | What | Read when |
| --- | --- | --- |
| `L0-INDEX.md` | This file | first |
| `L1-FACTS.md` | Stable facts (people / environment / projects) | you need context about a person, machine, or project |
| `L2-EVENTS/` | Episodic log, split by source (`web-YYYY-MM-DD.md` / `im-YYYY-MM-DD.md`) | "what happened on day X" |
| `AUDIT.log` | Compact action timeline (web/im tagged) | "what have I been doing lately" |
| `db/memory.db` | Recall FTS5 index + topics (ZSET-like) | used by scripts |
| `reinject/latest.md` | Snapshot generated after a compaction | if the context was compacted |
| `L3-ARCHIVE/` | Superseded / expired entries (kept) | "why was the old conclusion dropped" |

## Commands

`@bash
node tools/recall-query.mjs "keyword" --limit 10
node tools/recall-index.mjs
node tools/audit-compile.mjs
node tools/topics.mjs build
node tools/check-size.mjs
`@

## Hot topics

> Model-extracted topics are preferred (topics-model.json); n-gram extraction is the fallback.

<!-- TOPICS:BEGIN -->
(no topics yet - run tools/topics.mjs build)
<!-- TOPICS:END -->
