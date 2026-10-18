"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerIdRegistry = void 0;
exports.defaultPlayerIdsPath = defaultPlayerIdsPath;
exports.normalizePlayerName = normalizePlayerName;
exports.playerNameKey = playerNameKey;
exports.slugifyPlayerName = slugifyPlayerName;
exports.findPlayerIdConflicts = findPlayerIdConflicts;
exports.registerPlayerNamesFromPbpItems = registerPlayerNamesFromPbpItems;
const fs = __importStar(require("fs"));
const path_1 = require("path");
/**
 * Default: `<cwd>/data/player_ids.json` (run npm scripts from `scripts/`).
 */
function defaultPlayerIdsPath() {
    return (0, path_1.join)(process.cwd(), "data", "player_ids.json");
}
/** Strip a leading source ID from values like "1642345/Oso Ighodaro". */
function normalizePlayerName(fullName) {
    const name = (fullName.includes("/") ? fullName.split("/", 2)[1] : fullName).trim().replace(/\s+/g, " ");
    return name.toLowerCase() === "undefined" ? "" : name;
}
/** Matching key only: keep the original spelling separately for display and saved aliases. */
function playerNameKey(fullName) {
    return normalizePlayerName(fullName).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}
/** Slugify the accent-insensitive matching key without dropping accented letters. */
function slugifyPlayerName(fullName) {
    return playerNameKey(fullName)
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_") || "player";
}
function findPlayerIdConflicts(data) {
    const groups = new Map();
    for (const [name, id] of Object.entries(data)) {
        if (typeof id !== "string")
            continue;
        const key = playerNameKey(name);
        if (!key)
            continue;
        const aliases = groups.get(key) ?? [];
        aliases.push({ name, id });
        groups.set(key, aliases);
    }
    return [...groups].filter(([, aliases]) => new Set(aliases.map(alias => alias.id)).size > 1)
        .map(([key, aliases]) => ({ key, aliases }));
}
class PlayerIdRegistry {
    /** Full name (as in PBP) -> assigned id */
    nameToId = new Map();
    keyToId = new Map();
    usedIds = new Set();
    /** Load from disk; no-op if file missing. */
    load(filePath) {
        if (!fs.existsSync(filePath))
            return;
        const raw = fs.readFileSync(filePath, "utf-8");
        if (!raw.trim())
            return;
        const data = JSON.parse(raw);
        const conflicts = findPlayerIdConflicts(data);
        if (conflicts.length) {
            throw new Error(`Player ID aliases conflict in ${filePath}; review before merging: ${JSON.stringify(conflicts)}`);
        }
        // Validate against any entries already loaded before mutating this registry.
        for (const [name, id] of Object.entries(data)) {
            if (typeof id !== "string")
                continue;
            const existing = this.keyToId.get(playerNameKey(name));
            if (existing !== undefined && existing !== id)
                throw new Error(`Conflicting existing player ID for ${name}: ${existing} / ${id}`);
        }
        for (const [name, id] of Object.entries(data)) {
            if (typeof name !== "string" || typeof id !== "string")
                continue;
            const normalized = normalizePlayerName(name);
            if (!normalized)
                continue;
            this.nameToId.set(normalized, id);
            this.keyToId.set(playerNameKey(normalized), id);
            this.usedIds.add(id);
        }
    }
    /** Write current map (sorted keys for stable diffs). */
    save(filePath) {
        const sorted = {};
        for (const name of [...this.nameToId.keys()].sort((a, b) => a.localeCompare(b))) {
            sorted[name] = this.nameToId.get(name);
        }
        fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2), "utf-8");
    }
    /**
     * Return the stable id across accents, case and whitespace; allocate base slug or base+number if taken.
     */
    ensureId(fullName) {
        const trimmed = normalizePlayerName(fullName);
        if (!trimmed)
            return "";
        const key = playerNameKey(trimmed);
        const existing = this.keyToId.get(key);
        if (existing !== undefined) {
            this.nameToId.set(trimmed, existing);
            return existing;
        }
        const base = slugifyPlayerName(trimmed);
        let n = 0;
        let candidate = base;
        while (this.usedIds.has(candidate)) {
            n++;
            candidate = `${base}${n}`;
        }
        this.nameToId.set(trimmed, candidate);
        this.keyToId.set(key, candidate);
        this.usedIds.add(candidate);
        return candidate;
    }
    /** Resolve display name for an id (for PROFILE rows). */
    getDisplayName(id) {
        for (const [name, pid] of this.nameToId) {
            if (pid === id)
                return name;
        }
        return undefined;
    }
    /** Number of registered full-name → id mappings. */
    get size() {
        return this.nameToId.size;
    }
}
exports.PlayerIdRegistry = PlayerIdRegistry;
/** PBP fields that carry a person name (not team codes or scores). */
const PBP_PLAYER_NAME_FIELDS = [
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
function registerPlayerNamesFromPbpItems(items, registry) {
    for (const item of items) {
        for (const key of PBP_PLAYER_NAME_FIELDS) {
            const v = item[key];
            if (typeof v !== "string")
                continue;
            const t = normalizePlayerName(v);
            if (!t)
                continue;
            registry.ensureId(t);
        }
    }
}
