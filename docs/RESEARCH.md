# Prior art

This kit borrows ideas from several public projects; none of their code is vendored.

## Structured documentation memory

- **Cline Memory Bank** - a fixed set of markdown files (project brief, active context,
  progress) that the agent must read at the start of every task.
  <https://docs.cline.bot/best-practices/memory-bank>
- **AGENTS.md** - an open format for guiding coding agents.
  <https://agents.md/>

## Retrieval and reflection

- **Generative Agents** (Park et al., 2023) - observation stream + retrieval scored by
  recency, relevance and importance, plus reflection.
  <https://arxiv.org/abs/2304.03442>

## Consolidation

- **The Consolidation Problem in Agent Memory** (Hindsight) - four levers: importance,
  merge, decay, eviction; "an agent that remembers everything remembers nothing useful".
  <https://github.com/vectorize-io/hindsight>

## Production memory systems

- **Mem0** - extraction / consolidation / retrieval; graph variant.
  <https://arxiv.org/abs/2504.19413>
- **Letta** - stateful agents, memory blocks, sleep-time compute.
  <https://docs.letta.com/>
- **dsh-meow-memory** - a DSH memory plugin (SQLite, layered memory, injection).
  <https://github.com/Phant0meow/dsh-meow-memory>

## Evaluation

- **LongMemEval** (ICLR 2025) - five abilities: extraction, multi-session reasoning,
  temporal reasoning, knowledge updates, abstention; design split into indexing,
  retrieval, reading.
  <https://proceedings.iclr.cc/paper_files/paper/2025/hash/d813d324dbf0598bbdc9c8e79740ed01-Abstract-Conference.html>

## What this kit takes

- layered, on-demand context (Memory Bank);
- BM25-style keyword retrieval instead of vectors (simpler, auditable);
- append + supersede updates (consolidation literature);
- importance filtering at write time (dream prompt);
- a snapshot for compaction (practical counterpart of "reinjection").

## What it deliberately skips

- automatic injection (requires a DSH plugin);
- embeddings / vector databases;
- background services other than scheduled scripts.
