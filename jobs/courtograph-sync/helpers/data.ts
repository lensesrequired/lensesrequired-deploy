import {InternalTeamStats} from "../types/gameData";

export const createEmptyStats = (): InternalTeamStats => ({
  foulsAll: 0,
  foulsTechnical: 0,
  foulsFlagrant: 0,

  fieldGoalsAttempts: 0,
  fieldGoalsMade: 0,

  threePointersAttempts: 0,
  threePointersMade: 0,

  freeThrowsAttempts: 0,
  freeThrowsMade: 0,

  reboundsTotal: 0,
  reboundsOffensive: 0,
  reboundsDefensive: 0,

  assists: 0,
  steals: 0,
  blocks: 0,
  turnovers: 0,
})
