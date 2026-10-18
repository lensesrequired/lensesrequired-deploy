"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toProcessedStats = toProcessedStats;
exports.processGameFile = processGameFile;
exports.parseSeasonIdFromFolder = parseSeasonIdFromFolder;
const path_1 = require("path");
const enums_1 = require("../enums");
const playerIdRegistry_1 = require("./playerIdRegistry");
const processor_1 = require("./processor");
function toProcessedStats(s) {
    return {
        fgAtt: s.fieldGoalsAttempts,
        fgM: s.fieldGoalsMade,
        "3pAtt": s.threePointersAttempts,
        "3pM": s.threePointersMade,
        ftAtt: s.freeThrowsAttempts,
        ftM: s.freeThrowsMade,
        rebounds: s.reboundsTotal,
        reboundsOff: s.reboundsOffensive,
        reboundsDef: s.reboundsDefensive,
        assists: s.assists,
        steals: s.steals,
        blocks: s.blocks,
        tos: s.turnovers,
        foulsAll: s.foulsAll,
        foulsTech: s.foulsTechnical,
        foulsFlag: s.foulsFlagrant,
    };
}
function parseTimeToSeconds(t) {
    if (!t)
        return 0;
    const parts = t.split(":").map((p) => parseInt(p, 10));
    if (parts.some((n) => Number.isNaN(n)))
        return 0;
    if (parts.length === 3)
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2)
        return parts[0] * 60 + parts[1];
    return 0;
}
function leadIndex(home, away) {
    if (home > away)
        return 1;
    if (away > home)
        return -1;
    return 0;
}
function isClutchPlay(item) {
    const period = parseInt(item.period, 10);
    const home = parseInt(item.home_score, 10);
    const away = parseInt(item.away_score, 10);
    if (Math.abs(home - away) > 5)
        return false;
    if (period < 4)
        return false;
    const rem = parseTimeToSeconds(item.remaining_time);
    if (period === 4)
        return rem <= 5 * 60;
    return true;
}
function shotMetadataFromItem(item) {
    if (item.event_type !== enums_1.Event.SHOT)
        return undefined;
    const x = parseFloat(item.original_x);
    const y = parseFloat(item.original_y);
    let cx = Number.parseFloat(item.converted_x ?? "");
    let cy = Number.parseFloat(item.converted_y ?? "");
    // The 2025-26 source records court coordinates as percentages: x spans the
    // 94-foot court length and y spans its 50-foot width. Older files already
    // provide converted_x/y, so preserve those values whenever present.
    if ((!Number.isFinite(cx) || !Number.isFinite(cy)) &&
        item.time_actual !== undefined &&
        Number.isFinite(x) && Number.isFinite(y) &&
        x >= 0 && x <= 100 && y >= 0 && y <= 100) {
        cx = y * 0.5;
        cy = x * 0.94;
    }
    if ([x, y, cx, cy].some((n) => !Number.isFinite(n)))
        return undefined;
    return {
        xCoord: x,
        yCoord: y,
        convertedX: cx,
        convertedY: cy,
        shotDist: parseFloat(item.shot_distance) || 0,
    };
}
function parseFtParts(item) {
    const n = item.num ? parseInt(item.num, 10) : NaN;
    return {
        ftNum: Number.isFinite(n) ? n : undefined,
        ftOutOf: item.outof !== "" && item.outof !== undefined ? true : undefined,
    };
}
function buildPlayerPlayRows(item, gameId, seasonId, registry, playId) {
    const homeScore = parseInt(item.home_score, 10);
    const awayScore = parseInt(item.away_score, 10);
    const isClutch = isClutchPlay(item);
    const base = (playerId) => ({
        PK: `PLAYER#${playerId}`,
        playId,
        event: item.event_type,
        eventType: item.type,
        isClutch,
        homeTeamScore: homeScore,
        awayTeamScore: awayScore,
    });
    const rows = [];
    const push = (fullName, rest) => {
        if (!(0, playerIdRegistry_1.normalizePlayerName)(fullName))
            return;
        const playerId = registry.ensureId(fullName);
        rows.push({
            ...base(playerId),
            ...rest,
            SK: `PLAY#${gameId}_${playId}`,
            playerId,
        });
    };
    if (item.event_type === enums_1.Event.SHOT && item.player) {
        push(item.player, {
            playerEventType: enums_1.PlayerEventType.SHOT,
            shotMade: item.result === "made",
            shotFouled: item.reason === "s.foul" || item.reason === "shooting",
            shotMetadata: shotMetadataFromItem(item),
            points: item.points ? parseInt(item.points, 10) : undefined,
            teamId: item.team || undefined,
        });
        if (item.result === "made" && item.assist) {
            push(item.assist, {
                playerEventType: enums_1.PlayerEventType.ASSIST,
                teamId: item.team || undefined,
            });
        }
    }
    if (item.event_type === enums_1.Event.FREE_THROW && item.player) {
        const { ftNum, ftOutOf } = parseFtParts(item);
        push(item.player, {
            playerEventType: enums_1.PlayerEventType.SHOT,
            ftMade: item.result === "made",
            ftNum,
            ftOutOf,
            points: item.points ? parseInt(item.points, 10) : undefined,
            teamId: item.team || undefined,
        });
    }
    if (item.event_type === enums_1.Event.REBOUND && item.player) {
        push(item.player, {
            playerEventType: enums_1.PlayerEventType.REBOUND,
            teamId: item.team || undefined,
        });
    }
    if (item.event_type === enums_1.Event.TURNOVER && item.player) {
        push(item.player, {
            playerEventType: enums_1.PlayerEventType.TURNOVER,
            teamId: item.team || undefined,
        });
    }
    if ((item.event_type === enums_1.Event.FOUL || item.event_type === enums_1.Event.TECHNICAL_FOUL) && item.player) {
        push(item.player, {
            playerEventType: enums_1.PlayerEventType.FOUL,
            teamId: item.team || undefined,
        });
    }
    if (item.type === enums_1.TechnicalFoulType.DOUBLE_TECHNICAL && item.opponent) {
        push(item.opponent, {
            playerEventType: enums_1.PlayerEventType.FOUL,
        });
    }
    if (item.block) {
        push(item.block, {
            playerEventType: enums_1.PlayerEventType.BLOCK,
        });
    }
    if (item.steal) {
        push(item.steal, {
            playerEventType: enums_1.PlayerEventType.STEAL,
        });
    }
    return rows;
}
function playerToGameRow(name, p, gameId, seasonId, teamId, registry) {
    const playerId = registry.ensureId(name);
    return {
        PK: `GAME#${gameId}`,
        SK: `PLAYER#${playerId}`,
        starter: p.starter,
        closer: p.closer ?? false,
        ejected: p.ejected,
        fouledOut: p.fouledOut ?? false,
        minutes: p.minutes,
        seconds: p.seconds,
        teamId,
        gameId,
        ...toProcessedStats(p),
    };
}
function processGameFile(items, filePath, seasonId, registry) {
    const fileBaseName = (0, path_1.basename)(filePath, ".json");
    const gameData = (0, processor_1.processor)(items, fileBaseName);
    const awayTeam = gameData.awayTeam;
    const homeTeam = gameData.homeTeam;
    const gameId = gameData.gameId;
    const last = items[items.length - 1];
    const dataSet = last.data_set;
    const isPlayoff = dataSet.includes("Playoff");
    const gameMetadata = {
        PK: `GAME#${gameId}`,
        SK: "METADATA",
        date: last.date,
        seasonId,
        isRegSeason: !isPlayoff,
        isPlayoff,
        isCup: dataSet.includes("In-Season") || dataSet.includes("Tournament"),
        homeTeamId: homeTeam,
        awayTeamId: awayTeam,
        homeTeamScore: gameData.homeScore,
        awayTeamScore: gameData.awayScore,
    };
    const awayTeamRow = {
        PK: `GAME#${gameId}`,
        SK: `TEAM#${awayTeam}`,
        isHome: false,
        isWinner: gameData.awayIsWinner,
        score: gameData.awayScore,
        gameId,
        teamId: awayTeam,
        ...toProcessedStats({
            foulsAll: gameData.awayFoulsAll,
            foulsTechnical: gameData.awayFoulsTechnical,
            foulsFlagrant: gameData.awayFoulsFlagrant,
            fieldGoalsAttempts: gameData.awayFieldGoalsAttempts,
            fieldGoalsMade: gameData.awayFieldGoalsMade,
            threePointersAttempts: gameData.awayThreePointersAttempts,
            threePointersMade: gameData.awayThreePointersMade,
            freeThrowsAttempts: gameData.awayFreeThrowsAttempts,
            freeThrowsMade: gameData.awayFreeThrowsMade,
            reboundsTotal: gameData.awayReboundsTotal,
            reboundsOffensive: gameData.awayReboundsOffensive,
            reboundsDefensive: gameData.awayReboundsDefensive,
            assists: gameData.awayAssists,
            steals: gameData.awaySteals,
            blocks: gameData.awayBlocks,
            turnovers: gameData.awayTurnovers,
        }),
    };
    const homeTeamRow = {
        PK: `GAME#${gameId}`,
        SK: `TEAM#${homeTeam}`,
        isHome: true,
        isWinner: gameData.homeIsWinner,
        score: gameData.homeScore,
        gameId,
        teamId: homeTeam,
        ...toProcessedStats({
            foulsAll: gameData.homeFoulsAll,
            foulsTechnical: gameData.homeFoulsTechnical,
            foulsFlagrant: gameData.homeFoulsFlagrant,
            fieldGoalsAttempts: gameData.homeFieldGoalsAttempts,
            fieldGoalsMade: gameData.homeFieldGoalsMade,
            threePointersAttempts: gameData.homeThreePointersAttempts,
            threePointersMade: gameData.homeThreePointersMade,
            freeThrowsAttempts: gameData.homeFreeThrowsAttempts,
            freeThrowsMade: gameData.homeFreeThrowsMade,
            reboundsTotal: gameData.homeReboundsTotal,
            reboundsOffensive: gameData.homeReboundsOffensive,
            reboundsDefensive: gameData.homeReboundsDefensive,
            assists: gameData.homeAssists,
            steals: gameData.homeSteals,
            blocks: gameData.homeBlocks,
            turnovers: gameData.homeTurnovers,
        }),
    };
    const gamePlayers = [
        ...Object.entries(gameData.awayPlayers).map(([name, p]) => playerToGameRow(name, p, gameId, seasonId, awayTeam, registry)),
        ...Object.entries(gameData.homePlayers).map(([name, p]) => playerToGameRow(name, p, gameId, seasonId, homeTeam, registry)),
    ];
    const awayLine = new Set();
    const homeLine = new Set();
    let prevHome = 0;
    let prevAway = 0;
    const gamePlays = [];
    const gamePlayerPlays = [];
    const playOccurrences = new Map();
    for (let index = 0; index < items.length;) {
        const item = items[index];
        const playItems = [item];
        if (item.event_type === enums_1.Event.SUBSTITUTION) {
            while (index + playItems.length < items.length &&
                items[index + playItems.length].event_type === enums_1.Event.SUBSTITUTION &&
                items[index + playItems.length].play_id === item.play_id) {
                playItems.push(items[index + playItems.length]);
            }
        }
        const finalItem = playItems[playItems.length - 1];
        // Allocate once per logical play so game and player rows share an identity.
        const occurrence = (playOccurrences.get(item.play_id) ?? 0) + 1;
        playOccurrences.set(item.play_id, occurrence);
        const playId = occurrence === 1
            ? item.play_id
            : `${item.play_id}#${String(occurrence).padStart(3, "0")}`;
        if (item.event_type === enums_1.Event.START_OF_PERIOD) {
            awayLine.clear();
            homeLine.clear();
            [item.a1, item.a2, item.a3, item.a4, item.a5].forEach((n) => n && awayLine.add(n));
            [item.h1, item.h2, item.h3, item.h4, item.h5].forEach((n) => n && homeLine.add(n));
        }
        // A substitution play may have several source rows, one for each player
        // entering or leaving. Apply them all before recording the play's lineup.
        if (item.event_type === enums_1.Event.SUBSTITUTION) {
            for (const sub of playItems) {
                const team = sub.team;
                const line = team === awayTeam ? awayLine : homeLine;
                if (sub.left)
                    line.delete(sub.left);
                if (sub.entered)
                    line.add(sub.entered);
                gamePlayerPlays.push(...buildPlayerPlayRows(sub, gameId, seasonId, registry, playId));
            }
        }
        const homePlayersArr = [...homeLine];
        const awayPlayersArr = [...awayLine];
        const homeScore = parseInt(finalItem.home_score, 10);
        const awayScore = parseInt(finalItem.away_score, 10);
        const leadChange = leadIndex(homeScore, awayScore) !== leadIndex(prevHome, prevAway);
        const period = parseInt(finalItem.period, 10);
        const elapsed = parseTimeToSeconds(finalItem.elapsed);
        const remaining = parseTimeToSeconds(finalItem.remaining_time);
        const playLength = parseTimeToSeconds(finalItem.play_length);
        gamePlays.push({
            PK: `GAME#${gameId}`,
            SK: `PLAY#${playId}`,
            homePlayers: homePlayersArr.filter(playerIdRegistry_1.normalizePlayerName).map((n) => registry.ensureId(n)),
            awayPlayers: awayPlayersArr.filter(playerIdRegistry_1.normalizePlayerName).map((n) => registry.ensureId(n)),
            event: finalItem.event_type,
            eventType: finalItem.type,
            period,
            elapsed,
            remaining,
            playLength,
            isClutch: isClutchPlay(finalItem),
            homeTeamId: homeTeam,
            awayTeamId: awayTeam,
            homeTeamScore: homeScore,
            awayTeamScore: awayScore,
            leadChange,
            actingTeamId: finalItem.team || "",
        });
        if (item.event_type !== enums_1.Event.SUBSTITUTION) {
            gamePlayerPlays.push(...buildPlayerPlayRows(item, gameId, seasonId, registry, playId));
        }
        prevHome = homeScore;
        prevAway = awayScore;
        index += playItems.length;
    }
    const profileIds = new Set();
    for (const p of gamePlayers) {
        const id = p.SK.replace(/^PLAYER#/, "");
        profileIds.add(id);
    }
    const playerProfiles = [...profileIds].map((id) => ({
        PK: `PLAYER#${id}`,
        SK: "PROFILE",
        name: registry.getDisplayName(id) ?? id,
        dob: "",
        draftClass: "",
    }));
    return {
        gameMetadata,
        gameTeams: [awayTeamRow, homeTeamRow],
        gamePlayers,
        gamePlays,
        gamePlayerPlays,
        playerProfiles,
    };
}
function parseSeasonIdFromFolder(folderName) {
    return folderName.split("_")[0];
}
