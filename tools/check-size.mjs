// check-size.mjs - guard the memory directory against its size limit.
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { MINE_DIR } from "./lib.mjs";

async function dirSize(dir) {
  let total = 0;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(p);
    else { try { total += (await stat(p)).size; } catch {} }
  }
  return total;
}

const WARN = 1 * 1024 * 1024 * 1024;
const CRIT = 5 * 1024 * 1024 * 1024;
const bytes = await dirSize(MINE_DIR);
console.log("memory dir size: " + (bytes / 1048576).toFixed(2) + " MB  (warn " + (WARN / 1048576) + " MB, critical " + (CRIT / 1048576) + " MB)");
if (bytes >= CRIT) { console.log("[FAIL] over critical threshold"); process.exit(3); }
if (bytes >= WARN) { console.log("[WARN] over warning threshold"); process.exit(2); }
console.log("[OK] well under the 20 GB budget");
