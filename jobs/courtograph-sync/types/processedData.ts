import {Event, EventType, PlayerEventType, Team} from "../enums";

type ID = string;

export type Stats = {
  fgAtt: number;
  fgM: number;
  '3pAtt': number;
  '3pM': number;
  ftAtt: number;
  ftM: number;
  rebounds: number;
  reboundsOff: number;
  reboundsDef: number;
  assists: number;
  steals: number;
  blocks: number;
  tos: number;
  foulsAll: number;
  foulsTech: number;
  foulsFlag: number;
};

export type ShotMetadata = {
  xCoord: number;
  yCoord: number;
  convertedX: number;
  convertedY: number;
  shotDist: number;
};

export type GameMetadataRow = {
  PK: `GAME#${ID}`;
  SK: "METADATA";
  date: string;
  seasonId: ID;
  isRegSeason: boolean;
  isPlayoff: boolean;
  isCup: boolean;
  homeTeamId: Team;
  awayTeamId: Team;
  homeTeamScore: number;
  awayTeamScore: number;
};

export type GameTeamRow = {
  PK: `GAME#${ID}`;
  SK: `TEAM#${ID}`;
  isHome: boolean;
  isWinner: boolean;
  score: number;
  gameId: ID; // purposeful duplication
  teamId: Team;
} & Stats;

export type GamePlayerRow = {
  PK: `GAME#${ID}`;
  SK: `PLAYER#${ID}`;
  starter: boolean;
  closer: boolean;
  ejected: boolean;
  fouledOut: boolean;
  minutes: number;
  seconds: number;
  teamId: ID;
  gameId: ID; // purposeful duplication
} & Stats;

export type GamePlayRow = {
  PK: `GAME#${ID}`;
  SK: `PLAY#${ID}`;
  homePlayers: ID[];
  awayPlayers: ID[];
  event: Event;
  eventType: EventType;
  period: number;
  elapsed: number;
  remaining: number;
  playLength: number;
  isClutch: boolean;
  homeTeamId: ID;
  awayTeamId: ID;
  homeTeamScore: number;
  awayTeamScore: number;
  leadChange: boolean;
  actingTeamId: string;
};

export type PlayerPlayRow = {
  PK: `PLAYER#${ID}`;
  SK: `PLAY#${ID}_${ID}`;
  playerId: ID;
  playId: ID;
  event: Event;
  eventType: EventType;
  playerEventType: PlayerEventType;
  shotMade?: boolean;
  shotFouled?: boolean;
  shotMetadata?: ShotMetadata;
  isClutch: boolean;
  ftMade?: boolean;
  ftNum?: number;
  ftOutOf?: boolean;
  points?: number;
  leadChange?: boolean;
  teamId?: ID;
  homeTeamScore: number;
  awayTeamScore: number;
};

export type PlayerProfileRow = {
  PK: `PLAYER#${ID}`;
  SK: "PROFILE";
  name: string;
  dob: string;
  draftClass: string;
};

export type PlayerSeasonRow = {
  PK: `PLAYER#${ID}`;
  SK: `TEAM#${ID}#SEASON#${ID}`;
  seasonId: ID;
  gamesPlayed: number;
  minutesPlayed: number;
  regularSeasonGamesPlayed: number;
  regularSeasonMinutesPlayed: number;
  acquisitionMethod: string;
} & Stats;

export type TeamSeasonRow = {
  PK: `TEAM#${ID}`;
  SK: `SEASON#${ID}`;
  seasonId: ID;
  wins: number;
  losses: number;
  seed: number;
  regularSeasonWins: number;
  regularSeasonLosses: number;
  madePlayoffs: boolean;
  playoffWins: number;
  playoffLosses: number;
  playoffRound: string;
  champion: boolean;
} & Stats;
