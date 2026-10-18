# dsh-memory-kit

English | [中文](README.zh.md)

Cross-session memory for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH),
built from **plain files + `node:sqlite` + scheduled scripts**. No plugin required.

DSH keeps every session as an append-only **zstd multi-frame** log. This kit mines those
logs into a small, auditable memory layer:

- **verbatim recall** - full-text index over past user/assistant/tool messages, so the agent can
  pull the exact wording back after a compaction or in a new session;
- **audit timeline** - session events compiled into a compact `AUDIT.log`
  (`USER` / `AI` / `TOOL` / `APPROVAL` / `COMPACTION`), tagged `web` or `im`;
- **episodic log** - `L2-EVENTS/` split by source and date;
- **hot topics** - SQLite emulation of a Redis ZSET (score / per-topic expiry / event refs),
  optionally replaced by model-extracted topics;
- **dream** - a daily consolidation prompt that turns events into stable facts;
- **compaction snapshot** - a minimal-context snapshot written when a session is compacted.

## Screenshots

![verbatim recall](docs/assets/recall.png)
![hot topics](docs/assets/topics.png)

> Illustrative output from a small demo dataset.

## Requirements

- DSH **0.2.x** (event schema used here; older/newer versions may differ)
- **Node.js >= 22.19** (for `node:sqlite` and zstd)
- Windows for the provided `.ps1` helpers (the `.mjs` tools themselves are cross-platform)

## Quick start

```bash
git clone https://github.com/CauchyCCC/dsh-memory-kit.git dsh-memory-kit
cd dsh-memory-kit
cp config.example.json config.json   # then edit the three paths
node tools/recall-index.mjs          # index all DSH sessions
node tools/recall-query.mjs "keyword" --limit 10
```

Copy the `templates/` files into your memory dir (default `<workspace>/memory`):

```bash
mkdir -p memory/L2-EVENTS memory/L3-ARCHIVE memory/db
cp templates/L0-INDEX.md memory/
cp templates/L1-FACTS.md memory/
cp templates/L3-ARCHIVE/README.md memory/L3-ARCHIVE/
cp templates/topics-model.json memory/
```

Then:

```bash
node tools/audit-compile.mjs      # build AUDIT.log + L2-EVENTS
node tools/topics.mjs build       # hot topics + writes the L0 topic section
node tools/check-size.mjs         # size guard
```

Optional scheduling on Windows:

```powershell
# run the whole pipeline once
powershell -ExecutionPolicy Bypass -File tools\memory-tick.ps1
# register it every 30 minutes (self-elevates)
powershell -ExecutionPolicy Bypass -File tools\setup-memory-task.ps1
```

## Configuration

`config.mjs` resolves, in order: environment variables, then `config.json`, then defaults.

| Key | Env | Default |
| --- | --- | --- |
| `workspace` | `DSH_MEMORY_WORKSPACE` | current working directory |
| `memoryDir` | `DSH_MEMORY_HOME` | `<workspace>/memory` |
| `sessionsRoot` | `DSH_SESSIONS_ROOT` | `~/.dsh/sessions` |

`memory-tick.ps1` also honors `DSH_MEMORY_NODE` for the node executable.

## Layout

```text
config.json              # your local paths (gitignored)
config.mjs               # path resolution
tools/
  lib.mjs                # zstd multi-frame decode, event extraction, CJK tokenization
  recall-index.mjs       # sessions -> FTS5 index (incremental by max seq + mtime)
  recall-query.mjs       # query the index, print verbatim hits
  audit-compile.mjs      # sessions -> AUDIT.log + L2-EVENTS/<channel>-<date>.md
  topics.mjs             # ZSET-like topics + model topics + L0 topic section
  compaction-watch.mjs   # compaction -> reinject/<session>.md + latest.md
  check-size.mjs         # size guard
  memory-tick.ps1        # pipeline runner
  setup-memory-task.ps1  # Task Scheduler registration
  dream-prompt.md        # daily consolidation prompt
templates/               # L0 / L1 / L3 / topics-model
```

## How it works

1. **Decode**: a DSH session is many zstd frames. The kit scans for the frame magic
   (`0x28 0xB5 0x2F 0xFD`) and decodes each frame separately, because Node's zstd helper
   stops after the first frame.
2. **Extract**: `user/message`, `assistant/message`, `tool/call`, `tool/result`,
   titles, todos, approvals, compaction markers.
3. **Index**: FTS5 with CJK characters split into single tokens, so 2-character Chinese
   queries work; `bm25` ranking.
4. **Audit**: a compact one-line-per-action timeline, with `web`/`im` inferred from
   `source.rpcId` (`weixin-` prefix = IM).
5. **Topics**: `topics(topic, score, hits, expire_at, refs)` gives ZINCRBY / ZREVRANGE /
   ZEXPIRE semantics. A model can replace them via `topics-model.json`.
6. **Consolidate**: the dream prompt reads recent events, appends facts to `L1-FACTS.md`,
   supersedes stale ones, and refreshes topics.

## Privacy

Never commit `memory/`, `db/`, `AUDIT.log`, `L2-EVENTS/`, `reinject/`, `backups/`,
or `config.json`: they contain your conversations and paths. The provided `.gitignore`
already excludes them.

## Limitations

- The event schema is tied to DSH 0.2.x; check the parser if DSH changes event types.
- The PowerShell helpers are Windows-only; the `.mjs` pipeline is portable.
- **No automatic context injection without a plugin.** After a compaction the agent is told
  (via AGENTS.md) to read `reinject/latest.md`; a plugin that subscribes to `compaction/*`
  would make this fully automatic.
- Without model topics, Chinese n-gram extraction produces some filler topics; the model
  topics file is the quality path.

## FAQ

Chinese FAQ: [docs/FAQ.zh.md](docs/FAQ.zh.md)

## License

MIT
