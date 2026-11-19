import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Crown,
  ExternalLink,
  Loader2,
  Plus,
  Trophy,
} from 'lucide-react';
import type { CalendarEvent, CalendarEventCategory, CalendarMonthResponse } from '../types';

interface CalendarViewProps {
  onSelectDemon: (key: string) => void;
}

type CategoryFilter = 'all' | 'top10_victor' | 'pc_placed' | 'aredl_placed' | 'updates';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return toMonthKey(dt);
}

function formatMonthTitle(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, 15));
  return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function formatDayHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function categoryMeta(cat: CalendarEventCategory): {
  label: string;
  dotClass: string;
  textClass: string;
} {
  switch (cat) {
    case 'top10_victor':
      return { label: 'Top 10 Victor', dotClass: 'bg-amber-400', textClass: 'text-amber-300' };
    case 'pc_placed':
      return { label: 'Pointercrate Placed', dotClass: 'bg-rose-500', textClass: 'text-rose-300' };
    case 'pc_updated':
      return { label: 'Pointercrate Update', dotClass: 'bg-sky-400', textClass: 'text-sky-300' };
    case 'aredl_placed':
      return { label: 'AREDL Placed', dotClass: 'bg-emerald-400', textClass: 'text-emerald-300' };
    case 'aredl_updated':
      return { label: 'AREDL Update', dotClass: 'bg-slate-400', textClass: 'text-slate-300' };
  }
}

export function CalendarView({ onSelectDemon }: CalendarViewProps) {
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMonthKey = todayKey.slice(0, 7);

  const [month, setMonth] = useState<string>(currentMonthKey);
  const [selectedDay, setSelectedDay] = useState<string>(todayKey);
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const fetchMonth = useCallback(async (targetMonth: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/calendar?month=${encodeURIComponent(targetMonth)}`);
      if (!res.ok) return;
      const data = (await res.json()) as CalendarMonthResponse;
      setEvents(data.events);
      setScanning(data.scanning);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMonth(month, false);
  }, [month, fetchMonth]);

  // Poll quietly while Pointercrate Time Machine scans the month
  useEffect(() => {
    if (!scanning) return;
    const timer = setInterval(() => {
      void fetchMonth(month, true);
    }, 1800);
    return () => clearInterval(timer);
  }, [scanning, month, fetchMonth]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (filter === 'all') return true;
      if (filter === 'top10_victor') return ev.category === 'top10_victor';
      if (filter === 'pc_placed') return ev.category === 'pc_placed';
      if (filter === 'aredl_placed') return ev.category === 'aredl_placed';
      return ev.category === 'pc_updated' || ev.category === 'aredl_updated';
    });
  }, [events, filter]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of filteredEvents) {
      const arr = map.get(ev.dateKey);
      if (arr) {
        arr.push(ev);
      } else {
        map.set(ev.dateKey, [ev]);
      }
    }
    return map;
  }, [filteredEvents]);

  // Keep selectedDay inside the active month
  useEffect(() => {
    if (selectedDay.startsWith(month)) return;
    if (month === currentMonthKey) {
      setSelectedDay(todayKey);
      return;
    }
    if (filteredEvents.length > 0) {
      setSelectedDay(filteredEvents[0].dateKey);
    } else {
      setSelectedDay(`${month}-01`);
    }
  }, [month, currentMonthKey, todayKey, selectedDay, filteredEvents]);

  const counts = useMemo(() => {
    let top10 = 0;
    let pcPlaced = 0;
    let aredlPlaced = 0;
    let updates = 0;
    for (const ev of events) {
      if (ev.category === 'top10_victor') top10++;
      else if (ev.category === 'pc_placed') pcPlaced++;
      else if (ev.category === 'aredl_placed') aredlPlaced++;
      else updates++;
    }
    return { top10, pcPlaced, aredlPlaced, updates };
  }, [events]);

  const calendarCells = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const totalSlots = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

    const cells: Array<{ dateKey: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < totalSlots; i++) {
      const dayNum = i - firstWeekday + 1;
      if (dayNum < 1 || dayNum > daysInMonth) {
        cells.push({ dateKey: null, dayNum: null });
      } else {
        cells.push({
          dateKey: `${month}-${String(dayNum).padStart(2, '0')}`,
          dayNum,
        });
      }
    }
    return cells;
  }, [month]);

  const selectedDayEvents = eventsByDay.get(selectedDay) ?? [];

  const handleInspectEvent = (ev: CalendarEvent) => {
    if (ev.levelId) {
      onSelectDemon(`gd:${ev.levelId}`);
    } else if (ev.pointercrateId) {
      onSelectDemon(`pc:${ev.pointercrateId}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Month Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-white">Demonlist Calendar</h2>
          <p className="mt-1 text-sm text-slate-400">
            Track when Top 10 victors beat levels and when demons were placed or moved on Pointercrate &amp; AREDL.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-[#10131C] text-slate-300 transition-colors hover:bg-[#171C29] hover:text-white"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="min-w-[160px] text-center font-display text-base font-semibold text-white">
            {formatMonthTitle(month)}
          </div>

          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={month >= currentMonthKey}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-[#10131C] text-slate-300 transition-colors hover:bg-[#171C29] hover:text-white disabled:opacity-40"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {month !== currentMonthKey && (
            <button
              type="button"
              onClick={() => {
                setMonth(currentMonthKey);
                setSelectedDay(todayKey);
              }}
              className="ml-1 rounded-lg border border-white/[0.1] bg-[#141824] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-[#1C2232] whitespace-nowrap"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Monthly Summary Strip */}
      <section className="grid grid-cols-2 divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-[#10131C] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-3.5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-2 w-2 rounded-xs bg-amber-400" />
            <span>Top 10 Victors</span>
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">{counts.top10}</div>
        </div>
        <div className="px-5 py-3.5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-2 w-2 rounded-xs bg-rose-500" />
            <span>Pointercrate Placed</span>
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">{counts.pcPlaced}</div>
        </div>
        <div className="px-5 py-3.5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-2 w-2 rounded-xs bg-emerald-400" />
            <span>AREDL Placed</span>
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">{counts.aredlPlaced}</div>
        </div>
        <div className="px-5 py-3.5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-2 w-2 rounded-xs bg-sky-400" />
            <span>Rank Updates</span>
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">{counts.updates}</div>
        </div>
      </section>

      {/* Filter Bar + Pointercrate Scan Status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.06] bg-[#10131C] p-1">
          {(
            [
              { id: 'all', label: 'All Activity' },
              { id: 'top10_victor', label: 'Top 10 Victors' },
              { id: 'pc_placed', label: 'Pointercrate Placed' },
              { id: 'aredl_placed', label: 'AREDL Placed' },
              { id: 'updates', label: 'Rank Updates' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                filter === tab.id ? 'bg-[#1C2233] text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {scanning && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-400" />
            <span>Scanning Pointercrate placement history...</span>
          </div>
        )}
      </div>

      {/* Main Split: 7-Column Calendar Grid + Day Inspector */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Calendar Grid */}
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#10131C] lg:col-span-8">
          <div className="grid grid-cols-7 border-b border-white/[0.08] bg-[#131722]">
            {WEEKDAYS.map((day) => (
              <div key={day} className="px-2 py-2.5 text-center text-xs font-medium text-slate-400">
                {day}
              </div>
            ))}
          </div>

          {loading && events.length === 0 ? (
            <div className="grid grid-cols-7">
              {Array.from({ length: 35 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse border-b border-r border-white/[0.05] bg-[#10131C]/60"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {calendarCells.map((cell, idx) => {
                if (!cell.dateKey || cell.dayNum === null) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="min-h-[92px] border-b border-r border-white/[0.05] bg-[#0B0E15]/60 sm:min-h-[108px]"
                    />
                  );
                }

                const dayEvents = eventsByDay.get(cell.dateKey) ?? [];
                const isSelected = cell.dateKey === selectedDay;
                const isToday = cell.dateKey === todayKey;

                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    onClick={() => setSelectedDay(cell.dateKey!)}
                    className={`group flex min-h-[92px] flex-col items-stretch justify-start border-b border-r border-white/[0.06] p-1.5 text-left transition-colors sm:min-h-[108px] sm:p-2 ${
                      isSelected
                        ? 'bg-[#171D2D] ring-1 ring-inset ring-rose-500/60'
                        : 'hover:bg-white/[0.025]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-flex h-6 min-w-6 items-center justify-center rounded px-1 font-mono text-xs font-semibold tabular-nums ${
                          isToday
                            ? 'bg-rose-600 text-white'
                            : isSelected
                            ? 'text-white'
                            : 'text-slate-400 group-hover:text-slate-200'
                        }`}
                      >
                        {cell.dayNum}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 space-y-1 overflow-hidden">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const meta = categoryMeta(ev.category);
                        const shortLabel =
                          ev.category === 'top10_victor'
                            ? `${ev.playerName ?? 'Victor'} · ${ev.levelName}`
                            : ev.newPosition
                            ? `#${ev.newPosition} ${ev.levelName}`
                            : ev.levelName;

                        return (
                          <div
                            key={ev.id}
                            className="flex items-center gap-1.5 truncate text-[11px] leading-tight text-slate-200"
                            title={ev.title}
                          >
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-xs ${meta.dotClass}`} />
                            <span className="truncate">{shortLabel}</span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="pl-3 font-mono text-[10px] text-slate-400 tabular-nums">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Panel: Selected Day Activity Inspector */}
        <aside className="flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#10131C] lg:col-span-4">
          <div className="border-b border-white/[0.08] bg-[#131722] px-5 py-4">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <CalendarIcon className="h-3.5 w-3.5 text-rose-400" />
              <span>Day Activity</span>
            </div>
            <h3 className="mt-1 font-display text-base font-semibold text-white">
              {formatDayHeading(selectedDay)}
            </h3>
          </div>

          <div className="flex-1 divide-y divide-white/[0.06] overflow-y-auto">
            {selectedDayEvents.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm font-medium text-slate-300">No events recorded on this day.</p>
                <p className="mt-1 text-xs text-slate-400">
                  {scanning
                    ? 'Still scanning Pointercrate placement history for this month...'
                    : 'Select a highlighted date on the calendar to inspect placements or Top 10 victors.'}
                </p>
              </div>
            ) : (
              selectedDayEvents.map((ev) => {
                const meta = categoryMeta(ev.category);
                const canInspect = Boolean(ev.levelId || ev.pointercrateId);
                const raised =
                  ev.oldPosition !== null && ev.newPosition !== null && ev.newPosition < ev.oldPosition;

                return (
                  <div key={ev.id} className="p-4 transition-colors hover:bg-white/[0.02]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`h-2 w-2 rounded-xs ${meta.dotClass}`} />
                        <span className={`font-medium ${meta.textClass}`}>{meta.label}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400">{ev.source}</span>
                      </div>

                      {ev.category === 'top10_victor' ? (
                        <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                      ) : ev.category === 'pc_placed' || ev.category === 'aredl_placed' ? (
                        <Plus className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                      ) : raised ? (
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      )}
                    </div>

                    <div className="mt-1.5">
                      {canInspect ? (
                        <button
                          type="button"
                          onClick={() => handleInspectEvent(ev)}
                          className="text-left font-display text-sm font-semibold text-white transition-colors hover:text-rose-400"
                        >
                          {ev.title}
                        </button>
                      ) : (
                        <div className="font-display text-sm font-semibold text-white">{ev.title}</div>
                      )}
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{ev.summary}</p>
                    </div>

                    {(ev.videoUrl || canInspect) && (
                      <div className="mt-2.5 flex items-center gap-4 text-xs">
                        {canInspect && (
                          <button
                            type="button"
                            onClick={() => handleInspectEvent(ev)}
                            className="inline-flex items-center gap-1 font-medium text-slate-300 hover:text-white"
                          >
                            <Crown className="h-3 w-3 text-slate-400" />
                            Inspect Demon
                          </button>
                        )}
                        {ev.videoUrl && (
                          <a
                            href={ev.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-rose-400 hover:text-rose-300"
                          >
                            Watch Proof
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
