import {Team} from "../enums";

/** Internal box score stats (matches processor / createEmptyStats field names). */
export type InternalTeamStats = {
  foulsAll: number;
  foulsTechnical: number;
  foulsFlagrant: number;
  fieldGoalsAttempts: number;
  fieldGoalsMade: number;
  threePointersAttempts: number;
  threePointersMade: number;
  freeThrowsAttempts: number;
  freeThrowsMade: number;
  reboundsTotal: number;
  reboundsOffensive: number;
  reboundsDefensive: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
};

export type PlayerGameData = InternalTeamStats & {
  minutes: number;
  seconds: number;
  starter: boolean;
  closer?: boolean;
  ejected: boolean;
  /** Set when a player fouls out; omitted in legacy processor objects. */
  fouledOut?: boolean;
};

export type GameData = {
  gameId: string;
  date: number;
  season: string;
  awayTeam: Team;
  awayFoulsAll: number;
  awayFoulsTechnical: number;
  awayFoulsFlagrant: number;
  awayFieldGoalsAttempts: number;
  awayFieldGoalsMade: number;
  awayThreePointersAttempts: number;
  awayThreePointersMade: number;
  awayFreeThrowsAttempts: number;
  awayFreeThrowsMade: number;
  awayReboundsTotal: number;
  awayReboundsOffensive: number;
  awayReboundsDefensive: number;
  awayAssists: number;
  awaySteals: number;
  awayBlocks: number;
  awayTurnovers: number;
  awayScore: number;
  awayIsWinner: boolean;
  awayPlayers: Record<string, PlayerGameData>;
  homeTeam: Team;
  homeFoulsAll: number;
  homeFoulsTechnical: number;
  homeFoulsFlagrant: number;
  homeFieldGoalsAttempts: number;
  homeFieldGoalsMade: number;
  homeThreePointersAttempts: number;
  homeThreePointersMade: number;
  homeFreeThrowsAttempts: number;
  homeFreeThrowsMade: number;
  homeReboundsTotal: number;
  homeReboundsOffensive: number;
  homeReboundsDefensive: number;
  homeAssists: number;
  homeSteals: number;
  homeBlocks: number;
  homeTurnovers: number;
  homeScore: number;
  homeIsWinner: boolean;
  homePlayers: Record<string, PlayerGameData>;
  overtime: boolean;
  playoffs: boolean;
  nbaCup: boolean;
};
