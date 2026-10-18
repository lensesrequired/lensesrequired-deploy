export enum ProcessType {
  GAME = 'game',
  PLAY_BY_PLAY = 'play-by-play',
  PLAYER = 'player'
}

export enum Event {
  START_OF_PERIOD = 'start of period',
  JUMP_BALL = 'jump ball',
  SHOT = 'shot',
  REBOUND = 'rebound',
  FOUL = 'foul',
  FREE_THROW = 'free throw',
  SUBSTITUTION = 'substitution',
  TIMEOUT = 'timeout',
  TURNOVER = 'turnover',
  END_OF_PERIOD = 'end of period',
  END_OF_GAME = 'end of game',
  STEAL = 'steal',
  BLOCK = 'block',
  HEAVE = 'heave',
  UNKNOWN = '',
  VIOLATION = 'violation',
  TECHNICAL_FOUL = 'technical foul',
  EJECTION = 'ejection'
}

export enum StartOfPeriodType {
  START_OF_PERIOD = 'start of period'
}

export enum JumpBallType {
  JUMP_BALL = 'jump ball'
}

export enum ShotType {
  THREE_PT_JUMP_SHOT = '3pt jump shot',
  THREE_PT_PULLUP_JUMP_SHOT = '3pt pullup jump shot',
  JUMP_SHOT = 'jump shot',
  DUNK = 'dunk',
  HOOK_SHOT = 'hook shot',
  LAYUP = 'layup',
  THREE_PT_STEP_BACK_JUMP_SHOT = '3pt step back jump shot',
  THREE_PT_RUNNING_PULL_UP_JUMP_SHOT = '3pt running pull-up jump shot',
  DRIVING_LAYUP = 'driving layup',
  CUTTING_DUNK_SHOT = 'cutting dunk shot',
  DRIVING_FLOATING_JUMP_SHOT = 'driving floating jump shot',
  THREE_PT_RUNNING_JUMP_SHOT = '3pt running jump shot',
  TURNAROUND_FADEAWAY = 'turnaround fadeaway',
  FADEAWAY_JUMPER = 'fadeaway jumper',
  FLOATING_JUMP_SHOT = 'floating jump shot',
  CUTTING_LAYUP_SHOT = 'cutting layup shot',
  THREE_PT_FADEAWAY_JUMPER = '3pt fadeaway jumper',
  DRIVING_DUNK = 'driving dunk',
  DRIVING_REVERSE_LAYUP = 'driving reverse layup',
  CUTTING_FINGER_ROLL_LAYUP_SHOT = 'cutting finger roll layup shot',
  THREE_PT_TURNAROUND_JUMP_SHOT = '3pt turnaround jump shot',
  JUMP_BANK_SHOT = 'jump bank shot',
  THREE_PT_JUMP_BANK_SHOT = '3pt jump bank shot',
  HOOK_BANK_SHOT = 'hook bank shot',
  DRIVING_FLOATING_BANK_JUMP_SHOT = 'driving floating bank jump shot',
  THREE_PT_STEP_BACK_BANK_JUMP_SHOT = '3pt step back bank jump shot',
  THREE_PT_FLOATING_JUMP_SHOT = '3pt floating jump shot',
  THREE_PT_DRIVING_FLOATING_BANK_JUMP_SHOT = '3pt driving floating bank jump shot',
  DRIVING_REVERSE_DUNK_SHOT = 'driving reverse dunk shot',
  THREE_PT_TURNAROUND_FADEAWAY = '3pt turnaround fadeaway',
  UNKNOWN = 'unknown',
  FADEAWAY_BANK_SHOT = 'fadeaway bank shot',
  TURNAROUND_BANK_SHOT = 'turnaround bank shot',
  THREE_PT_TURNAROUND_BANK_SHOT = '3pt turnaround bank shot',
  THREE_PT_FADEAWAY_BANK_SHOT = '3pt fadeaway bank shot'
}

export enum ReboundType {
  REBOUND_DEFENSIVE = 'rebound defensive',
  DEFENSIVE = 'defensive',
  TEAM_REBOUND = 'team rebound',
  REBOUND_OFFENSIVE = 'rebound offensive',
  OFFENSIVE = 'offensive'
}

export enum FoulType {
  SHOOTING = 'shooting',
  PERSONAL = 'personal',
  OFFENSIVE = 'offensive',
  LOOSE_BALL = 'loose ball',
  AWAY_FROM_PLAY = 'away from play',
  FLAGRANT_1 = 'flagrant-1',
  OFFENSIVE_CHARGE = 'offensive charge',
  PERSONAL_TAKE = 'personal take',
  TECHNICAL = 'technical',
  EMPTY = '',
  FLAGRANT_2 = 'flagrant-2',
  HANGING_TECHNICAL = 'hanging technical',
  NON_UNSPORTSMANLIKE_TECHNICAL = 'non-unsportsmanlike technical',
  EXCESS_TIMEOUT_TECHNICAL = 'excess timeout technical',
  TRANSITION_TAKE = 'transition take'
}

export enum FreeThrowType {
  FREE_THROW_1_OF_2 = 'free throw 1/2',
  FREE_THROW_2_OF_2 = 'free throw 2/2',
  FREE_THROW_1_OF_1 = 'free throw 1/1',
  FREE_THROW_FLAGRANT_1_OF_3 = 'free throw flagrant 1/3',
  FREE_THROW_FLAGRANT_2_OF_3 = 'free throw flagrant 2/3',
  FREE_THROW_FLAGRANT_3_OF_3 = 'free throw flagrant 3/3',
  FREE_THROW_1_OF_3 = 'free throw 1/3',
  FREE_THROW_2_OF_3 = 'free throw 2/3',
  FREE_THROW_3_OF_3 = 'free throw 3/3',
  FREE_THROW_TECHNICAL = 'free throw technical',
  FREE_THROW_FLAGRANT_1_OF_2 = 'free throw flagrant 1/2',
  FREE_THROW_FLAGRANT_2_OF_2 = 'free throw flagrant 2/2',
  FREE_THROW_CLEAR_PATH_1_OF_2 = 'free throw clear path 1/2',
  FREE_THROW_CLEAR_PATH_2_OF_2 = 'free throw clear path 2/2',
  FREE_THROW_FLAGRANT_1_OF_1 = 'free throw flagrant 1/1'
}

export enum SubstitutionType {
  SUB = 'sub'
}

export enum TimeoutType {
  TIMEOUT_REGULAR = 'timeout: regular',
  UNKNOWN = 'unknown'
}

export enum TurnoverType {
  OFFENSIVE_FOUL = 'offensive foul',
  SHOT_CLOCK = 'shot clock',
  LOST_BALL = 'lost ball',
  BAD_PASS = 'bad pass',
  OUT_OF_BOUNDS_LOST_BALL = 'out of bounds lost ball',
  STEP_OUT_OF_BOUNDS = 'step out of bounds',
  TRAVELING = 'traveling',
  OFFENSIVE_GOALTENDING = 'offensive goaltending',
  THREE_SECOND_VIOLATION = '3-second violation',
  KICKED_BALL = 'kicked ball',
  DOUBLE_DRIBBLE = 'double dribble',
  FIVE_SECOND_VIOLATION = '5-second violation',
  PALMING = 'palming',
  BACKCOURT = 'backcourt',
  DISCONTINUE_DRIBBLE = 'discontinue dribble',
  BASKET_FROM_BELOW = 'basket from below',
  NO_TURNOVER = 'no turnover',
  INBOUND = 'inbound',
  EIGHT_SECOND_VIOLATION = '8-second violation',
  ILLEGAL_ASSIST = 'illegal assist',
  JUMP_BALL_VIOLATION = 'jump ball violation',
  LANE_VIOLATION = 'lane violation',
  PUNCHED_BALL = 'punched ball',
  TOO_MANY_PLAYERS = 'too many players',
  EMPTY = '',
  ILLEGAL_SCREEN = 'illegal screen'
}

export enum EndOfPeriodType {
  END_OF_PERIOD = 'end of period'
}

export enum EndOfGameType {
  END = 'end'
}

export enum UnknownEventType {
  UNKNOWN = 'unknown'
}

export enum ViolationType {
  DEFENSIVE_GOALTENDING = 'defensive goaltending',
  KICKED_BALL = 'kicked ball',
  DELAY_OF_GAME = 'delay of game',
  LANE = 'lane',
  JUMP_BALL = 'jump ball'
}

export enum TechnicalFoulType {
  DEFENSIVE_3_SECONDS = 'defensive 3 seconds',
  COACH_TECHNICAL_FOUL = 'coach technical foul',
  DOUBLE_TECHNICAL = 'double technical'
}

export enum EjectionType {
  EJECTION_OTHER = 'ejection: other'
}

export enum Team {
  NYK = 'NYK',
  BOS = 'BOS',
  MIN = 'MIN',
  LAL = 'LAL',
  IND = 'IND',
  DET = 'DET',
  BKN = 'BKN',
  ATL = 'ATL',
  ORL = 'ORL',
  MIA = 'MIA',
  MIL = 'MIL',
  PHI = 'PHI',
  CLE = 'CLE',
  TOR = 'TOR',
  CHA = 'CHA',
  HOU = 'HOU',
  CHI = 'CHI',
  NOP = 'NOP',
  MEM = 'MEM',
  UTA = 'UTA',
  PHX = 'PHX',
  LAC = 'LAC',
  GSW = 'GSW',
  POR = 'POR',
  WAS = 'WAS',
  SAS = 'SAS',
  DAL = 'DAL',
  OKC = 'OKC',
  DEN = 'DEN',
  SAC = 'SAC'
}

export type EventType =
  | StartOfPeriodType
  | JumpBallType
  | ShotType
  | ReboundType
  | FoulType
  | FreeThrowType
  | SubstitutionType
  | TimeoutType
  | TurnoverType
  | EndOfPeriodType
  | EndOfGameType
  | UnknownEventType
  | ViolationType
  | TechnicalFoulType
  | EjectionType;

export enum PlayerEventType {
  SHOT = 'SHOT',
  ASSIST = 'ASSIST',
  FOUL = 'FOUL', // gave foul
  BLOCK = 'BLOCK',
  STEAL = 'STEAL',
  TURNOVER = 'TURNOVER',
  FOULED = 'FOULED ', // was fouled
  REBOUND = 'REBOUND',
}
