import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Crown, ExternalLink, Trophy } from 'lucide-react';
import type { Top10LevelSummary } from '../types';
import { formatRelativeTime } from '../utils/notifications';
import { DemonThumbnail } from './DemonThumbnail';

interface Top10WatchViewProps {
  levels: Top10LevelSummary[];
  loading: boolean;
  onSelectDemon: (key: string) => void;
}

export function Top10WatchView({ levels, loading, onSelectDemon }: Top10WatchViewProps) {
  const [expandedRank, setExpandedRank] = useState<number | null>(1);
  const top1 = levels[0] ?? null;

  return (
    <div className="space-y-8">
      {/* #1 Monolith Hero Spotlight */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#10131C]"
      >
        <img
          src="/src/assets/images/obsidian_monolith_banner_1795113248604.jpg"
          alt="Obsidian monolith backdrop"
          className="absolute inset-0 h-full w-full object-cover opacity-50"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090B10] via-[#090B10]/85 to-[#090B10]/40" />

        <div className="relative grid items-center gap-6 p-6 md:grid-cols-[1fr_300px] md:p-8">
          <div className="max-w-xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-rose-400">
              <Crown className="h-4 w-4" />
              <span>Top 10 Victor Watch</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-300">Pointercrate &amp; AREDL</span>
            </div>

            <h2 className="font-display text-3xl font-bold tracking-tight text-white [text-wrap:balance] sm:text-4xl">
              {top1 ? `#1 ${top1.name}` : 'Hardest Top 10 Levels'}
            </h2>

            <p className="text-sm leading-relaxed text-slate-300">
              {top1
                ? `Verified by ${top1.verifier ?? 'Unknown'} and published by ${top1.publisher ?? 'Unknown'}. Tracking ${levels.reduce(
                    (acc, l) => acc + l.victorCount,
                    0
                  )} approved 100% completions across the top 10 hardest levels in Geometry Dash.`
                : 'Monitoring every approved 100% completion across the top 10 hardest levels on Pointercrate and AREDL.'}
            </p>

            {top1 && (
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onSelectDemon(top1.levelId ? `gd:${top1.levelId}` : `pc:${top1.pointercrateId}`)}
                  className="rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500 whitespace-nowrap"
                >
                  Inspect #1 Details
                </motion.button>
                {top1.video && (
                  <motion.a
                    whileTap={{ scale: 0.97 }}
                    href={top1.video}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#121622]/90 px-4 py-2.5 text-xs font-medium text-slate-200 transition-colors hover:bg-[#191F30] whitespace-nowrap"
                  >
                    Verification Video
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                  </motion.a>
                )}
              </div>
            )}
          </div>

          {top1 && (
            <motion.button
              type="button"
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => onSelectDemon(top1.levelId ? `gd:${top1.levelId}` : `pc:${top1.pointercrateId}`)}
              className="group relative hidden overflow-hidden rounded-lg border border-white/[0.12] text-left md:block"
            >
              <DemonThumbnail
                src={top1.thumbnail}
                alt={top1.name}
                rank={top1.rank}
                className="aspect-video w-full border-0"
              />
              <div className="flex items-center justify-between bg-[#0C0F17]/95 px-3.5 py-2.5 text-xs">
                <span className="font-medium text-white">{top1.verifier ?? 'Verifier'}</span>
                <span className="font-mono text-slate-400 tabular-nums">
                  {top1.requirement ? `${top1.requirement}% req` : '100%'}
                </span>
              </div>
            </motion.button>
          )}
        </div>
      </motion.section>

      {/* Top 10 List with Expandable Victor Rosters */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-white">Top 10 Victor Breakdown</h3>
          <span className="text-xs text-slate-400">Click any level to expand its 100% victor roster</span>
        </div>

        {loading && levels.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-white/[0.06] bg-[#10131C]" />
            ))}
          </div>
        ) : levels.length === 0 ? (
          <div className="rounded-xl border border-white/[0.08] bg-[#10131C] p-8 text-center text-sm text-slate-400">
            Top 10 level records are syncing from Pointercrate and AREDL.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.07] overflow-hidden rounded-xl border border-white/[0.08] bg-[#10131C]">
            {levels.map((level, idx) => {
              const isOpen = expandedRank === level.rank;
              const demonKey = level.levelId ? `gd:${level.levelId}` : `pc:${level.pointercrateId}`;
              return (
                <motion.div
                  key={level.rank}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.025, ease: [0.16, 1, 0.3, 1] }}
                  className="transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02]">
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <span
                        className={`w-9 shrink-0 font-mono text-lg font-bold tabular-nums ${
                          level.rank === 1
                            ? 'text-amber-400'
                            : level.rank <= 3
                            ? 'text-rose-400'
                            : 'text-slate-300'
                        }`}
                      >
                        #{level.rank}
                      </span>

                      <button
                        type="button"
                        onClick={() => onSelectDemon(demonKey)}
                        className="group shrink-0 transition-transform active:scale-95"
                        aria-label={`Open ${level.name}`}
                      >
                        <DemonThumbnail
                          src={level.thumbnail}
                          alt={level.name}
                          rank={level.rank}
                          className="h-12 w-20 rounded-md"
                        />
                      </button>

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onSelectDemon(demonKey)}
                          className="block w-full truncate text-left font-display text-base font-semibold text-white transition-colors hover:text-rose-400"
                        >
                          {level.name}
                        </button>
                        <div className="mt-0.5 truncate text-xs text-slate-400">
                          Verified by {level.verifier ?? 'Unknown'}
                          {level.publisher ? ` · Published by ${level.publisher}` : ''}
                          {level.aredlPoints ? ` · ${level.aredlPoints.toLocaleString()} AREDL pts` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-4">
                      <div className="text-right">
                        <div className="font-mono text-sm font-semibold text-white tabular-nums">
                          {level.victorCount > 0
                            ? `${level.victorCount} ${level.victorCount === 1 ? 'Victor' : 'Victors'}`
                            : 'Verifier Only'}
                        </div>
                        <div className="font-mono text-xs text-slate-400 tabular-nums">
                          {level.requirement ? `${level.requirement}% req` : '100%'}
                        </div>
                      </div>

                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setExpandedRank(isOpen ? null : level.rank)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#161B28] px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-[#1E2435] whitespace-nowrap"
                      >
                        <span>{isOpen ? 'Hide' : 'Victors'}</span>
                        <motion.span
                          animate={{ rotate: isOpen ? 180 : 0 }}
                          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                          className="inline-flex"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </motion.span>
                      </motion.button>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key={`victors-${level.rank}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden border-t border-white/[0.06] bg-[#0B0E15]"
                      >
                        <div className="px-5 py-4">
                          {level.victors.length === 0 ? (
                            <p className="text-xs text-slate-400">No approved victors yet beyond initial verification.</p>
                          ) : (
                            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                              {level.victors.map((v, vIdx) => (
                                <motion.div
                                  key={v.id}
                                  initial={{ opacity: 0, y: 6 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.18, delay: Math.min(vIdx * 0.02, 0.16), ease: [0.16, 1, 0.3, 1] }}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-[#111521] px-3.5 py-2.5 transition-colors hover:border-white/[0.12]"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-100">
                                      {v.isVerification ? (
                                        <Crown className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                                      ) : (
                                        <Trophy className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                      )}
                                      <span className="truncate">{v.playerName}</span>
                                    </div>
                                    <div className="mt-0.5 text-xs text-slate-400">
                                      {v.isVerification ? 'Verification' : '100% Completion'}
                                      {' · '}
                                      {v.source}
                                      {v.achievedAt ? ` · ${formatRelativeTime(v.achievedAt)}` : ''}
                                    </div>
                                  </div>

                                  {v.video && (
                                    <motion.a
                                      whileTap={{ scale: 0.94 }}
                                      href={v.video}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="shrink-0 rounded border border-white/[0.08] px-2.5 py-1 text-xs font-medium text-rose-400 transition-colors hover:bg-white/[0.04]"
                                    >
                                      Watch
                                    </motion.a>
                                  )}
                                </motion.div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
