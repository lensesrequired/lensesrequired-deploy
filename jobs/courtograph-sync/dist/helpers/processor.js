"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processor = void 0;
const enums_1 = require("../enums");
const data_1 = require("./data");
const time_1 = require("./time");
const playerIdRegistry_1 = require("./playerIdRegistry");
const processor = (data, fileName) => {
    const playerNameFields = [
        "a1", "a2", "a3", "a4", "a5", "h1", "h2", "h3", "h4", "h5",
        "assist", "block", "steal", "player", "opponent", "entered", "left",
        "away", "home", "possession",
    ];
    const normalizedData = data.map((item) => {
        const normalized = { ...item };
        for (const field of playerNameFields) {
            if (typeof normalized[field] === "string") {
                normalized[field] = (0, playerIdRegistry_1.normalizePlayerName)(normalized[field]);
            }
        }
        return normalized;
    });
    const regex = /^\[(\d{4}-\d{2}-\d{2})].*?([A-Z]{3})@([A-Z]{3})$/;
    const match = fileName.match(regex);
    if (!match)
        throw new Error('Invalid file name');
    const lastItem = normalizedData[normalizedData.length - 1];
    const awayScore = parseInt(lastItem.away_score, 10);
    const homeScore = parseInt(lastItem.home_score, 10);
    const awayStats = (0, data_1.createEmptyStats)();
    const homeStats = (0, data_1.createEmptyStats)();
    const awayPlayers = {};
    const homePlayers = {};
    const courtPlayers = {};
    const benchPlayer = () => ({
        ...(0, data_1.createEmptyStats)(),
        minutes: 0,
        seconds: 0,
        starter: false,
        ejected: false,
    });
    // calculate the away team stats based on the event, eventType and other properties
    normalizedData.forEach((item, index) => {
        if (item.result === 'missed' && item.assist) {
            console.log(item.player, item.assist);
        }
        if (item.event_type === enums_1.Event.START_OF_PERIOD) {
            [item.a1, item.a2, item.a3, item.a4, item.a5].forEach(playerName => {
                if (playerName && !awayPlayers[playerName]) {
                    awayPlayers[playerName] = {
                        ...(0, data_1.createEmptyStats)(),
                        minutes: 0,
                        seconds: 0,
                        starter: index === 0,
                        ejected: false
                    };
                }
                courtPlayers[playerName] = item.elapsed;
            });
            [item.h1, item.h2, item.h3, item.h4, item.h5].forEach(playerName => {
                if (playerName && !homePlayers[playerName]) {
                    homePlayers[playerName] = {
                        ...(0, data_1.createEmptyStats)(),
                        minutes: 0,
                        seconds: 0,
                        starter: index === 0,
                        ejected: false
                    };
                }
                courtPlayers[playerName] = item.elapsed;
            });
        }
        if (item.event_type === enums_1.Event.END_OF_PERIOD) {
            const isFinalPeriodEnd = index === normalizedData.length - 1 ||
                normalizedData[index + 1]?.event_type === enums_1.Event.END_OF_GAME;
            [item.a1, item.a2, item.a3, item.a4, item.a5].forEach(playerName => {
                if (playerName) {
                    if (!awayPlayers[playerName]) {
                        awayPlayers[playerName] = benchPlayer();
                    }
                    if (isFinalPeriodEnd) {
                        awayPlayers[playerName].closer = true;
                    }
                    const onCourtSince = courtPlayers[playerName] ?? item.elapsed;
                    const { minutes, seconds } = (0, time_1.addTimes)(awayPlayers[playerName], (0, time_1.getTimeDifference)(onCourtSince, item.elapsed));
                    awayPlayers[playerName].minutes = minutes;
                    awayPlayers[playerName].seconds = seconds;
                    delete courtPlayers[playerName];
                }
            });
            [item.h1, item.h2, item.h3, item.h4, item.h5].forEach(playerName => {
                if (playerName) {
                    if (!homePlayers[playerName]) {
                        homePlayers[playerName] = benchPlayer();
                    }
                    if (isFinalPeriodEnd) {
                        homePlayers[playerName].closer = true;
                    }
                    const onCourtSince = courtPlayers[playerName] ?? item.elapsed;
                    const { minutes, seconds } = (0, time_1.addTimes)(homePlayers[playerName], (0, time_1.getTimeDifference)(onCourtSince, item.elapsed));
                    homePlayers[playerName].minutes = minutes;
                    homePlayers[playerName].seconds = seconds;
                    delete courtPlayers[playerName];
                }
            });
        }
        const isAwayTeam = item.team === match[2];
        const players = isAwayTeam ? awayPlayers : homePlayers;
        const oppPlayers = isAwayTeam ? homePlayers : awayPlayers;
        const player = item.player;
        /** PBP sometimes credits stats to a name before they appear in lineups / subs. */
        const ensurePlayer = (name) => {
            if (!name)
                return false;
            if (!players[name]) {
                players[name] = benchPlayer();
            }
            return true;
        };
        if (item.event_type === enums_1.Event.SUBSTITUTION) {
            const playerEntering = item.entered;
            if (playerEntering) {
                courtPlayers[playerEntering] = item.elapsed;
                if (playerEntering && !players[playerEntering]) {
                    players[playerEntering] = {
                        ...(0, data_1.createEmptyStats)(),
                        minutes: 0,
                        seconds: 0,
                        starter: false,
                        ejected: false
                    };
                }
            }
            const playerLeaving = item.left;
            if (playerLeaving) {
                if (!players[playerLeaving]) {
                    players[playerLeaving] = benchPlayer();
                }
                const onCourtSince = courtPlayers[playerLeaving] ?? item.elapsed;
                const { minutes, seconds } = (0, time_1.addTimes)(players[playerLeaving], (0, time_1.getTimeDifference)(onCourtSince, item.elapsed));
                players[playerLeaving].minutes = minutes;
                players[playerLeaving].seconds = seconds;
                delete courtPlayers[item.left];
            }
        }
        if (item.event_type === enums_1.Event.EJECTION && ensurePlayer(player)) {
            players[player].ejected = true;
        }
        const stats = isAwayTeam ? awayStats : homeStats;
        // Field goals and three pointers
        if (item.event_type === enums_1.Event.SHOT) {
            // Recent PBP exports use generic shot types (for example, "jump shot")
            // and retain the 3PT designation in the description instead.
            const isThreePoint = /3\s?pt/i.test(item.type ?? '') || /\b3\s?pt\b/i.test(item.description ?? '');
            if (isThreePoint) {
                stats.threePointersAttempts++;
                stats.fieldGoalsAttempts++;
                if (ensurePlayer(player)) {
                    players[player].threePointersAttempts++;
                    players[player].fieldGoalsAttempts++;
                }
                if (item.result === 'made') {
                    stats.threePointersMade++;
                    stats.fieldGoalsMade++;
                    if (ensurePlayer(player)) {
                        players[player].threePointersMade++;
                        players[player].fieldGoalsMade++;
                    }
                }
            }
            else {
                stats.fieldGoalsAttempts++;
                if (ensurePlayer(player))
                    players[player].fieldGoalsAttempts++;
                if (item.result === 'made') {
                    stats.fieldGoalsMade++;
                    if (ensurePlayer(player))
                        players[player].fieldGoalsMade++;
                }
            }
        }
        // Free throws
        if (item.event_type === enums_1.Event.FREE_THROW) {
            stats.freeThrowsAttempts++;
            if (ensurePlayer(player))
                players[player].freeThrowsAttempts++;
            if (item.result === 'made') {
                stats.freeThrowsMade++;
                if (ensurePlayer(player))
                    players[player].freeThrowsMade++;
            }
        }
        // Rebounds
        if (item.event_type === enums_1.Event.REBOUND) {
            stats.reboundsTotal++;
            if (ensurePlayer(player)) {
                players[player].reboundsTotal++;
            }
            if (item.type === enums_1.ReboundType.REBOUND_OFFENSIVE || item.type === enums_1.ReboundType.OFFENSIVE) {
                stats.reboundsOffensive++;
                if (ensurePlayer(player))
                    players[player].reboundsOffensive++;
            }
            else if (item.type === enums_1.ReboundType.REBOUND_DEFENSIVE || item.type === enums_1.ReboundType.DEFENSIVE) {
                stats.reboundsDefensive++;
                if (ensurePlayer(player))
                    players[player].reboundsDefensive++;
            }
        }
        // Turnovers
        if (item.event_type === enums_1.Event.TURNOVER) {
            stats.turnovers++;
            if (ensurePlayer(player))
                players[player].turnovers++;
        }
        // Assists
        if (item.assist && item.result === 'made') {
            stats.assists++;
            if (ensurePlayer(player))
                players[player].assists++;
        }
        // Steals
        if (item.steal) {
            stats.steals++;
            if (ensurePlayer(player))
                players[player].steals++;
        }
        // Blocks
        if (item.block) {
            stats.blocks++;
            if (ensurePlayer(player))
                players[player].blocks++;
        }
        // Fouls
        if (item.event_type === enums_1.Event.FOUL || (item.event_type === enums_1.Event.TECHNICAL_FOUL && item.type !== enums_1.TechnicalFoulType.DOUBLE_TECHNICAL)) {
            stats.foulsAll++;
            if (ensurePlayer(player))
                players[player].foulsAll++;
            if (item.type === enums_1.FoulType.TECHNICAL || item.event_type === enums_1.Event.TECHNICAL_FOUL) {
                stats.foulsTechnical++;
                if (ensurePlayer(player))
                    players[player].foulsTechnical++;
                if (item.type === enums_1.TechnicalFoulType.COACH_TECHNICAL_FOUL) {
                    const coachId = `coach_${item.team}`;
                    if (!players[coachId]) {
                        players[coachId] = {
                            ...(0, data_1.createEmptyStats)(),
                            minutes: 0,
                            seconds: 0,
                            starter: false,
                            ejected: false,
                        };
                    }
                    players[coachId].foulsTechnical++;
                }
            }
            else if (item.type === enums_1.FoulType.FLAGRANT_1 || item.type === enums_1.FoulType.FLAGRANT_2) {
                stats.foulsFlagrant++;
                if (ensurePlayer(player))
                    players[player].foulsFlagrant++;
            }
        }
        if (item.type === enums_1.TechnicalFoulType.DOUBLE_TECHNICAL) {
            stats.foulsAll++;
            if (item.team) {
                // TODO: fix these stats
                // if(!player) {
                //   console.log('No player in double tech', item.game_id, item.player, item.opponent, item.team, item.period, item.remaining_time)
                // }
                if (ensurePlayer(player))
                    players[player].foulsAll++;
                // TODO: fix these stats
                // if(!item.opponent) {
                //   console.log('No opposing player in double tech', item.game_id, item.player, item.opponent, item.team, item.period, item.remaining_time)
                // }
                if (item.opponent) {
                    const oppPlayer = item.opponent;
                    if (!oppPlayers[oppPlayer]) {
                        oppPlayers[oppPlayer] = {
                            ...(0, data_1.createEmptyStats)(),
                            minutes: 0,
                            seconds: 0,
                            starter: false,
                            ejected: false,
                        };
                    }
                    oppPlayers[oppPlayer].foulsAll++;
                }
            }
            else {
                // TODO: fix these stats
            }
        }
    });
    const date = new Date(match[1]);
    const year = date.getUTCFullYear();
    const season = date.getUTCMonth() >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    return {
        gameId: lastItem.game_id,
        date: new Date(match[1]).getTime(),
        season,
        awayTeam: match[2],
        awayFoulsAll: awayStats.foulsAll,
        awayFoulsTechnical: awayStats.foulsTechnical,
        awayFoulsFlagrant: awayStats.foulsFlagrant,
        awayFieldGoalsAttempts: awayStats.fieldGoalsAttempts,
        awayFieldGoalsMade: awayStats.fieldGoalsMade,
        awayThreePointersAttempts: awayStats.threePointersAttempts,
        awayThreePointersMade: awayStats.threePointersMade,
        awayFreeThrowsAttempts: awayStats.freeThrowsAttempts,
        awayFreeThrowsMade: awayStats.freeThrowsMade,
        awayReboundsTotal: awayStats.reboundsTotal,
        awayReboundsOffensive: awayStats.reboundsOffensive,
        awayReboundsDefensive: awayStats.reboundsDefensive,
        awayAssists: awayStats.assists,
        awaySteals: awayStats.steals,
        awayBlocks: awayStats.blocks,
        awayTurnovers: awayStats.turnovers,
        awayScore: awayScore,
        awayIsWinner: awayScore > homeScore,
        awayPlayers: awayPlayers,
        homeTeam: match[3],
        homeFoulsAll: homeStats.foulsAll,
        homeFoulsTechnical: homeStats.foulsTechnical,
        homeFoulsFlagrant: homeStats.foulsFlagrant,
        homeFieldGoalsAttempts: homeStats.fieldGoalsAttempts,
        homeFieldGoalsMade: homeStats.fieldGoalsMade,
        homeThreePointersAttempts: homeStats.threePointersAttempts,
        homeThreePointersMade: homeStats.threePointersMade,
        homeFreeThrowsAttempts: homeStats.freeThrowsAttempts,
        homeFreeThrowsMade: homeStats.freeThrowsMade,
        homeReboundsTotal: homeStats.reboundsTotal,
        homeReboundsOffensive: homeStats.reboundsOffensive,
        homeReboundsDefensive: homeStats.reboundsDefensive,
        homeAssists: homeStats.assists,
        homeSteals: homeStats.steals,
        homeBlocks: homeStats.blocks,
        homeTurnovers: homeStats.turnovers,
        homeScore: homeScore,
        homeIsWinner: homeScore > awayScore,
        homePlayers: homePlayers,
        overtime: parseInt(lastItem.period, 10) > 4,
        playoffs: lastItem.data_set.includes('Playoffs'),
        nbaCup: lastItem.data_set.includes('Tournament'),
    };
};
exports.processor = processor;
