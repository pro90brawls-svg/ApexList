import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CalendarEvent,
  CalendarMonthResponse,
  DemonDetail,
  DemonVictor,
  ListSource,
  ListTier,
  RankedPlayer,
  SyncStatus,
  Top10LevelSummary,
  TrackerEvent,
  UnifiedDemon,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;
const POLL_INTERVAL_MS = 60_000;
const DATA_DIR = path.resolve(__dirname, '.data');
const SNAPSHOT_PATH = path.join(DATA_DIR, 'tracker-snapshot.json');

interface PcPlayerRef {
  id: number;
  name: string;
  banned?: boolean;
}

interface PcListedDemon {
  id: number;
  position: number;
  rated_position: number | null;
  name: string;
  requirement: number;
  video: string | null;
  thumbnail: string | null;
  publisher: PcPlayerRef | null;
  verifier: PcPlayerRef | null;
  level_id: number | null;
  rated: boolean;
}

interface PcRecord {
  id: number;
  progress: number;
  status: string;
  video: string | null;
  player: PcPlayerRef;
  nationality?: {
    country_code?: string;
    nation?: string;
  } | null;
}

interface PcFullDemon extends PcListedDemon {
  creators?: PcPlayerRef[];
  records?: PcRecord[];
}

interface AredlLevel {
  id: string;
  name: string;
  position: number;
  publisher_id?: string | null;
  points: number;
  status: string;
  requires_raw_footage: boolean;
  level_id: number;
  two_player: boolean;
  tags: string[];
  description: string | null;
  song: number | null;
  edel_enjoyment: number | null;
  is_edel_pending?: boolean;
  gddl_tier: number | null;
  nlw_tier: string | null;
}

interface AredlUserRef {
  id: string;
  username: string;
  global_name?: string | null;
  country?: number | null;
}

interface AredlVerificationOrRecord {
  id: string;
  submitted_by: AredlUserRef;
  mobile: boolean;
  video_url: string | null;
  hide_video?: boolean;
  achieved_at?: string | null;
  created_at?: string | null;
}

interface AredlLevelDetail extends AredlLevel {
  publisher?: AredlUserRef | null;
  verifications?: AredlVerificationOrRecord[];
  creators?: AredlUserRef[];
}

interface AredlChangelogEntry {
  action: Record<string, { new_position?: number; old_position?: number; status?: string }>;
  created_at: string;
  affected_level: {
    id: string;
    name: string;
    level_id: number | null;
    two_player?: boolean;
  };
}

interface PersistedSnapshot {
  initialized: boolean;
  pcPositions: Record<string, { position: number; requirement: number; name: string }>;
  aredlPositions: Record<string, { position: number; status: string; name: string }>;
  top10VictorKeys: string[];
  seenAredlChangelogKeys: string[];
  events: TrackerEvent[];
}

interface AppCache {
  pcDemons: PcListedDemon[];
  aredlLevels: AredlLevel[];
  unifiedDemons: UnifiedDemon[];
  top10: Top10LevelSummary[];
  pcPlayers: RankedPlayer[];
  aredlPlayers: RankedPlayer[];
  aredlCalendarEvents: CalendarEvent[];
  pcMonthCache: Map<string, { fetchedAt: number; events: CalendarEvent[]; scanning: boolean }>;
  detailCache: Map<string, { fetchedAt: number; detail: DemonDetail }>;
  status: SyncStatus;
}

const cache: AppCache = {
  pcDemons: [],
  aredlLevels: [],
  unifiedDemons: [],
  top10: [],
  pcPlayers: [],
  aredlPlayers: [],
  aredlCalendarEvents: [],
  pcMonthCache: new Map(),
  detailCache: new Map(),
  status: {
    lastSyncedAt: null,
    isSyncing: false,
    pointercrateCount: 0,
    aredlCount: 0,
    top10VictorCount: 0,
    pollIntervalSeconds: POLL_INTERVAL_MS / 1000,
    lastError: null,
  },
};

let snapshot: PersistedSnapshot = loadSnapshot();
const sseClients = new Set<express.Response>();

function loadSnapshot(): PersistedSnapshot {
  try {
    if (fs.existsSync(SNAPSHOT_PATH)) {
      const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedSnapshot>;
      return {
        initialized: Boolean(parsed.initialized),
        pcPositions: parsed.pcPositions ?? {},
        aredlPositions: parsed.aredlPositions ?? {},
        top10VictorKeys: Array.isArray(parsed.top10VictorKeys) ? parsed.top10VictorKeys : [],
        seenAredlChangelogKeys: Array.isArray(parsed.seenAredlChangelogKeys) ? parsed.seenAredlChangelogKeys : [],
        events: Array.isArray(parsed.events) ? parsed.events : [],
      };
    }
  } catch (err) {
    console.warn('Could not load persisted snapshot, starting fresh:', err);
  }
  return {
    initialized: false,
    pcPositions: {},
    aredlPositions: {},
    top10VictorKeys: [],
    seenAredlChangelogKeys: [],
    events: [],
  };
}

function saveSnapshot(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const trimmed: PersistedSnapshot = {
      ...snapshot,
      seenAredlChangelogKeys: snapshot.seenAredlChangelogKeys.slice(0, 300),
      events: snapshot.events.slice(0, 150),
    };
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not persist snapshot:', err);
  }
}

function broadcastEvent(event: TrackerEvent): void {
  const payload = `event: tracker\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

function pushEvent(event: TrackerEvent, broadcast: boolean): void {
  if (snapshot.events.some((e) => e.id === event.id)) {
    return;
  }
  snapshot.events.unshift(event);
  snapshot.events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  snapshot.events = snapshot.events.slice(0, 150);
  if (broadcast) {
    broadcastEvent(event);
  }
}

async function fetchJson<T>(url: string, timeoutMs = 12_000, retries = 2): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ApexList-DemonTracker/1.0',
        },
        signal: controller.signal,
      });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Exhausted retries for ${url}`);
}

function extractYoutubeThumb(videoUrl: string | null | undefined): string | null {
  if (!videoUrl) return null;
  try {
    const u = new URL(videoUrl);
    let vid: string | null = null;
    if (u.hostname.includes('youtu.be')) {
      vid = u.pathname.replace('/', '').split('/')[0] || null;
    } else if (u.hostname.includes('youtube.com')) {
      vid = u.searchParams.get('v');
      if (!vid && u.pathname.includes('/shorts/')) {
        vid = u.pathname.split('/shorts/')[1]?.split('/')[0] || null;
      }
    }
    return vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : null;
  } catch {
    return null;
  }
}

function isoCountryFromNumeric(code: number | null | undefined): string | null {
  if (!code) return null;
  const map: Record<number, string> = {
    840: 'US',
    826: 'GB',
    124: 'CA',
    276: 'DE',
    250: 'FR',
    724: 'ES',
    643: 'RU',
    804: 'UA',
    616: 'PL',
    528: 'NL',
    752: 'SE',
    578: 'NO',
    246: 'FI',
    36: 'AU',
    554: 'NZ',
    484: 'MX',
    76: 'BR',
    32: 'AR',
    152: 'CL',
    410: 'KR',
    392: 'JP',
    156: 'CN',
    704: 'VN',
    608: 'PH',
    380: 'IT',
    792: 'TR',
  };
  return map[code] ?? null;
}

function normalizePlayerName(name: string): string {
  return name.replace(/^\[[^\]]+\]\s*/, '').trim().toLowerCase();
}

function changelogKey(entry: AredlChangelogEntry): string {
  const actionName = Object.keys(entry.action)[0] ?? 'Update';
  return `${entry.created_at}:${entry.affected_level.id}:${actionName}`;
}

function parseAredlChangelogEvent(entry: AredlChangelogEntry): TrackerEvent | null {
  const actionType = Object.keys(entry.action)[0];
  if (!actionType) return null;
  const details = entry.action[actionType] ?? {};
  const levelName = entry.affected_level.name;
  const levelId = entry.affected_level.level_id ?? null;
  const newPos = typeof details.new_position === 'number' ? details.new_position : null;
  const oldPos = typeof details.old_position === 'number' ? details.old_position : null;
  const id = `aredl-cl-${changelogKey(entry)}`;

  if (actionType === 'Placed') {
    return {
      id,
      type: 'demon_placed',
      source: 'AREDL',
      createdAt: entry.created_at,
      title: `${levelName} placed on AREDL`,
      summary: newPos ? `Entered the leaderboard at #${newPos}` : 'Placed on the AREDL leaderboard',
      levelName,
      levelId,
      newPosition: newPos,
      oldPosition: null,
      playerName: null,
      videoUrl: null,
    };
  }

  if (actionType === 'Raised' || actionType === 'Lowered' || actionType === 'Moved') {
    const dir =
      oldPos && newPos ? (newPos < oldPos ? `Moved up #${oldPos} → #${newPos}` : `Moved down #${oldPos} → #${newPos}`) : 'Position updated';
    return {
      id,
      type: 'demon_updated',
      source: 'AREDL',
      createdAt: entry.created_at,
      title: `${levelName} rank updated`,
      summary: dir,
      levelName,
      levelId,
      newPosition: newPos,
      oldPosition: oldPos,
      playerName: null,
      videoUrl: null,
    };
  }

  return {
    id,
    type: 'demon_updated',
    source: 'AREDL',
    createdAt: entry.created_at,
    title: `${levelName} (${actionType})`,
    summary: newPos ? `Updated at #${newPos}` : `Status changed (${actionType})`,
    levelName,
    levelId,
    newPosition: newPos,
    oldPosition: oldPos,
    playerName: null,
    videoUrl: null,
  };
}

function mergeDemons(
  pcDemons: PcListedDemon[],
  aredlLevels: AredlLevel[],
  recentDeltas: Map<number, number>
): UnifiedDemon[] {
  const byLevelId = new Map<number, UnifiedDemon>();
  const byName = new Map<string, UnifiedDemon>();

  for (const pc of pcDemons) {
    const key = pc.level_id ? `gd:${pc.level_id}` : `pc:${pc.id}`;
    const item: UnifiedDemon = {
      key,
      levelId: pc.level_id,
      name: pc.name,
      pointercrateId: pc.id,
      pointercratePosition: pc.position,
      pointercrateRatedPosition: pc.rated_position,
      aredlId: null,
      aredlPosition: null,
      aredlPoints: null,
      aredlStatus: null,
      rank: pc.position,
      publisher: pc.publisher?.name ?? null,
      verifier: pc.verifier?.name ?? null,
      requirement: pc.requirement,
      video: pc.video,
      thumbnail: pc.thumbnail ?? extractYoutubeThumb(pc.video),
      twoPlayer: false,
      tags: [],
      description: null,
      edelEnjoyment: null,
      gddlTier: null,
      nlwTier: null,
      requiresRawFootage: false,
      rated: pc.rated,
      recentDelta: pc.level_id ? recentDeltas.get(pc.level_id) ?? null : null,
    };
    if (pc.level_id) byLevelId.set(pc.level_id, item);
    byName.set(pc.name.trim().toLowerCase(), item);
  }

  const results: UnifiedDemon[] = [...byLevelId.values()];
  for (const pc of pcDemons) {
    if (!pc.level_id) {
      const existing = byName.get(pc.name.trim().toLowerCase());
      if (existing && !results.includes(existing)) results.push(existing);
    }
  }

  for (const ar of aredlLevels) {
    const existing =
      (ar.level_id ? byLevelId.get(ar.level_id) : undefined) ?? byName.get(ar.name.trim().toLowerCase());
    if (existing) {
      existing.aredlId = ar.id;
      existing.aredlPosition = ar.position;
      existing.aredlPoints = ar.points;
      existing.aredlStatus = ar.status;
      existing.twoPlayer = ar.two_player;
      existing.tags = ar.tags ?? [];
      existing.description = ar.description;
      existing.edelEnjoyment = ar.edel_enjoyment;
      existing.gddlTier = ar.gddl_tier;
      existing.nlwTier = ar.nlw_tier;
      existing.requiresRawFootage = ar.requires_raw_footage;
      if (existing.recentDelta === null && ar.level_id && recentDeltas.has(ar.level_id)) {
        existing.recentDelta = recentDeltas.get(ar.level_id) ?? null;
      }
    } else {
      const item: UnifiedDemon = {
        key: ar.level_id ? `gd:${ar.level_id}` : `aredl:${ar.id}`,
        levelId: ar.level_id ?? null,
        name: ar.name,
        pointercrateId: null,
        pointercratePosition: null,
        pointercrateRatedPosition: null,
        aredlId: ar.id,
        aredlPosition: ar.position,
        aredlPoints: ar.points,
        aredlStatus: ar.status,
        rank: ar.position,
        publisher: null,
        verifier: null,
        requirement: null,
        video: null,
        thumbnail: null,
        twoPlayer: ar.two_player,
        tags: ar.tags ?? [],
        description: ar.description,
        edelEnjoyment: ar.edel_enjoyment,
        gddlTier: ar.gddl_tier,
        nlwTier: ar.nlw_tier,
        requiresRawFootage: ar.requires_raw_footage,
        rated: true,
        recentDelta: ar.level_id ? recentDeltas.get(ar.level_id) ?? null : null,
      };
      results.push(item);
    }
  }

  results.sort((a, b) => {
    const aPos = a.pointercratePosition ?? a.aredlPosition ?? 99999;
    const bPos = b.pointercratePosition ?? b.aredlPosition ?? 99999;
    return aPos - bPos;
  });

  return results;
}

async function fetchTop10Data(
  pcDemons: PcListedDemon[],
  aredlLevels: AredlLevel[]
): Promise<{
  summaries: Top10LevelSummary[];
  victorEvents: { key: string; event: TrackerEvent }[];
}> {
  const pcTop10 = pcDemons.slice(0, 10);
  const aredlByLevelId = new Map<number, AredlLevel>();
  for (const ar of aredlLevels) {
    if (ar.level_id) aredlByLevelId.set(ar.level_id, ar);
  }

  const summaries: Top10LevelSummary[] = [];
  const victorEvents: { key: string; event: TrackerEvent }[] = [];

  const prevByPcId = new Map<number, Top10LevelSummary>();
  for (const prev of cache.top10) {
    if (prev.pointercrateId) prevByPcId.set(prev.pointercrateId, prev);
  }

  // Fetch in polite batches of 2 levels to avoid Pointercrate / AREDL burst rate limits
  for (let i = 0; i < pcTop10.length; i += 2) {
    const batch = pcTop10.slice(i, i + 2);
    await Promise.all(
      batch.map(async (pc) => {
        const ar = pc.level_id ? aredlByLevelId.get(pc.level_id) : undefined;
        const [pcDetailRes, aredlDetailRes, aredlRecordsRes] = await Promise.allSettled([
          fetchJson<{ data: PcFullDemon }>(`https://pointercrate.com/api/v2/demons/${pc.id}/`),
          pc.level_id
            ? fetchJson<AredlLevelDetail>(`https://api.aredl.net/v2/api/aredl/levels/${pc.level_id}`)
            : Promise.reject(new Error('No level_id')),
          pc.level_id
            ? fetchJson<{ data: AredlVerificationOrRecord[] }>(
                `https://api.aredl.net/v2/api/aredl/levels/${pc.level_id}/records?per_page=100`
              )
            : Promise.reject(new Error('No level_id')),
        ]);

        // If both record sources failed due to transient network/rate-limit, keep prior victors
        if (pcDetailRes.status === 'rejected' && aredlRecordsRes.status === 'rejected') {
          const prev = prevByPcId.get(pc.id);
          if (prev) {
            summaries.push({
              ...prev,
              rank: pc.position,
              aredlPoints: ar?.points ?? prev.aredlPoints,
            });
            return;
          }
        }

        const victorMap = new Map<string, DemonVictor>();

        if (pcDetailRes.status === 'fulfilled') {
          const pcRecords = pcDetailRes.value.data.records ?? [];
          for (const rec of pcRecords) {
            if (rec.status !== 'approved' || rec.progress < 100) continue;
            const norm = normalizePlayerName(rec.player.name);
            victorMap.set(norm, {
              id: `pc-rec-${rec.id}`,
              playerName: rec.player.name,
              countryCode: rec.nationality?.country_code ?? null,
              progress: rec.progress,
              video: rec.video,
              achievedAt: null,
              source: 'Pointercrate',
              isVerification: false,
              mobile: false,
            });
          }
        }

        if (aredlDetailRes.status === 'fulfilled') {
          const verifications = aredlDetailRes.value.verifications ?? [];
          for (const v of verifications) {
            const name = v.submitted_by.global_name || v.submitted_by.username;
            const norm = normalizePlayerName(name);
            const existing = victorMap.get(norm);
            if (existing) {
              existing.source = 'Both';
              existing.achievedAt = v.achieved_at ?? v.created_at ?? existing.achievedAt;
              existing.isVerification = true;
              if (!existing.video && v.video_url) existing.video = v.video_url;
            } else {
              victorMap.set(norm, {
                id: `aredl-ver-${v.id}`,
                playerName: name,
                countryCode: isoCountryFromNumeric(v.submitted_by.country),
                progress: 100,
                video: v.hide_video ? null : v.video_url,
                achievedAt: v.achieved_at ?? v.created_at ?? null,
                source: 'AREDL',
                isVerification: true,
                mobile: v.mobile,
              });
            }
          }
        }

        // Always ensure Pointercrate verifier is represented even if AREDL verification wasn't returned
        if (pc.verifier?.name) {
          const verNorm = normalizePlayerName(pc.verifier.name);
          if (!victorMap.has(verNorm)) {
            victorMap.set(verNorm, {
              id: `pc-ver-${pc.id}`,
              playerName: pc.verifier.name,
              countryCode: null,
              progress: 100,
              video: pc.video,
              achievedAt: null,
              source: 'Pointercrate',
              isVerification: true,
              mobile: false,
            });
          }
        }

        if (aredlRecordsRes.status === 'fulfilled') {
          const records = aredlRecordsRes.value.data ?? [];
          for (const r of records) {
            const name = r.submitted_by.global_name || r.submitted_by.username;
            const norm = normalizePlayerName(name);
            const existing = victorMap.get(norm);
            const achieved = r.achieved_at ?? r.created_at ?? null;
            if (existing) {
              existing.source = 'Both';
              if (!existing.achievedAt && achieved) existing.achievedAt = achieved;
              if (!existing.video && !r.hide_video && r.video_url) existing.video = r.video_url;
              if (!existing.countryCode) existing.countryCode = isoCountryFromNumeric(r.submitted_by.country);
            } else {
              victorMap.set(norm, {
                id: `aredl-rec-${r.id}`,
                playerName: name,
                countryCode: isoCountryFromNumeric(r.submitted_by.country),
                progress: 100,
                video: r.hide_video ? null : r.video_url,
                achievedAt: achieved,
                source: 'AREDL',
                isVerification: false,
                mobile: r.mobile,
              });
            }

            if (!existing) {
              const vKey = `${pc.level_id ?? pc.id}:${norm}`;
              victorEvents.push({
                key: vKey,
                event: {
                  id: `victor-${pc.level_id ?? pc.id}-${norm}`,
                  type: 'top10_victor',
                  source: 'AREDL',
                  createdAt: achieved ?? new Date().toISOString(),
                  title: `${name} beat #${pc.position} ${pc.name}`,
                  summary: `100% completion verified on Top 10 level #${pc.position} ${pc.name}`,
                  levelName: pc.name,
                  levelId: pc.level_id,
                  newPosition: pc.position,
                  oldPosition: null,
                  playerName: name,
                  videoUrl: r.hide_video ? null : r.video_url,
                },
              });
            }
          }
        }

        // Also track all Pointercrate-approved 100% victors for diffing
        for (const [norm, v] of victorMap.entries()) {
          if (!v.isVerification) {
            const vKey = `${pc.level_id ?? pc.id}:${norm}`;
            if (!victorEvents.some((item) => item.key === vKey)) {
              victorEvents.push({
                key: vKey,
                event: {
                  id: `victor-${pc.level_id ?? pc.id}-${norm}`,
                  type: 'top10_victor',
                  source: v.source === 'Both' ? 'Pointercrate' : v.source,
                  createdAt: v.achievedAt ?? new Date().toISOString(),
                  title: `${v.playerName} beat #${pc.position} ${pc.name}`,
                  summary: `100% completion approved on Top 10 level #${pc.position} ${pc.name}`,
                  levelName: pc.name,
                  levelId: pc.level_id,
                  newPosition: pc.position,
                  oldPosition: null,
                  playerName: v.playerName,
                  videoUrl: v.video,
                },
              });
            }
          }
        }

        const victors = [...victorMap.values()].sort((a, b) => {
          if (a.isVerification !== b.isVerification) return a.isVerification ? -1 : 1;
          if (a.achievedAt && b.achievedAt) {
            return new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime();
          }
          return a.playerName.localeCompare(b.playerName);
        });

        summaries.push({
          rank: pc.position,
          levelId: pc.level_id,
          pointercrateId: pc.id,
          aredlId: ar?.id ?? null,
          name: pc.name,
          publisher: pc.publisher?.name ?? null,
          verifier: pc.verifier?.name ?? null,
          requirement: pc.requirement,
          thumbnail: pc.thumbnail ?? extractYoutubeThumb(pc.video),
          video: pc.video,
          aredlPoints: ar?.points ?? null,
          victorCount: victors.filter((v) => !v.isVerification).length,
          victors,
        });
      })
    );
    if (i + 2 < pcTop10.length) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  summaries.sort((a, b) => a.rank - b.rank);
  return { summaries, victorEvents };
}

async function syncAllSources(manual = false): Promise<{ newEvents: TrackerEvent[] }> {
  if (cache.status.isSyncing) {
    return { newEvents: [] };
  }

  cache.status.isSyncing = true;
  const newEvents: TrackerEvent[] = [];

  try {
    const [pcPage1Res, pcPage2Res, aredlLevelsRes, aredlChangelogRes, aredlClP2Res, aredlClP3Res, pcPlayersRes, aredlPlayersRes] =
      await Promise.allSettled([
        fetchJson<PcListedDemon[]>('https://pointercrate.com/api/v2/demons/listed/?limit=100'),
        fetchJson<PcListedDemon[]>('https://pointercrate.com/api/v2/demons/listed/?limit=100&after=100'),
        fetchJson<AredlLevel[]>('https://api.aredl.net/v2/api/aredl/levels'),
        fetchJson<{ data: AredlChangelogEntry[] }>('https://api.aredl.net/v2/api/aredl/changelog?page=1&per_page=100'),
        fetchJson<{ data: AredlChangelogEntry[] }>('https://api.aredl.net/v2/api/aredl/changelog?page=2&per_page=100'),
        fetchJson<{ data: AredlChangelogEntry[] }>('https://api.aredl.net/v2/api/aredl/changelog?page=3&per_page=100'),
        fetchJson<
          Array<{
            id: number;
            name: string;
            rank: number;
            score: number;
            nationality?: { country_code?: string; nation?: string } | null;
          }>
        >('https://pointercrate.com/api/v1/players/ranking/?limit=100&list=demonlist'),
        fetchJson<{
          data: Array<{
            rank: number;
            total_points: number;
            extremes: number;
            user: AredlUserRef;
            hardest?: { name: string } | null;
          }>;
        }>('https://api.aredl.net/v2/api/aredl/leaderboard?per_page=100'),
      ]);

    const rawPcDemons: PcListedDemon[] = [];
    if (pcPage1Res.status === 'fulfilled') rawPcDemons.push(...pcPage1Res.value);
    if (pcPage2Res.status === 'fulfilled') rawPcDemons.push(...pcPage2Res.value);

    // Ensure we captured all Classic Top 150 rated demons even if >50 unrated levels appear in Rated+
    if (rawPcDemons.length > 0) {
      const maxRatedPos = rawPcDemons.reduce((max, d) => Math.max(max, d.rated_position ?? 0), 0);
      if (maxRatedPos < 150) {
        const lastPos = rawPcDemons[rawPcDemons.length - 1]?.position ?? 200;
        try {
          const pcPage3 = await fetchJson<PcListedDemon[]>(
            `https://pointercrate.com/api/v2/demons/listed/?limit=100&after=${lastPos}`
          );
          rawPcDemons.push(...pcPage3);
        } catch {
          // ignore fallback page error
        }
      }
    }

    const classicPcDemons: PcListedDemon[] = rawPcDemons
      .filter(
        (d): d is PcListedDemon & { rated_position: number } =>
          Boolean(d.rated) && d.rated_position !== null && d.rated_position >= 1 && d.rated_position <= 150
      )
      .sort((a, b) => a.rated_position - b.rated_position)
      .map((d) => ({
        ...d,
        position: d.rated_position,
      }));

    if (classicPcDemons.length > 0) {
      cache.pcDemons = classicPcDemons;
    }

    if (aredlLevelsRes.status === 'fulfilled') {
      cache.aredlLevels = aredlLevelsRes.value;
    }

    const recentDeltas = new Map<number, number>();
    const aredlChangelog = aredlChangelogRes.status === 'fulfilled' ? aredlChangelogRes.value.data ?? [] : [];
    const allAredlChangelog = [
      ...aredlChangelog,
      ...(aredlClP2Res.status === 'fulfilled' ? aredlClP2Res.value.data ?? [] : []),
      ...(aredlClP3Res.status === 'fulfilled' ? aredlClP3Res.value.data ?? [] : []),
    ];

    const aredlCalEvents: CalendarEvent[] = [];
    for (const entry of allAredlChangelog) {
      const parsed = parseAredlChangelogEvent(entry);
      if (!parsed) continue;
      aredlCalEvents.push({
        id: `cal-${parsed.id}`,
        dateKey: parsed.createdAt.slice(0, 10),
        timestamp: parsed.createdAt,
        category: parsed.type === 'demon_placed' ? 'aredl_placed' : 'aredl_updated',
        source: 'AREDL',
        title: parsed.title,
        summary: parsed.summary,
        levelName: parsed.levelName,
        levelId: parsed.levelId,
        pointercrateId: null,
        playerName: null,
        newPosition: parsed.newPosition,
        oldPosition: parsed.oldPosition,
        videoUrl: null,
      });
    }
    cache.aredlCalendarEvents = aredlCalEvents;

    for (const entry of aredlChangelog) {
      const lvlId = entry.affected_level.level_id;
      if (!lvlId || recentDeltas.has(lvlId)) continue;
      const action = entry.action.Raised ?? entry.action.Lowered ?? entry.action.Moved;
      if (action && typeof action.old_position === 'number' && typeof action.new_position === 'number') {
        recentDeltas.set(lvlId, action.old_position - action.new_position);
      }
    }

    cache.unifiedDemons = mergeDemons(cache.pcDemons, cache.aredlLevels, recentDeltas);

    if (pcPlayersRes.status === 'fulfilled') {
      cache.pcPlayers = pcPlayersRes.value.map((p) => ({
        rank: p.rank,
        id: `pc-${p.id}`,
        name: p.name,
        score: Math.round(p.score * 100) / 100,
        countryCode: p.nationality?.country_code ?? null,
        countryName: p.nationality?.nation ?? null,
        hardestLevel: null,
        extremesCount: null,
        source: 'Pointercrate',
      }));
    }

    if (aredlPlayersRes.status === 'fulfilled') {
      cache.aredlPlayers = (aredlPlayersRes.value.data ?? []).map((p) => ({
        rank: p.rank,
        id: `aredl-${p.user.id}`,
        name: p.user.global_name || p.user.username,
        score: p.total_points,
        countryCode: isoCountryFromNumeric(p.user.country),
        countryName: null,
        hardestLevel: p.hardest?.name ?? null,
        extremesCount: p.extremes,
        source: 'AREDL',
      }));
    }

    const { summaries, victorEvents } = await fetchTop10Data(cache.pcDemons, cache.aredlLevels);
    if (summaries.length > 0) {
      cache.top10 = summaries;
    }

    // Diffing & Event Generation
    const isInitial = !snapshot.initialized;
    const isMigratingFromRatedPlus = Object.keys(snapshot.pcPositions).length > 150;
    const nextPcPositions: PersistedSnapshot['pcPositions'] = {};
    for (const d of cache.pcDemons) {
      const idStr = String(d.id);
      nextPcPositions[idStr] = { position: d.position, requirement: d.requirement, name: d.name };

      if (!isInitial && !isMigratingFromRatedPlus) {
        const prev = snapshot.pcPositions[idStr];
        if (!prev) {
          const ev: TrackerEvent = {
            id: `pc-placed-${d.id}-${Date.now()}`,
            type: 'demon_placed',
            source: 'Pointercrate',
            createdAt: new Date().toISOString(),
            title: `${d.name} placed on Pointercrate`,
            summary: `Placed at #${d.position} (${d.requirement}% list req) · Verified by ${d.verifier?.name ?? 'Unknown'}`,
            levelName: d.name,
            levelId: d.level_id,
            newPosition: d.position,
            oldPosition: null,
            playerName: d.verifier?.name ?? null,
            videoUrl: d.video,
          };
          pushEvent(ev, true);
          newEvents.push(ev);
        } else if (prev.position !== d.position || prev.requirement !== d.requirement) {
          const changes: string[] = [];
          if (prev.position !== d.position) {
            changes.push(
              d.position < prev.position
                ? `Moved up #${prev.position} → #${d.position}`
                : `Moved down #${prev.position} → #${d.position}`
            );
          }
          if (prev.requirement !== d.requirement) {
            changes.push(`Requirement ${prev.requirement}% → ${d.requirement}%`);
          }
          const ev: TrackerEvent = {
            id: `pc-upd-${d.id}-${d.position}-${Date.now()}`,
            type: 'demon_updated',
            source: 'Pointercrate',
            createdAt: new Date().toISOString(),
            title: `${d.name} updated on Pointercrate`,
            summary: changes.join(' · '),
            levelName: d.name,
            levelId: d.level_id,
            newPosition: d.position,
            oldPosition: prev.position,
            playerName: null,
            videoUrl: d.video,
          };
          pushEvent(ev, true);
          newEvents.push(ev);
        }
      }
    }

    const nextAredlPositions: PersistedSnapshot['aredlPositions'] = {};
    for (const ar of cache.aredlLevels) {
      nextAredlPositions[ar.id] = { position: ar.position, status: ar.status, name: ar.name };
    }

    // Check AREDL changelog entries
    for (const entry of aredlChangelog) {
      const key = changelogKey(entry);
      if (!snapshot.seenAredlChangelogKeys.includes(key)) {
        snapshot.seenAredlChangelogKeys.unshift(key);
        const ev = parseAredlChangelogEvent(entry);
        if (ev) {
          pushEvent(ev, !isInitial);
          if (!isInitial) newEvents.push(ev);
        }
      }
    }

    // Check Top 10 Victors
    const prevVictorSet = new Set(snapshot.top10VictorKeys);
    const nextVictorSet = new Set(snapshot.top10VictorKeys);

    for (const item of victorEvents) {
      nextVictorSet.add(item.key);
      if (isInitial) {
        // Seed recent dated AREDL Top 10 completions into initial changelog
        if (item.event.source === 'AREDL' && item.event.createdAt) {
          pushEvent(item.event, false);
        }
      } else if (!prevVictorSet.has(item.key)) {
        const liveEv: TrackerEvent = {
          ...item.event,
          id: `${item.event.id}-${Date.now()}`,
          createdAt: new Date().toISOString(),
        };
        pushEvent(liveEv, true);
        newEvents.push(liveEv);
      }
    }

    snapshot.initialized = true;
    snapshot.pcPositions = nextPcPositions;
    snapshot.aredlPositions = nextAredlPositions;
    snapshot.top10VictorKeys = [...nextVictorSet];
    saveSnapshot();

    cache.status.lastSyncedAt = new Date().toISOString();
    cache.status.pointercrateCount = cache.pcDemons.length;
    cache.status.aredlCount = cache.aredlLevels.length;
    cache.status.top10VictorCount = cache.top10.reduce((sum, l) => sum + l.victorCount, 0);
    cache.status.lastError = null;

    if (manual) {
      console.log(
        `[Sync] Completed manual sync: ${cache.pcDemons.length} PC, ${cache.aredlLevels.length} AREDL, ${newEvents.length} new events`
      );
    }

    return { newEvents };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown sync error';
    cache.status.lastError = message;
    console.error('[Sync] Error polling demonlist APIs:', message);
    return { newEvents };
  } finally {
    cache.status.isSyncing = false;
  }
}

async function getDemonDetail(keyParam: string): Promise<DemonDetail | null> {
  const cached = cache.detailCache.get(keyParam);
  if (cached && Date.now() - cached.fetchedAt < 120_000) {
    return cached.detail;
  }

  const base = cache.unifiedDemons.find(
    (d) =>
      d.key === keyParam ||
      String(d.levelId) === keyParam ||
      String(d.pointercrateId) === keyParam ||
      d.aredlId === keyParam
  );

  if (!base) return null;

  const [pcRes, aredlRes, aredlRecordsRes] = await Promise.allSettled([
    base.pointercrateId
      ? fetchJson<{ data: PcFullDemon }>(`https://pointercrate.com/api/v2/demons/${base.pointercrateId}/`)
      : Promise.reject(new Error('No PC ID')),
    base.levelId
      ? fetchJson<AredlLevelDetail>(`https://api.aredl.net/v2/api/aredl/levels/${base.levelId}`)
      : Promise.reject(new Error('No GD Level ID')),
    base.levelId
      ? fetchJson<{ data: AredlVerificationOrRecord[] }>(
          `https://api.aredl.net/v2/api/aredl/levels/${base.levelId}/records?per_page=100`
        )
      : Promise.reject(new Error('No GD Level ID')),
  ]);

  const creatorsSet = new Set<string>();
  const victorMap = new Map<string, DemonVictor>();
  let video = base.video;
  let thumbnail = base.thumbnail;
  let publisher = base.publisher;
  let verifier = base.verifier;
  let songId: number | null = null;

  if (pcRes.status === 'fulfilled') {
    const pc = pcRes.value.data;
    if (pc.video) video = pc.video;
    if (pc.thumbnail) thumbnail = pc.thumbnail;
    if (pc.publisher?.name) publisher = pc.publisher.name;
    if (pc.verifier?.name) verifier = pc.verifier.name;
    for (const c of pc.creators ?? []) {
      creatorsSet.add(c.name);
    }
    for (const r of pc.records ?? []) {
      if (r.status !== 'approved') continue;
      const norm = normalizePlayerName(r.player.name);
      victorMap.set(norm, {
        id: `pc-rec-${r.id}`,
        playerName: r.player.name,
        countryCode: r.nationality?.country_code ?? null,
        progress: r.progress,
        video: r.video,
        achievedAt: null,
        source: 'Pointercrate',
        isVerification: false,
        mobile: false,
      });
    }
  }

  if (aredlRes.status === 'fulfilled') {
    const ar = aredlRes.value;
    songId = ar.song ?? null;
    if (!publisher && ar.publisher) {
      publisher = ar.publisher.global_name || ar.publisher.username;
    }
    for (const c of ar.creators ?? []) {
      creatorsSet.add(c.global_name || c.username);
    }
    for (const v of ar.verifications ?? []) {
      const name = v.submitted_by.global_name || v.submitted_by.username;
      if (!verifier) verifier = name;
      if (!video && v.video_url) video = v.video_url;
      if (!thumbnail && v.video_url) thumbnail = extractYoutubeThumb(v.video_url);
      const norm = normalizePlayerName(name);
      const existing = victorMap.get(norm);
      if (existing) {
        existing.source = 'Both';
        existing.isVerification = true;
        existing.achievedAt = v.achieved_at ?? v.created_at ?? existing.achievedAt;
      } else {
        victorMap.set(norm, {
          id: `aredl-ver-${v.id}`,
          playerName: name,
          countryCode: isoCountryFromNumeric(v.submitted_by.country),
          progress: 100,
          video: v.hide_video ? null : v.video_url,
          achievedAt: v.achieved_at ?? v.created_at ?? null,
          source: 'AREDL',
          isVerification: true,
          mobile: v.mobile,
        });
      }
    }
  }

  if (aredlRecordsRes.status === 'fulfilled') {
    for (const r of aredlRecordsRes.value.data ?? []) {
      const name = r.submitted_by.global_name || r.submitted_by.username;
      const norm = normalizePlayerName(name);
      const existing = victorMap.get(norm);
      const achieved = r.achieved_at ?? r.created_at ?? null;
      if (existing) {
        existing.source = 'Both';
        if (!existing.achievedAt && achieved) existing.achievedAt = achieved;
        if (!existing.video && !r.hide_video && r.video_url) existing.video = r.video_url;
      } else {
        victorMap.set(norm, {
          id: `aredl-rec-${r.id}`,
          playerName: name,
          countryCode: isoCountryFromNumeric(r.submitted_by.country),
          progress: 100,
          video: r.hide_video ? null : r.video_url,
          achievedAt: achieved,
          source: 'AREDL',
          isVerification: false,
          mobile: r.mobile,
        });
      }
    }
  }

  const victors = [...victorMap.values()].sort((a, b) => {
    if (a.isVerification !== b.isVerification) return a.isVerification ? -1 : 1;
    if (b.progress !== a.progress) return b.progress - a.progress;
    if (a.achievedAt && b.achievedAt) {
      return new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime();
    }
    return a.playerName.localeCompare(b.playerName);
  });

  const detail: DemonDetail = {
    ...base,
    video,
    thumbnail,
    publisher,
    verifier,
    creators: [...creatorsSet],
    victors,
    songId,
  };

  cache.detailCache.set(keyParam, { fetchedAt: Date.now(), detail });
  return detail;
}

interface PcTimeEntry {
  id: number;
  pos: number;
  name: string;
}

const pcDaySnapshotCache = new Map<string, PcTimeEntry[]>();
const pcMonthInFlight = new Set<string>();

function addDaysUtc(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

async function fetchPointercrateSnapshotAt(dateKey: string): Promise<PcTimeEntry[]> {
  const existing = pcDaySnapshotCache.get(dateKey);
  if (existing) return existing;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch('https://pointercrate.com/demonlist/', {
      headers: {
        Cookie: `when=${dateKey}T23:59:59%2B00:00`,
        'User-Agent': 'ApexList-DemonTracker/1.0',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const entries: PcTimeEntry[] = [];
    const seen = new Set<number>();
    const regex = /<a href="\/demonlist\/permalink\/(\d+)\/">#(\d+) - ([^<]+)<br>/g;
    let match: RegExpExecArray | null = regex.exec(html);
    while (match !== null) {
      const id = Number(match[1]);
      const pos = Number(match[2]);
      const name = match[3].trim();
      if (pos <= 150 && !seen.has(id)) {
        seen.add(id);
        entries.push({ id, pos, name });
      }
      match = regex.exec(html);
    }
    pcDaySnapshotCache.set(dateKey, entries);
    return entries;
  } finally {
    clearTimeout(timer);
  }
}

function snapshotsEqual(a: PcTimeEntry[], b: PcTimeEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].pos !== b[i].pos) return false;
  }
  return true;
}

function diffPointercrateDay(dateKey: string, prev: PcTimeEntry[], curr: PcTimeEntry[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const prevById = new Map<number, PcTimeEntry>();
  for (const item of prev) prevById.set(item.id, item);

  const currById = new Map<number, PcTimeEntry>();
  for (const item of curr) currById.set(item.id, item);

  const lookupDemon = (pcId: number) =>
    cache.unifiedDemons.find((d) => d.pointercrateId === pcId) ?? null;

  // 1. Newly placed demons
  for (const item of curr) {
    if (!prevById.has(item.id)) {
      const unified = lookupDemon(item.id);
      events.push({
        id: `pc-tm-placed-${item.id}-${dateKey}`,
        dateKey,
        timestamp: `${dateKey}T18:00:00.000Z`,
        category: 'pc_placed',
        source: 'Pointercrate',
        title: `${item.name} placed on Pointercrate`,
        summary: `Placed at #${item.pos} on Pointercrate Demonlist`,
        levelName: item.name,
        levelId: unified?.levelId ?? null,
        pointercrateId: item.id,
        playerName: unified?.verifier ?? null,
        newPosition: item.pos,
        oldPosition: null,
        videoUrl: unified?.video ?? null,
      });
    }
  }

  // 2. Detect genuine re-ranks (exclude pure cascade shifts caused by placements/removals)
  const commonPrev = prev.filter((item) => currById.has(item.id));
  const commonCurr = curr.filter((item) => prevById.has(item.id));
  const commonPrevOrder = new Map<number, number>();
  commonPrev.forEach((item, idx) => commonPrevOrder.set(item.id, idx));

  const movedIds: { item: PcTimeEntry; oldPos: number; deltaOrder: number }[] = [];
  commonCurr.forEach((item, idx) => {
    const prevIdx = commonPrevOrder.get(item.id) ?? idx;
    const oldItem = prevById.get(item.id);
    if (oldItem && Math.abs(idx - prevIdx) >= 1) {
      movedIds.push({ item, oldPos: oldItem.pos, deltaOrder: prevIdx - idx });
    }
  });

  // Only report top genuine movers if a small set of levels changed relative order
  if (movedIds.length > 0 && movedIds.length <= 12) {
    // Pick the primary mover(s) with largest order displacement
    movedIds.sort((a, b) => Math.abs(b.deltaOrder) - Math.abs(a.deltaOrder));
    const maxShift = Math.abs(movedIds[0].deltaOrder);
    for (const m of movedIds) {
      if (Math.abs(m.deltaOrder) < Math.max(1, Math.floor(maxShift / 2))) continue;
      const unified = lookupDemon(m.item.id);
      const dir = m.item.pos < m.oldPos ? `Moved up #${m.oldPos} → #${m.item.pos}` : `Moved down #${m.oldPos} → #${m.item.pos}`;
      events.push({
        id: `pc-tm-upd-${m.item.id}-${dateKey}`,
        dateKey,
        timestamp: `${dateKey}T18:00:00.000Z`,
        category: 'pc_updated',
        source: 'Pointercrate',
        title: `${m.item.name} rank updated`,
        summary: dir,
        levelName: m.item.name,
        levelId: unified?.levelId ?? null,
        pointercrateId: m.item.id,
        playerName: null,
        newPosition: m.item.pos,
        oldPosition: m.oldPos,
        videoUrl: unified?.video ?? null,
      });
    }
  }

  return events;
}

async function scanPointercrateMonth(yearMonth: string): Promise<CalendarEvent[]> {
  const [yStr, mStr] = yearMonth.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const now = new Date();
  const currentMonthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const todayStr = now.toISOString().slice(0, 10);

  // Future months have no Pointercrate history
  if (yearMonth > currentMonthStr) return [];

  const firstDay = `${yearMonth}-01`;
  const baselineDay = addDaysUtc(firstDay, -1);
  const lastDayOfMonthDate = new Date(Date.UTC(year, month, 0));
  const monthEndStr = lastDayOfMonthDate.toISOString().slice(0, 10);
  const endDay = yearMonth === currentMonthStr && todayStr < monthEndStr ? todayStr : monthEndStr;

  const days: string[] = [baselineDay];
  let cursor = firstDay;
  while (cursor <= endDay) {
    days.push(cursor);
    cursor = addDaysUtc(cursor, 1);
  }

  const results: CalendarEvent[] = [];

  async function scanRange(startIdx: number, endIdx: number): Promise<void> {
    if (endIdx <= startIdx) return;
    const snapA = await fetchPointercrateSnapshotAt(days[startIdx]);
    const snapB = await fetchPointercrateSnapshotAt(days[endIdx]);
    if (snapshotsEqual(snapA, snapB)) return;

    if (endIdx - startIdx === 1) {
      results.push(...diffPointercrateDay(days[endIdx], snapA, snapB));
      return;
    }

    const midIdx = Math.floor((startIdx + endIdx) / 2);
    await scanRange(startIdx, midIdx);
    await scanRange(midIdx, endIdx);
  }

  await scanRange(0, days.length - 1);
  return results;
}

async function ensurePointercrateMonth(
  yearMonth: string
): Promise<{ events: CalendarEvent[]; scanning: boolean }> {
  const now = new Date();
  const currentMonthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const maxAgeMs = yearMonth === currentMonthStr ? 15 * 60_000 : 30 * 24 * 60 * 60_000;

  const mem = cache.pcMonthCache.get(yearMonth);
  if (mem && Date.now() - mem.fetchedAt < maxAgeMs) {
    return { events: mem.events, scanning: mem.scanning };
  }

  const diskPath = path.join(DATA_DIR, `pc-calendar-${yearMonth}.json`);
  try {
    if (fs.existsSync(diskPath)) {
      const raw = JSON.parse(fs.readFileSync(diskPath, 'utf8')) as {
        fetchedAt: number;
        events: CalendarEvent[];
      };
      if (Date.now() - raw.fetchedAt < maxAgeMs) {
        cache.pcMonthCache.set(yearMonth, {
          fetchedAt: raw.fetchedAt,
          events: raw.events,
          scanning: false,
        });
        return { events: raw.events, scanning: false };
      }
    }
  } catch {
    // ignore disk read errors
  }

  if (!pcMonthInFlight.has(yearMonth)) {
    pcMonthInFlight.add(yearMonth);
    cache.pcMonthCache.set(yearMonth, {
      fetchedAt: mem?.fetchedAt ?? 0,
      events: mem?.events ?? [],
      scanning: true,
    });

    void scanPointercrateMonth(yearMonth)
      .then((events) => {
        const fetchedAt = Date.now();
        cache.pcMonthCache.set(yearMonth, { fetchedAt, events, scanning: false });
        try {
          if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
          fs.writeFileSync(diskPath, JSON.stringify({ fetchedAt, events }, null, 2), 'utf8');
        } catch {
          // ignore disk write error
        }
      })
      .catch((err) => {
        console.warn(`[Calendar] Pointercrate scan failed for ${yearMonth}:`, err);
        cache.pcMonthCache.set(yearMonth, {
          fetchedAt: Date.now(),
          events: mem?.events ?? [],
          scanning: false,
        });
      })
      .finally(() => {
        pcMonthInFlight.delete(yearMonth);
      });
  }

  return { events: mem?.events ?? [], scanning: true };
}


async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Start initial background sync right away
  void syncAllSources(false);
  setInterval(() => {
    void syncAllSources(false);
  }, POLL_INTERVAL_MS);

  app.get('/api/status', (_req, res) => {
    res.json(cache.status);
  });

  app.get('/api/demons', (req, res) => {
    const source = (req.query.source as ListSource) || 'all';
    const tier = (req.query.tier as ListTier) || 'all';
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit ?? 50) || 50));

    let list = cache.unifiedDemons.filter((d) => {
      if (source === 'pointercrate' && d.pointercratePosition === null) return false;
      if (source === 'aredl' && d.aredlPosition === null) return false;

      const pos =
        source === 'pointercrate'
          ? d.pointercratePosition
          : source === 'aredl'
          ? d.aredlPosition
          : d.pointercratePosition ?? d.aredlPosition;

      if (pos === null) return false;
      if (tier === 'top10' && pos > 10) return false;
      if (tier === 'main' && (pos < 1 || pos > 75)) return false;
      if (tier === 'extended' && (pos < 76 || pos > 150)) return false;
      if (tier === 'legacy') {
        if (source === 'pointercrate') return false;
        if (pos <= 150) return false;
      }

      if (q) {
        const matchName = d.name.toLowerCase().includes(q);
        const matchPublisher = (d.publisher ?? '').toLowerCase().includes(q);
        const matchVerifier = (d.verifier ?? '').toLowerCase().includes(q);
        const matchLevelId = d.levelId ? String(d.levelId).includes(q) : false;
        const matchTag = d.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchName && !matchPublisher && !matchVerifier && !matchLevelId && !matchTag) return false;
      }

      return true;
    });

    list = list
      .map((d) => ({
        ...d,
        rank:
          source === 'pointercrate'
            ? d.pointercratePosition ?? 99999
            : source === 'aredl'
            ? d.aredlPosition ?? 99999
            : d.pointercratePosition ?? d.aredlPosition ?? 99999,
      }))
      .sort((a, b) => a.rank - b.rank);

    const total = list.length;
    const start = (page - 1) * limit;
    const items = list.slice(start, start + limit);

    res.json({
      items,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      status: cache.status,
    });
  });

  app.get('/api/demons/:key', async (req, res) => {
    try {
      const detail = await getDemonDetail(decodeURIComponent(req.params.key));
      if (!detail) {
        res.status(404).json({ error: 'Demon not found' });
        return;
      }
      res.json(detail);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch demon detail' });
    }
  });

  app.get('/api/top10', (_req, res) => {
    res.json({
      levels: cache.top10,
      status: cache.status,
    });
  });

  app.get('/api/players', (req, res) => {
    const source = String(req.query.source ?? 'pointercrate');
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const list = source === 'aredl' ? cache.aredlPlayers : cache.pcPlayers;
    const filtered = q
      ? list.filter((p) => p.name.toLowerCase().includes(q) || (p.hardestLevel ?? '').toLowerCase().includes(q))
      : list;
    res.json({
      items: filtered,
      source,
    });
  });

  app.get('/api/events', (req, res) => {
    const type = String(req.query.type ?? 'all');
    const source = String(req.query.source ?? 'all');
    const filtered = snapshot.events.filter((ev) => {
      if (type !== 'all' && ev.type !== type) return false;
      if (source !== 'all' && ev.source.toLowerCase() !== source.toLowerCase()) return false;
      return true;
    });
    res.json({
      events: filtered,
      status: cache.status,
    });
  });

  app.get('/api/calendar', async (req, res) => {
    const rawMonth = String(req.query.month ?? '').trim();
    const now = new Date();
    const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const month = /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : defaultMonth;

    // Trigger background Pointercrate Time Machine scan if not cached yet
    const pcData = await ensurePointercrateMonth(month);

    const events: CalendarEvent[] = [];
    const seenIds = new Set<string>();

    const addCalEvent = (ev: CalendarEvent) => {
      if (!ev.dateKey.startsWith(month)) return;
      if (seenIds.has(ev.id)) return;
      seenIds.add(ev.id);
      events.push(ev);
    };

    // 1. Pointercrate placements & re-ranks discovered via Time Machine
    for (const ev of pcData.events) {
      addCalEvent(ev);
    }

    // 2. Top 10 dated victors & verifications
    for (const lvl of cache.top10) {
      for (const v of lvl.victors) {
        if (!v.achievedAt) continue;
        const dateKey = v.achievedAt.slice(0, 10);
        if (!dateKey.startsWith(month)) continue;
        addCalEvent({
          id: `cal-t10-${lvl.levelId ?? lvl.pointercrateId}-${normalizePlayerName(v.playerName)}-${dateKey}`,
          dateKey,
          timestamp: v.achievedAt,
          category: 'top10_victor',
          source: v.source === 'Both' ? 'Pointercrate' : v.source,
          title: v.isVerification
            ? `${v.playerName} verified #${lvl.rank} ${lvl.name}`
            : `${v.playerName} beat #${lvl.rank} ${lvl.name}`,
          summary: v.isVerification
            ? `Verification completion on Top 10 level #${lvl.rank} ${lvl.name}`
            : `100% Top 10 completion on #${lvl.rank} ${lvl.name}`,
          levelName: lvl.name,
          levelId: lvl.levelId,
          pointercrateId: lvl.pointercrateId,
          playerName: v.playerName,
          newPosition: lvl.rank,
          oldPosition: null,
          videoUrl: v.video,
        });
      }
    }

    // 3. Live-detected events from snapshot (new Pointercrate/Top 10 events since boot)
    for (const ev of snapshot.events) {
      if (ev.isTest) continue;
      const dateKey = ev.createdAt.slice(0, 10);
      if (!dateKey.startsWith(month)) continue;
      if (ev.type === 'top10_victor') {
        const lvlMatch = cache.top10.find((l) => l.levelId === ev.levelId || l.name === ev.levelName);
        addCalEvent({
          id: `cal-snap-${ev.id}`,
          dateKey,
          timestamp: ev.createdAt,
          category: 'top10_victor',
          source: ev.source,
          title: ev.title,
          summary: ev.summary,
          levelName: ev.levelName,
          levelId: ev.levelId,
          pointercrateId: lvlMatch?.pointercrateId ?? null,
          playerName: ev.playerName,
          newPosition: ev.newPosition,
          oldPosition: ev.oldPosition,
          videoUrl: ev.videoUrl,
        });
      } else if (ev.source === 'Pointercrate') {
        addCalEvent({
          id: `cal-snap-${ev.id}`,
          dateKey,
          timestamp: ev.createdAt,
          category: ev.type === 'demon_placed' ? 'pc_placed' : 'pc_updated',
          source: 'Pointercrate',
          title: ev.title,
          summary: ev.summary,
          levelName: ev.levelName,
          levelId: ev.levelId,
          pointercrateId: null,
          playerName: ev.playerName,
          newPosition: ev.newPosition,
          oldPosition: ev.oldPosition,
          videoUrl: ev.videoUrl,
        });
      }
    }

    // 4. AREDL changelog events
    for (const ev of cache.aredlCalendarEvents) {
      addCalEvent(ev);
    }

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const payload: CalendarMonthResponse = {
      month,
      events,
      pointercrateReady: !pcData.scanning,
      scanning: pcData.scanning,
    };
    res.json(payload);
  });

  app.get('/api/events/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);
    sseClients.add(res);

    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 25_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  app.post('/api/sync', async (_req, res) => {
    const result = await syncAllSources(true);
    res.json({
      ok: true,
      newEvents: result.newEvents,
      status: cache.status,
    });
  });

  app.post('/api/notifications/test', (req, res) => {
    const kind = String(req.body?.kind ?? 'top10_victor');
    const top1 = cache.top10[0];
    const levelName = top1?.name ?? 'GRIEF';
    const levelId = top1?.levelId ?? 149992717;

    let ev: TrackerEvent;
    if (kind === 'demon_placed') {
      ev = {
        id: `test-placed-${Date.now()}`,
        type: 'demon_placed',
        source: 'Pointercrate',
        createdAt: new Date().toISOString(),
        title: `Test Alert · New demon placed at #12`,
        summary: 'Sample placement notification for live leaderboard monitoring.',
        levelName: 'Sample Demon',
        levelId,
        newPosition: 12,
        oldPosition: null,
        playerName: 'Verifier',
        videoUrl: top1?.video ?? null,
        isTest: true,
      };
    } else if (kind === 'demon_updated') {
      ev = {
        id: `test-upd-${Date.now()}`,
        type: 'demon_updated',
        source: 'AREDL',
        createdAt: new Date().toISOString(),
        title: `Test Alert · ${levelName} rank updated`,
        summary: 'Moved up #3 → #1 on AREDL leaderboard.',
        levelName,
        levelId,
        newPosition: 1,
        oldPosition: 3,
        playerName: null,
        videoUrl: top1?.video ?? null,
        isTest: true,
      };
    } else {
      ev = {
        id: `test-victor-${Date.now()}`,
        type: 'top10_victor',
        source: 'Pointercrate',
        createdAt: new Date().toISOString(),
        title: `Test Alert · Zoink beat #1 ${levelName}`,
        summary: `100% completion verified on Top 10 level #1 ${levelName}.`,
        levelName,
        levelId,
        newPosition: 1,
        oldPosition: null,
        playerName: '[67] Zoink',
        videoUrl: top1?.video ?? null,
        isTest: true,
      };
    }

    pushEvent(ev, true);
    res.json({ ok: true, event: ev });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ApexList server running at http://0.0.0.0:${PORT}`);
  });
}

void startServer();
