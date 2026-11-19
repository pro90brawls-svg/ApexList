import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Crown,
  ExternalLink,
  ListOrdered,
  Menu,
  RefreshCw,
  Search,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { CalendarView } from './components/CalendarView';
import { ChangelogView } from './components/ChangelogView';
import { DemonDetailModal } from './components/DemonDetailModal';
import { DemonThumbnail } from './components/DemonThumbnail';
import { NotificationDrawer } from './components/NotificationDrawer';
import { PlayersView } from './components/PlayersView';
import { Top10WatchView } from './components/Top10WatchView';
import type {
  ListSource,
  ListTier,
  NotificationSettings,
  RankedPlayer,
  SyncStatus,
  Top10LevelSummary,
  TrackerEvent,
  UnifiedDemon,
} from './types';
import {
  formatRelativeTime,
  loadNotificationSettings,
  playNotificationChime,
  saveNotificationSettings,
  sendBrowserNotification,
  shouldTriggerForEvent,
} from './utils/notifications';

type ActiveView = 'demonlist' | 'top10' | 'calendar' | 'changelog' | 'players';

interface ToastItem {
  id: string;
  event: TrackerEvent;
}

const VIEW_LABELS: Record<ActiveView, string> = {
  demonlist: 'Demonlist',
  top10: 'Top 10 Watch',
  calendar: 'Calendar',
  changelog: 'Live Changelog',
  players: 'Player Rankings',
};

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('demonlist');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Filters & Pagination
  const [source, setSource] = useState<ListSource>('all');
  const [tier, setTier] = useState<ListTier>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);

  // Data States
  const [demons, setDemons] = useState<UnifiedDemon[]>([]);
  const [totalDemons, setTotalDemons] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [demonsLoading, setDemonsLoading] = useState(true);

  const [top10Levels, setTop10Levels] = useState<Top10LevelSummary[]>([]);
  const [top10Loading, setTop10Loading] = useState(true);

  const [events, setEvents] = useState<TrackerEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const [playerSource, setPlayerSource] = useState<'pointercrate' | 'aredl'>('pointercrate');
  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSyncedAt: null,
    isSyncing: false,
    pointercrateCount: 0,
    aredlCount: 0,
    top10VictorCount: 0,
    pollIntervalSeconds: 60,
    lastError: null,
  });

  // Inspector & Notifications
  const [selectedDemonKey, setSelectedDemonKey] = useState<string | null>(null);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(loadNotificationSettings);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );
  const [streamConnected, setStreamConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const settingsRef = useRef(notifSettings);
  settingsRef.current = notifSettings;

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 220);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchDemons = useCallback(async () => {
    setDemonsLoading(true);
    try {
      const params = new URLSearchParams({
        source,
        tier,
        q: debouncedQuery,
        page: String(page),
        limit: '40',
      });
      const res = await fetch(`/api/demons?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: UnifiedDemon[];
        total: number;
        pages: number;
        status: SyncStatus;
      };
      setDemons(data.items);
      setTotalDemons(data.total);
      setTotalPages(data.pages);
      if (data.status) setSyncStatus(data.status);
    } finally {
      setDemonsLoading(false);
    }
  }, [source, tier, debouncedQuery, page]);

  const fetchTop10 = useCallback(async () => {
    setTop10Loading(true);
    try {
      const res = await fetch('/api/top10');
      if (!res.ok) return;
      const data = (await res.json()) as { levels: Top10LevelSummary[]; status: SyncStatus };
      setTop10Levels(data.levels);
      if (data.status) setSyncStatus(data.status);
    } finally {
      setTop10Loading(false);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res = await fetch('/api/events');
      if (!res.ok) return;
      const data = (await res.json()) as { events: TrackerEvent[]; status: SyncStatus };
      setEvents(data.events);
      if (data.status) setSyncStatus(data.status);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const fetchPlayers = useCallback(async () => {
    setPlayersLoading(true);
    try {
      const params = new URLSearchParams({
        source: playerSource,
        q: debouncedQuery,
      });
      const res = await fetch(`/api/players?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { items: RankedPlayer[] };
      setPlayers(data.items);
    } finally {
      setPlayersLoading(false);
    }
  }, [playerSource, debouncedQuery]);

  useEffect(() => {
    void fetchDemons();
  }, [fetchDemons]);

  useEffect(() => {
    void fetchTop10();
    void fetchEvents();
  }, [fetchTop10, fetchEvents]);

  useEffect(() => {
    void fetchPlayers();
  }, [fetchPlayers]);

  // Initial retry polling while server warms up its first external fetch
  useEffect(() => {
    if (syncStatus.lastSyncedAt) return;
    const retry = setInterval(() => {
      void fetchDemons();
      void fetchTop10();
      void fetchEvents();
      void fetchPlayers();
    }, 2500);
    return () => clearInterval(retry);
  }, [syncStatus.lastSyncedAt, fetchDemons, fetchTop10, fetchEvents, fetchPlayers]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleIncomingEvent = useCallback(
    (ev: TrackerEvent) => {
      setEvents((prev) => {
        if (prev.some((item) => item.id === ev.id)) return prev;
        return [ev, ...prev].slice(0, 150);
      });
      setUnreadCount((c) => c + 1);

      const currentSettings = settingsRef.current;
      if (shouldTriggerForEvent(ev, currentSettings)) {
        const toastId = `${ev.id}-${Date.now()}`;
        setToasts((prev) => [{ id: toastId, event: ev }, ...prev].slice(0, 4));
        setTimeout(() => {
          dismissToast(toastId);
        }, 7000);

        if (currentSettings.soundEnabled) {
          playNotificationChime();
        }
        if (currentSettings.browserEnabled) {
          sendBrowserNotification(ev);
        }
      }

      if (!ev.isTest) {
        void fetchDemons();
        void fetchTop10();
      }
    },
    [dismissToast, fetchDemons, fetchTop10]
  );

  // Real-time SSE connection
  useEffect(() => {
    const es = new EventSource('/api/events/stream');
    es.addEventListener('connected', () => {
      setStreamConnected(true);
    });
    es.addEventListener('tracker', (msg) => {
      try {
        const ev = JSON.parse((msg as MessageEvent<string>).data) as TrackerEvent;
        handleIncomingEvent(ev);
      } catch {
        // ignore malformed event
      }
    });
    es.onerror = () => {
      setStreamConnected(false);
    };
    return () => {
      es.close();
      setStreamConnected(false);
    };
  }, [handleIncomingEvent]);

  const handleUpdateSettings = (next: NotificationSettings) => {
    setNotifSettings(next);
    saveNotificationSettings(next);
  };

  const handleRequestPermission = async () => {
    if (typeof Notification === 'undefined') {
      setNotifPermission('unsupported');
      return;
    }
    const result = await Notification.requestPermission();
    setNotifPermission(result);
  };

  const handleSyncNow = async () => {
    setSyncStatus((s) => ({ ...s, isSyncing: true }));
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { status: SyncStatus };
        if (data.status) setSyncStatus(data.status);
      }
      await Promise.all([fetchDemons(), fetchTop10(), fetchEvents(), fetchPlayers()]);
    } finally {
      setSyncStatus((s) => ({ ...s, isSyncing: false }));
    }
  };

  const handleSendTest = async (kind: 'demon_placed' | 'demon_updated' | 'top10_victor') => {
    if (notifPermission === 'default' && typeof Notification !== 'undefined') {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
    }
    await fetch('/api/notifications/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
    });
  };

  const handleSelectNav = (view: ActiveView) => {
    setActiveView(view);
    setMobileNavOpen(false);
    if (view === 'changelog') {
      setUnreadCount(0);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#090B10] text-slate-100">
      {/* Mobile Sidebar Overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-white/[0.08] bg-[#0B0E15] transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/[0.08] px-6">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              handleSelectNav('demonlist');
            }}
            className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            ApexList
          </a>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.05] hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Primary">
          <button
            type="button"
            onClick={() => handleSelectNav('demonlist')}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              activeView === 'demonlist'
                ? 'bg-[#161B28] text-white'
                : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
            }`}
          >
            <ListOrdered className={`h-4 w-4 shrink-0 ${activeView === 'demonlist' ? 'text-rose-400' : ''}`} />
            <span>Demonlist</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectNav('top10')}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              activeView === 'top10'
                ? 'bg-[#161B28] text-white'
                : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
            }`}
          >
            <Crown className={`h-4 w-4 shrink-0 ${activeView === 'top10' ? 'text-amber-400' : ''}`} />
            <span>Top 10 Watch</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectNav('calendar')}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              activeView === 'calendar'
                ? 'bg-[#161B28] text-white'
                : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
            }`}
          >
            <CalendarIcon className={`h-4 w-4 shrink-0 ${activeView === 'calendar' ? 'text-rose-400' : ''}`} />
            <span>Calendar</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectNav('changelog')}
            className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              activeView === 'changelog'
                ? 'bg-[#161B28] text-white'
                : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
            }`}
          >
            <span className="flex items-center gap-3">
              <Activity className={`h-4 w-4 shrink-0 ${activeView === 'changelog' ? 'text-rose-400' : ''}`} />
              <span>Live Changelog</span>
            </span>
            {unreadCount > 0 && (
              <span className="font-mono text-xs font-semibold text-rose-400 tabular-nums">{unreadCount}</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSelectNav('players')}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              activeView === 'players'
                ? 'bg-[#161B28] text-white'
                : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
            }`}
          >
            <Users className={`h-4 w-4 shrink-0 ${activeView === 'players' ? 'text-rose-400' : ''}`} />
            <span>Player Rankings</span>
          </button>
        </nav>

        <div className="border-t border-white/[0.08] p-4 space-y-3">
          <div className="space-y-1 text-xs text-slate-400">
            <div className="flex items-center justify-between">
              <span>Pointercrate</span>
              <span className="font-mono text-slate-200 tabular-nums">{syncStatus.pointercrateCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>AREDL</span>
              <span className="font-mono text-slate-200 tabular-nums">{syncStatus.aredlCount.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span>Updated</span>
              <span className="font-mono text-slate-300 tabular-nums">
                {syncStatus.lastSyncedAt ? formatRelativeTime(syncStatus.lastSyncedAt) : 'Syncing...'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setNotifDrawerOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-[#131722] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-[#1A2030] whitespace-nowrap"
          >
            <Bell className="h-3.5 w-3.5 text-rose-400" />
            <span>Alert Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar (Strict 3-Zone Contract) */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-8 border-b border-white/[0.08] bg-[#090B10]/90 px-4 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] text-slate-300 hover:bg-white/[0.05] lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <h1 className="font-display text-lg font-semibold tracking-tight text-white whitespace-nowrap">
              {VIEW_LABELS[activeView]}
            </h1>
          </div>

          <div className="relative hidden max-w-md flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search demon, creator, verifier, or ID..."
              className="h-9 w-full rounded-lg border border-white/[0.08] bg-[#10131C] pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rose-500/60 focus:outline-none"
            />
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setNotifDrawerOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-rose-500 focus-visible:outline-2 focus-visible:outline-rose-400 whitespace-nowrap shrink-0"
            >
              <Bell className="h-3.5 w-3.5" />
              <span>
                {notifPermission === 'granted' ? 'Alerts Active' : 'Enable Alerts'}
                {unreadCount > 0 ? ` (${unreadCount})` : ''}
              </span>
            </button>
          </div>
        </header>

        {/* Mobile Search Bar */}
        <div className="border-b border-white/[0.06] px-4 py-2.5 md:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search demon, creator, or ID..."
              className="h-9 w-full rounded-lg border border-white/[0.08] bg-[#10131C] pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rose-500/60 focus:outline-none"
            />
          </div>
        </div>

        {/* Viewport Content */}
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {activeView === 'demonlist' && (
            <div className="space-y-6">
              {/* 4-Column KPI Summary Strip */}
              <section className="grid grid-cols-2 divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-[#10131C] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
                <div className="px-5 py-4">
                  <div className="text-xs text-slate-400">Pointercrate Listed</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
                    {syncStatus.pointercrateCount || '—'}
                  </div>
                </div>
                <div className="px-5 py-4">
                  <div className="text-xs text-slate-400">AREDL Extremes</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
                    {syncStatus.aredlCount ? syncStatus.aredlCount.toLocaleString() : '—'}
                  </div>
                </div>
                <div className="px-5 py-4">
                  <div className="text-xs text-slate-400">Top 10 Victors</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
                    {syncStatus.top10VictorCount || '—'}
                  </div>
                </div>
                <div className="px-5 py-4">
                  <div className="text-xs text-slate-400">Tracked Events</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
                    {events.length}
                  </div>
                </div>
              </section>

              {/* Workspace Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Source Switcher */}
                  <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-[#10131C] p-1">
                    {(
                      [
                        { id: 'all', label: 'Unified' },
                        { id: 'pointercrate', label: 'Pointercrate' },
                        { id: 'aredl', label: 'AREDL' },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSource(s.id);
                          setPage(1);
                        }}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          source === s.id
                            ? 'bg-[#1C2233] text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  {/* Tier Filter */}
                  <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.06] bg-[#10131C] p-1">
                    {(
                      [
                        { id: 'all', label: 'All Tiers' },
                        { id: 'top10', label: 'Top 10' },
                        { id: 'main', label: 'Main #1–75' },
                        { id: 'extended', label: 'Extended #76–150' },
                        { id: 'legacy', label: 'AREDL #151+' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setTier(t.id);
                          setPage(1);
                        }}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          tier === t.id
                            ? 'bg-[#1C2233] text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleSyncNow()}
                  disabled={syncStatus.isSyncing}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#121622] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-[#191F30] disabled:opacity-60 whitespace-nowrap"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
                  <span>{syncStatus.isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                </button>
              </div>

              {/* High-Density Demonlist Table */}
              {demonsLoading && demons.length === 0 ? (
                <div className="space-y-2">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-lg border border-white/[0.06] bg-[#10131C]" />
                  ))}
                </div>
              ) : demons.length === 0 ? (
                <div className="rounded-xl border border-white/[0.08] bg-[#10131C] p-12 text-center">
                  <p className="text-sm font-medium text-slate-200">No demons matched your filter.</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Clear your search query or switch back to Unified / All Tiers.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSource('all');
                      setTier('all');
                      setPage(1);
                    }}
                    className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#10131C]">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-white/[0.08] bg-[#131722] text-xs font-medium text-slate-400">
                      <tr>
                        <th className="w-24 px-4 py-3">Rank</th>
                        <th className="px-4 py-3">Level</th>
                        <th className="hidden px-4 py-3 md:table-cell">Pointercrate</th>
                        <th className="hidden px-4 py-3 md:table-cell">AREDL</th>
                        <th className="hidden px-4 py-3 text-right sm:table-cell">Points / Req</th>
                        <th className="w-20 px-4 py-3 text-right">Video</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {demons.map((demon) => (
                        <tr
                          key={demon.key}
                          className="group cursor-pointer transition-colors hover:bg-white/[0.025]"
                          onClick={() => setSelectedDemonKey(demon.key)}
                        >
                          <td className="px-4 py-3 font-mono tabular-nums">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-sm font-bold ${
                                  demon.rank === 1
                                    ? 'text-amber-400'
                                    : demon.rank <= 10
                                    ? 'text-rose-400'
                                    : 'text-slate-200'
                                }`}
                              >
                                #{demon.rank}
                              </span>
                              {demon.recentDelta !== null && demon.recentDelta !== 0 && (
                                <span
                                  className={`inline-flex items-center text-[11px] font-medium ${
                                    demon.recentDelta > 0 ? 'text-emerald-400' : 'text-rose-400'
                                  }`}
                                  title="Recent rank change"
                                >
                                  {demon.recentDelta > 0 ? (
                                    <ArrowUpRight className="h-3 w-3" />
                                  ) : (
                                    <ArrowDownRight className="h-3 w-3" />
                                  )}
                                  {Math.abs(demon.recentDelta)}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3.5">
                              <DemonThumbnail
                                src={demon.thumbnail}
                                alt={demon.name}
                                rank={demon.rank}
                                className="hidden h-11 w-20 shrink-0 rounded-md sm:block"
                              />
                              <div className="min-w-0">
                                <div className="truncate font-display text-sm font-semibold text-white group-hover:text-rose-400 transition-colors">
                                  {demon.name}
                                </div>
                                <div className="mt-0.5 truncate text-xs text-slate-400">
                                  {demon.verifier
                                    ? `Verified by ${demon.verifier}`
                                    : demon.publisher
                                    ? `By ${demon.publisher}`
                                    : demon.levelId
                                    ? `Level ID ${demon.levelId}`
                                    : 'Extreme Demon'}
                                  {demon.tags.length > 0 ? ` · ${demon.tags.slice(0, 3).join(' · ')}` : ''}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="hidden px-4 py-3 font-mono text-xs text-slate-300 tabular-nums md:table-cell">
                            {demon.pointercratePosition ? `#${demon.pointercratePosition}` : '—'}
                          </td>

                          <td className="hidden px-4 py-3 font-mono text-xs text-slate-300 tabular-nums md:table-cell">
                            {demon.aredlPosition ? `#${demon.aredlPosition}` : '—'}
                          </td>

                          <td className="hidden px-4 py-3 text-right font-mono text-xs tabular-nums sm:table-cell">
                            <div className="font-medium text-slate-200">
                              {demon.aredlPoints !== null ? `${demon.aredlPoints.toLocaleString()} pts` : '—'}
                            </div>
                            {demon.requirement !== null && (
                              <div className="text-[11px] text-slate-400">{demon.requirement}% req</div>
                            )}
                          </td>

                          <td
                            className="px-4 py-3 text-right"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            {demon.video ? (
                              <a
                                href={demon.video}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-rose-400"
                                aria-label={`Watch ${demon.name} verification`}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : (
                              <span className="text-xs text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="font-mono text-xs text-slate-400 tabular-nums">
                    Showing page {page} of {totalPages} ({totalDemons.toLocaleString()} demons)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/[0.08] bg-[#10131C] px-3 text-xs font-medium text-slate-200 hover:bg-[#171C29] disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/[0.08] bg-[#10131C] px-3 text-xs font-medium text-slate-200 hover:bg-[#171C29] disabled:opacity-40"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeView === 'top10' && (
            <Top10WatchView
              levels={top10Levels}
              loading={top10Loading}
              onSelectDemon={(key) => setSelectedDemonKey(key)}
            />
          )}

          {activeView === 'calendar' && (
            <CalendarView onSelectDemon={(key) => setSelectedDemonKey(key)} />
          )}

          {activeView === 'changelog' && (
            <ChangelogView
              events={events}
              loading={eventsLoading}
              isSyncing={syncStatus.isSyncing}
              onSyncNow={handleSyncNow}
              onSelectDemon={(key) => setSelectedDemonKey(key)}
            />
          )}

          {activeView === 'players' && (
            <PlayersView
              players={players}
              source={playerSource}
              onChangeSource={setPlayerSource}
              loading={playersLoading}
            />
          )}
        </main>
      </div>

      {/* Live Toast Alerts */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0">
          {toasts.map(({ id, event }) => (
            <div
              key={id}
              className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.12] bg-[#121622] p-4 shadow-2xl"
              role="status"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
                  {event.type === 'top10_victor' ? (
                    <Trophy className="h-4 w-4 text-amber-400" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-rose-400">{event.source}</div>
                  <div className="mt-0.5 text-sm font-semibold text-white">{event.title}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{event.summary}</div>
                  <div className="mt-2 flex items-center gap-3">
                    {event.levelId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDemonKey(`gd:${event.levelId}`);
                          dismissToast(id);
                        }}
                        className="text-xs font-medium text-white underline-offset-2 hover:underline"
                      >
                        Inspect Level
                      </button>
                    )}
                    {event.videoUrl && (
                      <a
                        href={event.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-rose-400 hover:text-rose-300"
                      >
                        Watch Video
                      </a>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-white/[0.06] hover:text-white"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Demon Inspector Modal */}
      <DemonDetailModal demonKey={selectedDemonKey} onClose={() => setSelectedDemonKey(null)} />

      {/* Notification Settings Drawer */}
      <NotificationDrawer
        open={notifDrawerOpen}
        onClose={() => setNotifDrawerOpen(false)}
        settings={notifSettings}
        onUpdateSettings={handleUpdateSettings}
        permission={notifPermission}
        onRequestPermission={handleRequestPermission}
        onSendTest={handleSendTest}
        streamConnected={streamConnected}
      />
    </div>
  );
}
