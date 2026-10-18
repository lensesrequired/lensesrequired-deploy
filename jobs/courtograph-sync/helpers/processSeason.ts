import * as fs from "fs";
import {writeJsonArrayPretty} from "./fileIO";
import {PlayByPlayItem} from "../types/pbpData";
import {
  GamePlayerRow,
  GameTeamRow,
  PlayerProfileRow,
  PlayerSeasonRow,
  Stats,
  TeamSeasonRow,
} from "../types/processedData";
import {defaultPlayerIdsPath, PlayerIdRegistry} from "./playerIdRegistry";
import {parseSeasonIdFromFolder, processGameFile} from "./processGameRows";

export type CustomRowType =
  | "playerSeason"
  | "teamSeason"
  | "playerProfiles"
  | "gameMetadata"
  | "gameTeams"
  | "gamePlayers"
  | "gamePlays"
  | "gamePlayerPlays";

function emptyStats(): Stats {
  return {
    fgAtt: 0,
    fgM: 0,
    "3pAtt": 0,
    "3pM": 0,
    ftAtt: 0,
    ftM: 0,
    rebounds: 0,
    reboundsOff: 0,
    reboundsDef: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    tos: 0,
    foulsAll: 0,
    foulsTech: 0,
    foulsFlag: 0,
  };
}

function addStats(a: Stats, b: Stats): Stats {
  return {
    fgAtt: a.fgAtt + b.fgAtt,
    fgM: a.fgM + b.fgM,
    "3pAtt": a["3pAtt"] + b["3pAtt"],
    "3pM": a["3pM"] + b["3pM"],
    ftAtt: a.ftAtt + b.ftAtt,
    ftM: a.ftM + b.ftM,
    rebounds: a.rebounds + b.rebounds,
    reboundsOff: a.reboundsOff + b.reboundsOff,
    reboundsDef: a.reboundsDef + b.reboundsDef,
    assists: a.assists + b.assists,
    steals: a.steals + b.steals,
    blocks: a.blocks + b.blocks,
    tos: a.tos + b.tos,
    foulsAll: a.foulsAll + b.foulsAll,
    foulsTech: a.foulsTech + b.foulsTech,
    foulsFlag: a.foulsFlag + b.foulsFlag,
  };
}

function statsFromGameTeamRow(t: GameTeamRow): Stats {
  return {
    fgAtt: t.fgAtt,
    fgM: t.fgM,
    "3pAtt": t["3pAtt"],
    "3pM": t["3pM"],
    ftAtt: t.ftAtt,
    ftM: t.ftM,
    rebounds: t.rebounds,
    reboundsOff: t.reboundsOff,
    reboundsDef: t.reboundsDef,
    assists: t.assists,
    steals: t.steals,
    blocks: t.blocks,
    tos: t.tos,
    foulsAll: t.foulsAll,
    foulsTech: t.foulsTech,
    foulsFlag: t.foulsFlag,
  };
}

function statsFromGamePlayerRow(p: GamePlayerRow): Stats {
  return {
    fgAtt: p.fgAtt,
    fgM: p.fgM,
    "3pAtt": p["3pAtt"],
    "3pM": p["3pM"],
    ftAtt: p.ftAtt,
    ftM: p.ftM,
    rebounds: p.rebounds,
    reboundsOff: p.reboundsOff,
    reboundsDef: p.reboundsDef,
    assists: p.assists,
    steals: p.steals,
    blocks: p.blocks,
    tos: p.tos,
    foulsAll: p.foulsAll,
    foulsTech: p.foulsTech,
    foulsFlag: p.foulsFlag,
  };
}

/** ---------- Main ---------- */

export async function processFolder(
  files: string[],
  folderName: string,
  outputFile: string,
  playerIdsFile: string = defaultPlayerIdsPath(),
  selectedRowTypes?: CustomRowType[],
): Promise<unknown[]> {
  const seasonId = parseSeasonIdFromFolder(folderName);

  const playerIdRegistry = new PlayerIdRegistry();
  playerIdRegistry.load(playerIdsFile);

  const output: unknown[] = [];
  // TODO: make selectable by input
  const customOutput: unknown[] = [];
  const profileMap = new Map<string, PlayerProfileRow>();
  const playerSeasonMap = new Map<string, PlayerSeasonRow>();
  const teamSeasonMap = new Map<string, TeamSeasonRow>();

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    const raw = fs.readFileSync(file, "utf-8");
    const items: PlayByPlayItem[] = JSON.parse(raw);
    if (items.length === 0) continue;

    let game;
    try {
      game = processGameFile(items, file, seasonId, playerIdRegistry);
    } catch (e) {
      throw new Error(`Failed to process ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }

    const {gameMetadata, gameTeams, gamePlayers, gamePlays, gamePlayerPlays, playerProfiles} = game;

    output.push(
      gameMetadata,
      ...gameTeams,
      ...gamePlayers,
      ...gamePlays,
      ...gamePlayerPlays,
    );
    if (selectedRowTypes) {
      if (selectedRowTypes.includes("gameMetadata")) customOutput.push(gameMetadata);
      if (selectedRowTypes.includes("gameTeams")) customOutput.push(...gameTeams);
      if (selectedRowTypes.includes("gamePlayers")) customOutput.push(...gamePlayers);
      if (selectedRowTypes.includes("gamePlays")) customOutput.push(...gamePlays);
      if (selectedRowTypes.includes("gamePlayerPlays")) customOutput.push(...gamePlayerPlays);
    }

    for (const p of playerProfiles) {
      if (!profileMap.has(p.PK)) profileMap.set(p.PK, p);
    }

    const isPlayoffGame = gameMetadata.isPlayoff;

    for (const tr of gameTeams) {
      const key = `${tr.teamId}|${seasonId}`;
      let row = teamSeasonMap.get(key);
      if (!row) {
        row = {
          PK: `TEAM#${tr.teamId}`,
          SK: `SEASON#${seasonId}`,
          seasonId: `SEASON#${seasonId}`,
          wins: 0,
          losses: 0,
          seed: 0,
          regularSeasonWins: 0,
          regularSeasonLosses: 0,
          madePlayoffs: false,
          playoffWins: 0,
          playoffLosses: 0,
          playoffRound: "",
          champion: false,
          ...emptyStats(),
        };
        teamSeasonMap.set(key, row);
      }
      if (tr.isWinner) row.wins++;
      else row.losses++;
      if (isPlayoffGame) {
        row.madePlayoffs = true;
        if (tr.isWinner) row.playoffWins++;
        else row.playoffLosses++;
      } else {
        if (tr.isWinner) row.regularSeasonWins++;
        else row.regularSeasonLosses++;
      }
      const prev: Stats = {
        fgAtt: row.fgAtt,
        fgM: row.fgM,
        "3pAtt": row["3pAtt"],
        "3pM": row["3pM"],
        ftAtt: row.ftAtt,
        ftM: row.ftM,
        rebounds: row.rebounds,
        reboundsOff: row.reboundsOff,
        reboundsDef: row.reboundsDef,
        assists: row.assists,
        steals: row.steals,
        blocks: row.blocks,
        tos: row.tos,
        foulsAll: row.foulsAll,
        foulsTech: row.foulsTech,
        foulsFlag: row.foulsFlag,
      };
      Object.assign(row, addStats(prev, statsFromGameTeamRow(tr)));
    }

    for (const pr of gamePlayers) {
      const playerId = pr.SK.replace(/^PLAYER#/, "");
      const key = `${playerId}|${pr.teamId}|${seasonId}`;
      let row = playerSeasonMap.get(key);
      if (!row) {
        row = {
          PK: `PLAYER#${playerId}`,
          SK: `TEAM#${pr.teamId}#SEASON#${seasonId}`,
          seasonId,
          gamesPlayed: 0,
          minutesPlayed: 0,
          regularSeasonGamesPlayed: 0,
          regularSeasonMinutesPlayed: 0,
          acquisitionMethod: "unknown",
          ...emptyStats(),
        };
        playerSeasonMap.set(key, row);
      }
      row.gamesPlayed++;
      row.minutesPlayed += pr.minutes
      if(!isPlayoffGame) {
        row.regularSeasonGamesPlayed++
        row.regularSeasonMinutesPlayed += pr.minutes
      }
      const prev: Stats = {
        fgAtt: row.fgAtt,
        fgM: row.fgM,
        "3pAtt": row["3pAtt"],
        "3pM": row["3pM"],
        ftAtt: row.ftAtt,
        ftM: row.ftM,
        rebounds: row.rebounds,
        reboundsOff: row.reboundsOff,
        reboundsDef: row.reboundsDef,
        assists: row.assists,
        steals: row.steals,
        blocks: row.blocks,
        tos: row.tos,
        foulsAll: row.foulsAll,
        foulsTech: row.foulsTech,
        foulsFlag: row.foulsFlag,
      };
      Object.assign(row, addStats(prev, statsFromGamePlayerRow(pr)));
    }
  }

  output.push(...profileMap.values());
  output.push(...playerSeasonMap.values());
  output.push(...teamSeasonMap.values());

  const outputFileParts = outputFile.split('.')
  const customOutputFile = outputFileParts[0] + '-custom.' + outputFileParts[1]
  await writeJsonArrayPretty(outputFile, output);

  if (selectedRowTypes) {
    if (selectedRowTypes.includes("playerProfiles")) customOutput.push(...profileMap.values());
    if (selectedRowTypes.includes("playerSeason")) customOutput.push(...playerSeasonMap.values());
    if (selectedRowTypes.includes("teamSeason")) customOutput.push(...teamSeasonMap.values());
    await writeJsonArrayPretty(customOutputFile, customOutput);
  }
  playerIdRegistry.save(playerIdsFile);
  return output;
}
