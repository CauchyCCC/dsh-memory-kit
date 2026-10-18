// config.mjs - central path configuration for dsh-memory-kit.
// Resolution order: environment variables > config.json > sensible defaults.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = process.env.DSH_MEMORY_CONFIG || path.join(HERE, "config.json");
let cfg = {};
try { cfg = JSON.parse(readFileSync(CONFIG_FILE, "utf8")); } catch {}

export const WORKSPACE = path.resolve(
  cfg.workspace || process.env.DSH_MEMORY_WORKSPACE || process.cwd()
);
export const MINE_DIR = path.resolve(
  cfg.memoryDir || process.env.DSH_MEMORY_HOME || path.join(WORKSPACE, "memory")
);
export const DB_DIR = path.join(MINE_DIR, "db");
export const DB_PATH = path.join(DB_DIR, "memory.db");
export const AUDIT_PATH = path.join(MINE_DIR, "AUDIT.log");
export const SESSIONS_ROOT = path.resolve(
  cfg.sessionsRoot || process.env.DSH_SESSIONS_ROOT || path.join(os.homedir(), ".dsh", "sessions")
);
