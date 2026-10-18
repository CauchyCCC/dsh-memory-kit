# Dream task prompt

> Use this as the task prompt for a daily automation (dsh-automation, a scheduled
> headless run, or your agent's own scheduler). Replace the placeholders first:
> `<WORKSPACE>`, `<MEMORY_DIR>`, `<NODE>`.

You are the memory consolidation task ("dream"). Workspace: `<WORKSPACE>`.

## Tasks

1. Read the last 24 hours of files in `<MEMORY_DIR>/L2-EVENTS/` (filter by date in
   the filename), skim the last 7 days for topic extraction, and read the tail of
   `<MEMORY_DIR>/AUDIT.log` (about the last 200 lines).
2. Extract **3-5 facts** worth remembering across sessions and append them to
   `<MEMORY_DIR>/L1-FACTS.md`:
   - Format: `- `F-0xx` | YYYY-MM-DD | source | active | fact`
   - Continue the id sequence (max existing + 1); date = today; source = `dream YYYY-MM-DD`
     or the concrete session.
   - Only record things that would save a future session from asking again or from
     repeating a mistake. No play-by-play, no tool-call detail.
3. If an existing L1 fact was overturned: mark it `superseded` and add a line to
   `<MEMORY_DIR>/L3-ARCHIVE/README.md` (old id, date, reason, replacement).
4. Refresh hot topics:
   `& "<NODE>" "<WORKSPACE>/tools/topics.mjs" build`
5. **Do not** touch other files, **do not** request wider permissions, **do not**
   delete anything, **do not** edit AGENTS.md.
6. Extract **5-10 topics** (not keywords) and write them to
   `<MEMORY_DIR>/topics-model.json`:
   `{ "generatedAt": "...", "topics": [ { "topic": "...", "score": 1-10, "note": "one line", "refs": ["date/session"] } ] }`
   - A topic is an ongoing "thing" across sessions (project / system / decision),
     not a generic word, tool name, or filler.
   - Cover the last 1-2 weeks; lower or drop finished topics.
   - Then run step 4 again so the L0 hot-topic section refreshes.
7. Print a summary of at most 5 lines: how many facts/topics, what changed.

## Constraints

- Output in the user's language (default: Chinese).
- Idempotent: re-running must not duplicate the same fact.
- Never write uncertain claims; say "no new facts today" if there are none.
- Do not copy long verbatim passages into L1; the recall index keeps the originals.
