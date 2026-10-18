import * as fs from "fs";
import {join} from "path";
import {PlayByPlayItem} from "../types/pbpData";

/**
 * Default: `<cwd>/data/player_ids.json` (run npm scripts from `scripts/`).
 */
export function defaultPlayerIdsPath(): string {
  return join(process.cwd(), "data", "player_ids.json");
}

/**
 * Full display name -> stable lowercase_snake_case id.
 * Persisted JSON object; reused across seasons and runs.
 */
export type PlayerIdsFile = Record<string, string>;

/** Strip a leading source ID from values like "1642345/Oso Ighodaro". */
export function normalizePlayerName(fullName: string): string {
  const name = (fullName.includes("/") ? fullName.split("/", 2)[1] : fullName).trim();
  return name.toLowerCase() === "undefined" ? "" : name;
}

/**
 * Slugify a full name: "Austin Reaves" -> "austin_reeves".
 * Non-alphanumeric runs become single underscores; trimmed.
 */
export function slugifyPlayerName(fullName: string): string {
  const s = normalizePlayerName(fullName)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return s || "player";
}

export class PlayerIdRegistry {
  /** Full name (as in PBP) -> assigned id */
  private readonly nameToId = new Map<string, string>();
  private readonly usedIds = new Set<string>();

  /** Load from disk; no-op if file missing. */
  load(filePath: string): void {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.trim()) return;
    const data = JSON.parse(raw) as PlayerIdsFile;
    for (const [name, id] of Object.entries(data)) {
      if (typeof name !== "string" || typeof id !== "string") continue;
      const normalized = normalizePlayerName(name);
      if (!normalized) continue;
      this.nameToId.set(normalized, id);
      this.usedIds.add(id);
    }
  }

  /** Write current map (sorted keys for stable diffs). */
  save(filePath: string): void {
    const sorted: PlayerIdsFile = {};
    for (const name of [...this.nameToId.keys()].sort((a, b) => a.localeCompare(b))) {
      sorted[name] = this.nameToId.get(name)!;
    }
    fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2), "utf-8");
  }

  /**
   * Return stable id for this exact full name; allocate base slug or base+number if taken.
   */
  ensureId(fullName: string): string {
    const trimmed = normalizePlayerName(fullName);
    if (!trimmed) return "";

    const existing = this.nameToId.get(trimmed);
    if (existing !== undefined) return existing;

    const base = slugifyPlayerName(trimmed);
    let n = 0;
    let candidate = base;
    while (this.usedIds.has(candidate)) {
      n++;
      candidate = `${base}${n}`;
    }

    this.nameToId.set(trimmed, candidate);
    this.usedIds.add(candidate);
    return candidate;
  }

  /** Resolve display name for an id (for PROFILE rows). */
  getDisplayName(id: string): string | undefined {
    for (const [name, pid] of this.nameToId) {
      if (pid === id) return name;
    }
    return undefined;
  }

  /** Number of registered full-name → id mappings. */
  get size(): number {
    return this.nameToId.size;
  }
}

/** PBP fields that carry a person name (not team codes or scores). */
const PBP_PLAYER_NAME_FIELDS: (keyof PlayByPlayItem)[] = [
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "assist",
  "block",
  "steal",
  "player",
  "opponent",
  "entered",
  "left",
  "away",
  "home",
  "possession",
];

/**
 * Register every non-empty player name found in play-by-play rows.
 * Does not touch `team` (abbreviation).
 */
export function registerPlayerNamesFromPbpItems(
  items: PlayByPlayItem[],
  registry: PlayerIdRegistry,
): void {
  for (const item of items) {
    for (const key of PBP_PLAYER_NAME_FIELDS) {
      const v = item[key];
      if (typeof v !== "string") continue;
      const t = normalizePlayerName(v);
      if (!t) continue;
      registry.ensureId(t);
    }
  }
}
