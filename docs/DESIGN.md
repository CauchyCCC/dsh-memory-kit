# Design notes

## Goals

- Let an agent **recover exact wording** from past sessions after a new session or a compaction.
- Keep an **auditable** record of what happened, without a database server.
- Stay **portable**: plain files + a single SQLite file, no plugin required.
- Keep runtime data out of version control.

## Non-goals

- Replacing the model's context window.
- Automatic injection into a live session (needs a plugin; see Limitations).
- Vector search. Keyword/BM25 is enough for recall and far easier to audit.

## Layers

| Layer | Content | Lifetime |
| --- | --- | --- |
| L0 | index / map / hot topics | rewritten by scripts |
| L1 | stable facts | append-only, supersede |
| L2 | episodic events by source+date | append-only |
| L3 | superseded / expired entries | kept forever |

The layers reduce context cost: read L0 first, then only the layer you need.

## Write policy

Write only what would save a future session from asking again or repeating a mistake.
Every fact carries `date | source | status`. Updates are **append + supersede**, never
in-place edits and never deletion.

## Retrieval

- FTS5 table `recall(tokens, text, session, seq, ts, role)`.
- Chinese text is split into single CJK characters before indexing, so 2-character
  queries match. Latin words are indexed as words.
- Queries are normalized the same way and joined with `AND`, ranked by `bm25`.

## Audit

Session events are compiled into one line per action:
`time | channel | session | turn | USER/AI/TOOL/DELIVERED/APPROVAL/COMPACTION`.
The channel is inferred from `source.rpcId` (`weixin-` prefix = IM).

## Topics

A single table gives Redis-ZSET-like behavior:

```sql
topics(topic TEXT PRIMARY KEY, score REAL, hits INTEGER, sessions INTEGER,
       first_seen INTEGER, last_seen INTEGER, expire_at INTEGER, refs TEXT)
```

- `ZINCRBY` -> `score = score + weight` (user speech weighs more)
- `ZREVRANGE` -> `ORDER BY score DESC LIMIT n`
- `ZEXPIRE` -> per-topic `expire_at`, refreshed on every hit
- `refs` -> bounded list of event pointers (session / seq / time)

To keep quality high, a topic must appear in at least two sessions and in no more than
a small fraction of all records (filters transactional noise). A model can replace the
n-gram extraction by writing `topics-model.json`; those topics are inserted with a high
score and shown first.

## Consolidation (dream)

A daily task reads recent events and appends 3-5 facts to L1, supersedes stale facts,
and refreshes topics. This is the step that turns "records" into "memory".

## Compaction snapshot

DSH emits `compaction/start|prune|summary|end`. The watcher writes
`reinject/<session>.md` and `reinject/latest.md` with L1 facts, top topics, and the
session's recent audit lines. AGENTS.md tells the agent to read the snapshot after a
compaction.

## Budget and size

Instruction files injected into the prompt share a byte budget in DSH. Keep L0 thin and
put details in files that are read on demand. `check-size.mjs` guards the memory dir
against a configured limit.

## Failure modes

- stale facts -> supersede + date
- entity drift -> one topic per thing, merge
- index bloat -> minimum hits + document-frequency ceiling
- contradiction -> only active facts are shown
- context dilution -> snapshot is intentionally small
