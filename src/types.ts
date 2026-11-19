export type ListSource = 'all' | 'pointercrate' | 'aredl';
export type ListTier = 'all' | 'top10' | 'main' | 'extended' | 'legacy';

export interface UnifiedDemon {
  key: string; // canonical key: `gd:${level_id}` or `aredl:${id}` or `pc:${id}`
  levelId: number | null;
  name: string;
  pointercrateId: number | null;
  pointercratePosition: number | null;
  pointercrateRatedPosition: number | null;
  aredlId: string | null;
  aredlPosition: number | null;
  aredlPoints: number | null;
  aredlStatus: string | null; // e.g., MainList, Legacy
  rank: number; // primary sort rank based on active source
  publisher: string | null;
  verifier: string | null;
  requirement: number | null;
  video: string | null;
  thumbnail: string | null;
  twoPlayer: boolean;
  tags: string[];
  description: string | null;
  edelEnjoyment: number | null;
  gddlTier: number | null;
  nlwTier: string | null;
  requiresRawFootage: boolean;
  rated: boolean;
  recentDelta: number | null; // positive = raised (moved up), negative = lowered
}

export interface DemonVictor {
  id: string;
  playerName: string;
  countryCode: string | null;
  progress: number;
  video: string | null;
  achievedAt: string | null;
  source: 'Pointercrate' | 'AREDL' | 'Both';
  isVerification: boolean;
  mobile: boolean;
}

export interface DemonDetail extends UnifiedDemon {
  creators: string[];
  victors: DemonVictor[];
  songId: number | null;
}

export interface Top10LevelSummary {
  rank: number;
  levelId: number | null;
  pointercrateId: number | null;
  aredlId: string | null;
  name: string;
  publisher: string | null;
  verifier: string | null;
  requirement: number | null;
  thumbnail: string | null;
  video: string | null;
  aredlPoints: number | null;
  victorCount: number;
  victors: DemonVictor[];
}

export type TrackerEventType = 'demon_placed' | 'demon_updated' | 'top10_victor';

export interface TrackerEvent {
  id: string;
  type: TrackerEventType;
  source: 'Pointercrate' | 'AREDL';
  createdAt: string;
  title: string;
  summary: string;
  levelName: string;
  levelId: number | null;
  newPosition: number | null;
  oldPosition: number | null;
  playerName: string | null;
  videoUrl: string | null;
  isTest?: boolean;
}

export interface RankedPlayer {
  rank: number;
  id: string;
  name: string;
  score: number;
  countryCode: string | null;
  countryName: string | null;
  hardestLevel: string | null;
  extremesCount: number | null;
  source: 'Pointercrate' | 'AREDL';
}

export interface NotificationSettings {
  browserEnabled: boolean;
  soundEnabled: boolean;
  notifyPlaced: boolean;
  notifyUpdated: boolean;
  notifyTop10Victor: boolean;
  sources: {
    pointercrate: boolean;
    aredl: boolean;
  };
}

export interface SyncStatus {
  lastSyncedAt: string | null;
  isSyncing: boolean;
  pointercrateCount: number;
  aredlCount: number;
  top10VictorCount: number;
  pollIntervalSeconds: number;
  lastError: string | null;
}

export type CalendarEventCategory =
  | 'top10_victor'
  | 'pc_placed'
  | 'pc_updated'
  | 'aredl_placed'
  | 'aredl_updated';

export interface CalendarEvent {
  id: string;
  dateKey: string; // YYYY-MM-DD
  timestamp: string;
  category: CalendarEventCategory;
  source: 'Pointercrate' | 'AREDL';
  title: string;
  summary: string;
  levelName: string;
  levelId: number | null;
  pointercrateId: number | null;
  playerName: string | null;
  newPosition: number | null;
  oldPosition: number | null;
  videoUrl: string | null;
}

export interface CalendarMonthResponse {
  month: string;
  events: CalendarEvent[];
  pointercrateReady: boolean;
  scanning: boolean;
}

