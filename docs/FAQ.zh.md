# 中文 FAQ

## 安装与配置

### 1. 我需要装插件吗？

不需要。`dsh-memory-kit` 是"纯脚本 + 计划任务 + AGENTS.md 协议"。
代价是**压缩后的重注入不是全自动的**：靠协议让 Agent 去读快照（见第 9 条）。

### 2. 最少要配什么？

1. 复制 `config.example.json` 为 `config.json`；
2. 填三个路径：`workspace`、`memoryDir`、`sessionsRoot`；
3. 跑 `node tools/recall-index.mjs`。

三个路径也都能用环境变量覆盖（见 README 的配置表）。

### 3. 数据存在哪？

默认在 `<workspace>/memory/`：`db/memory.db`（索引 + 话题）、`AUDIT.log`、
`L2-EVENTS/`、`reinject/`、`logs/`。全部是本地文件，没有服务端。

### 4. 支持 Linux / macOS 吗？

`.mjs` 工具本身跨平台；`.ps1` 辅助脚本是 Windows 专用。Linux 下把
`memory-tick.ps1` 换成等价的 shell 脚本即可（核心逻辑都在 `tools/*.mjs`）。

## 使用

### 5. 为什么搜不到某句话？

按顺序排查：

1. 那句话在索引之后才产生 → 重新跑 `recall-index.mjs`（它按 `maxSeq` 增量）；
2. 那句话在 `tool/result` 里且超过 4000 字符 → 会被截断；
3. 会话文件是**多帧 zstd**，如果某帧损坏会被跳过；
4. 查询词太短/太长 → 中文是逐字切分，2 个字就能搜，但纯符号查不到。

### 6. 为什么中文按"字"切分？

FTS5 的 `unicode61` 会把一整段中文当成一个 token，导致 2 字查询失效。
所以索引和查询前都把 CJK 字符拆成单字，再用 `AND` 组合。代价是可能召回偏多，
用 `bm25` 排序和 `--limit` 控制即可。

### 7. 话题里为什么有 "txt"、"你的" 这种词？

那是 n-gram 兜底模式的噪音。V2.3 起支持**模型话题**：把 `topics-model.json`
写好（或让 dream 每天生成），模型话题会以高分排在最前，n-gram 退到后面。
没有模型话题时，可以调 `topics.mjs` 里的 `STOP` 和阈值。

### 8. AUDIT.log 和 L2-EVENTS 有什么区别？

- `AUDIT.log`：**全量**时间线，一行一个动作，适合 grep / 看近况；
- `L2-EVENTS/<channel>-<date>.md`：**按来源和日期**分文件，只收高价值事件
  （USER / DELIVERED / APPROVAL / COMPACTION），适合人读。

### 9. 压缩后 Agent 会失忆吗？

DSH 压缩会甩掉对话历史细节。本工具在 `compaction-watch.mjs` 检测到压缩事件时，
生成 `reinject/latest.md`（L1 事实 + 热话题 + 该会话 AUDIT 尾部），
并在 AGENTS.md 里约定"压缩后先读它"。**真正自动注入**需要写插件订阅
`compaction/*`，本项目暂不提供。

### 10. 多个工作区怎么办？

`listSessionFiles` 会扫描 `sessionsRoot` 下所有 `--*--` 工作区目录，
默认全部索引。只想索引一个工作区时，把 `sessionsRoot` 指到那个目录。

### 11. 会无限增长吗？

会缓慢增长。`check-size.mjs` 有 1 GB 警告 / 5 GB 红线；`topics build` 末尾会
`VACUUM` 回收空间；`L3-ARCHIVE` 只归档不删除。需要控制体积时，定期清理
`backups/` 和旧 `logs/`。

### 12. 怎么备份 / 迁移？

整个 `memory/` 目录（含 `db/memory.db`）复制走即可；换机器后改 `config.json`
的路径。`AUDIT.log` 和 `L2-EVENTS` 是纯文本，也可以单独归档。

### 13. 怎么删除某条记忆？

本项目**不自动删除**。手工做法：把 `L1-FACTS.md` 里那条移到 `L3-ARCHIVE/`，
并注明原因；索引里的原文仍在 `db` 里，需要彻底删除时重建索引（删 `memory.db` 后重跑）。

## 调度与自动化

### 14. `memory-tick.ps1` 多久跑一次？

默认每 30 分钟（`setup-memory-task.ps1` 注册的计划任务）。它做四件事：
索引增量、编译 AUDIT、生成压缩快照、刷新话题、体积检查。增量靠 `maxSeq + mtime`
跳过没变的会话，通常一两秒。

### 15. dream 用什么跑？

三种都行：

1. `dsh-automation` 插件（每天定时，独立 Session）；
2. `dsh --profile headless` + 计划任务；
3. 你自己的调度器。

prompt 见 `tools/dream-prompt.md`，记得替换 `<WORKSPACE>` / `<MEMORY_DIR>` / `<NODE>`。

### 16. dream 会不会乱写？

prompt 里有"只记下次会少问/少踩的事""不确定不写""幂等"约束；建议第一次跑前备份
`L1-FACTS.md`。发现误判就手工标 `superseded`，并把约束补进 prompt。

## 隐私与安全

### 17. 会把我的对话传到网上吗？

不会。所有处理都在本地：读 `~/.dsh/sessions`、写 `memory/`。项目本身不联网。

### 18. 提交到 GitHub 要注意什么？

**.gitignore 已排除** `memory/`、`db/`、`AUDIT.log`、`L2-EVENTS/`、`reinject/`、
`backups/`、`logs/`、`config.json`。**不要**把真实数据强行 `git add -f` 进去。

### 19. `config.json` 里有敏感路径吗？

有本机用户名，所以它在 .gitignore 里；分享时只给 `config.example.json`。

## 兼容性

### 20. DSH 升级后坏了怎么办？

事件结构绑定 DSH **0.2.x**。升级后先跑 `recall-index.mjs` 看是否有解析错误；
新增事件类型会在 `extractIndexable` 里被忽略（不会崩），但要索引它们需要补 case。

### 21. Node 版本要求？

**>= 22.19**（`node:sqlite` + zstd 多帧）。低版本会直接报模块不存在。
