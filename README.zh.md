# dsh-memory-kit

[English](README.md) | 中文

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）用的**跨会话记忆工具包**：
纯文件 + `node:sqlite` + 定时脚本，**不需要装插件**。

DSH 把每个会话保存成只追加的 **zstd 多帧**日志。这个工具包把那些日志整理成一个小而可审计的记忆层：

- **逐字回溯（recall）**：把历史会话里的 user / assistant / tool 消息全文索引进 FTS5，
  压缩之后或在新会话里，也能把当时的原话捞回来；
- **审计流 `AUDIT.log`**：把会话事件编译成一行一条的时间线
  （`USER` / `AI` / `TOOL` / `APPROVAL` / `COMPACTION`），标 `web` 或 `im` 来源；
- **情景日志 `L2-EVENTS/`**：按来源和日期分文件；
- **热度话题**：用 SQLite 复刻 Redis ZSET（score / 独立 expire / refs 指向事件），
  也支持换成模型提炼的话题；
- **dream 巩固**：每天把事件提炼成稳定事实；
- **压缩快照**：会话被压缩时生成一份最小上下文快照。

## 截图

![逐字回溯](docs/assets/recall.png)
![热话题](docs/assets/topics.png)

> 示例输出，数字来自演示数据。

## 要求

- DSH **0.2.x**（事件结构按这个版本写的；新旧版本可能有差异）
- **Node.js >= 22.19**（`node:sqlite` + zstd）
- Windows（提供的 `.ps1` 是 Windows 脚本；`.mjs` 工具本身跨平台）

## 快速开始

```bash
git clone https://github.com/CauchyCCC/dsh-memory-kit.git dsh-memory-kit
cd dsh-memory-kit
cp config.example.json config.json   # 改成你的三个路径
node tools/recall-index.mjs          # 索引全部 DSH 会话
node tools/recall-query.mjs "关键词" --limit 10
```

把 `templates/` 里的文件复制到记忆目录（默认 `<workspace>/memory`）：

```bash
mkdir -p memory/L2-EVENTS memory/L3-ARCHIVE memory/db
cp templates/L0-INDEX.md memory/
cp templates/L1-FACTS.md memory/
cp templates/L3-ARCHIVE/README.md memory/L3-ARCHIVE/
cp templates/topics-model.json memory/
```

然后：

```bash
node tools/audit-compile.mjs      # 生成 AUDIT.log + L2-EVENTS
node tools/topics.mjs build       # 热话题，并回写 L0 的话题段
node tools/check-size.mjs         # 体积检查
```

Windows 下的定时（可选）：

```powershell
# 手动跑一遍整条流水线
powershell -ExecutionPolicy Bypass -File tools\memory-tick.ps1
# 注册每 30 分钟一次的计划任务（会自动提权）
powershell -ExecutionPolicy Bypass -File tools\setup-memory-task.ps1
```

## 配置

`config.mjs` 的解析顺序：环境变量 > `config.json` > 默认值。

| 键 | 环境变量 | 默认 |
| --- | --- | --- |
| `workspace` | `DSH_MEMORY_WORKSPACE` | 当前目录 |
| `memoryDir` | `DSH_MEMORY_HOME` | `<workspace>/memory` |
| `sessionsRoot` | `DSH_SESSIONS_ROOT` | `~/.dsh/sessions` |

`memory-tick.ps1` 还认 `DSH_MEMORY_NODE`（指定 node 可执行文件）。

## 目录结构

```text
config.json              # 你本机的路径（已在 .gitignore 里）
config.mjs               # 路径解析
tools/
  lib.mjs                # zstd 多帧解码、事件提取、中文分词
  recall-index.mjs       # 会话 -> FTS5 索引（按 max seq + mtime 增量）
  recall-query.mjs       # 查询索引，打印逐字命中
  audit-compile.mjs      # 会话 -> AUDIT.log + L2-EVENTS/<channel>-<date>.md
  topics.mjs             # 类 ZSET 话题 + 模型话题 + L0 话题段
  compaction-watch.mjs   # 压缩 -> reinject/<session>.md + latest.md
  check-size.mjs         # 体积检查
  memory-tick.ps1        # 流水线一键跑
  setup-memory-task.ps1  # 注册计划任务
  dream-prompt.md        # 每日巩固用的 prompt
templates/               # L0 / L1 / L3 / topics-model
```

## 工作原理

1. **解码**：一个 DSH 会话由很多 zstd 帧组成。工具扫描帧头
   （`0x28 0xB5 0x2F 0xFD`）逐帧解，因为 Node 自带的 zstd 助手解完第一帧就停下。
2. **提取**：`user/message`、`assistant/message`、`tool/call`、`tool/result`、
   标题、todo、审批、压缩标记。
3. **索引**：FTS5，把中文逐字切成单字 token，所以两个字的查询也能命中；用 `bm25` 排序。
4. **审计**：一行一个动作的紧凑时间线，`web` / `im` 由 `source.rpcId`
   （`weixin-` 前缀 = IM）推断。
5. **话题**：`topics(topic, score, hits, expire_at, refs)` 表提供
   ZINCRBY / ZREVRANGE / ZEXPIRE 语义；模型可以通过 `topics-model.json` 替换。
6. **巩固**：dream prompt 读近期事件，把事实追加进 `L1-FACTS.md`，
   标旧条目为 superseded，并刷新话题。

## 隐私

**不要提交** `memory/`、`db/`、`AUDIT.log`、`L2-EVENTS/`、`reinject/`、`backups/`、
`config.json`：里面是你的对话和本机路径。`.gitignore` 已经排除这些。

## 限制

- 事件结构绑定 DSH 0.2.x；DSH 改事件类型后要动解析器。
- PowerShell 脚本只面向 Windows；`.mjs` 流水线是可移植的。
- **没有插件就无法真正自动注入**：压缩后靠 `AGENTS.md` 的约定去读 `reinject/latest.md`；
  想全自动需要写一个订阅 `compaction/*` 的插件。
- 没有模型话题时，中文 n-gram 会有一些泛词；模型话题文件才是质量路线。

## 常见问题

中文 FAQ 见 [docs/FAQ.zh.md](docs/FAQ.zh.md)。

## 许可证

MIT
