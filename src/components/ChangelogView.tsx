import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowDownRight, ArrowUpRight, ExternalLink, Plus, RefreshCw, Trophy } from 'lucide-react';
import type { TrackerEvent, TrackerEventType } from '../types';
import { formatRelativeTime } from '../utils/notifications';

interface ChangelogViewProps {
  events: TrackerEvent[];
  loading: boolean;
  isSyncing: boolean;
  onSyncNow: () => Promise<void>;
  onSelectDemon: (key: string) => void;
}

export function ChangelogView({
  events,
  loading,
  isSyncing,
  onSyncNow,
  onSelectDemon,
}: ChangelogViewProps) {
  const [typeFilter, setTypeFilter] = useState<'all' | TrackerEventType>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'Pointercrate' | 'AREDL'>('all');

  const filtered = events.filter((ev) => {
    if (typeFilter !== 'all' && ev.type !== typeFilter) return false;
    if (sourceFilter !== 'all' && ev.source !== sourceFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-white">Live Changelog &amp; Alerts</h2>
          <p className="mt-1 text-sm text-slate-400">
            Real-time placements, leaderboard rank updates, and Top 10 level completions across AREDL and Pointercrate.
          </p>
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => void onSyncNow()}
          disabled={isSyncing}
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#141824] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1B2030] disabled:opacity-60 whitespace-nowrap"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Checking Lists...' : 'Check for Updates'}
        </motion.button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.06] bg-[#10131C] p-1">
          {[
            { id: 'all', label: 'All Events' },
            { id: 'demon_placed', label: 'Placed' },
            { id: 'demon_updated', label: 'Rank Updated' },
            { id: 'top10_victor', label: 'Top 10 Victors' },
          ].map((tab) => {
            const active = typeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id as 'all' | TrackerEventType)}
                className={`relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="changelog-type-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                    className="absolute inset-0 rounded-md bg-[#1C2233]"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-[#10131C] p-1">
          {(['all', 'AREDL', 'Pointercrate'] as const).map((src) => {
            const active = sourceFilter === src;
            return (
              <button
                key={src}
                type="button"
                onClick={() => setSourceFilter(src)}
                className={`relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="changelog-source-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                    className="absolute inset-0 rounded-md bg-[#1C2233]"
                  />
                )}
                <span className="relative z-10">{src === 'all' ? 'All Sources' : src}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading && events.length === 0 ? (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border border-white/[0.06] bg-[#10131C]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-xl border border-white/[0.08] bg-[#10131C] p-10 text-center"
        >
          <p className="text-sm font-medium text-slate-300">No events match the selected filter.</p>
          <p className="mt-1 text-xs text-slate-400">
            Try switching back to All Events or run a manual sync to check for new changes.
          </p>
        </motion.div>
      ) : (
        <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-[#10131C]">
          {filtered.map((ev, idx) => {
            const raised =
              ev.type === 'demon_updated' &&
              ev.oldPosition !== null &&
              ev.newPosition !== null &&
              ev.newPosition < ev.oldPosition;

            return (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: Math.min(idx * 0.014, 0.18), ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.02]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3.5">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                      ev.type === 'top10_victor'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                        : ev.type === 'demon_placed'
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                        : raised
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-slate-600/40 bg-slate-700/20 text-slate-300'
                    }`}
                  >
                    {ev.type === 'top10_victor' ? (
                      <Trophy className="h-4 w-4" />
                    ) : ev.type === 'demon_placed' ? (
                      <Plus className="h-4 w-4" />
                    ) : raised ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {ev.levelId ? (
                        <button
                          type="button"
                          onClick={() => onSelectDemon(`gd:${ev.levelId}`)}
                          className="truncate text-left text-sm font-semibold text-white transition-colors hover:text-rose-400"
                        >
                          {ev.title}
                        </button>
                      ) : (
                        <span className="truncate text-sm font-semibold text-white">{ev.title}</span>
                      )}
                      {ev.isTest && <span className="text-xs font-medium text-amber-400">Test</span>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {ev.source} · {ev.summary}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-4">
                  {ev.videoUrl && (
                    <a
                      href={ev.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-rose-400 hover:text-rose-300 whitespace-nowrap"
                    >
                      Proof
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <span className="w-20 text-right font-mono text-xs text-slate-400 tabular-nums">
                    {formatRelativeTime(ev.createdAt)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
