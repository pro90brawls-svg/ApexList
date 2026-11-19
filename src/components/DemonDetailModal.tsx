import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, Trophy, Users, X } from 'lucide-react';
import type { DemonDetail } from '../types';
import { formatRelativeTime } from '../utils/notifications';
import { DemonThumbnail } from './DemonThumbnail';

interface DemonDetailModalProps {
  demonKey: string | null;
  onClose: () => void;
}

export function DemonDetailModal({ demonKey, onClose }: DemonDetailModalProps) {
  const [detail, setDetail] = useState<DemonDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!demonKey) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/demons/${encodeURIComponent(demonKey)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load demon details (${res.status})`);
        return (await res.json()) as DemonDetail;
      })
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load details');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [demonKey]);

  return (
    <AnimatePresence>
      {demonKey && (
        <motion.div
          key="demon-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-[2px]"
          onClick={onClose}
        >
          <motion.div
            key="demon-modal-panel"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-[#0E1119] text-slate-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={detail ? `${detail.name} details` : 'Demon details'}
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
              <div className="min-w-0">
                <h2 className="truncate font-display text-xl font-semibold text-white">
                  {detail ? detail.name : 'Loading demon...'}
                </h2>
                {detail && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    {detail.levelId ? `ID ${detail.levelId}` : 'Unlinked ID'}
                    {detail.publisher ? ` · Published by ${detail.publisher}` : ''}
                    {detail.verifier ? ` · Verified by ${detail.verifier}` : ''}
                  </p>
                )}
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-white"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </motion.button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {loading ? (
                <div className="space-y-4">
                  <div className="h-44 w-full animate-pulse rounded-lg bg-[#161B28]" />
                  <div className="grid grid-cols-4 gap-3">
                    <div className="h-16 animate-pulse rounded-lg bg-[#161B28]" />
                    <div className="h-16 animate-pulse rounded-lg bg-[#161B28]" />
                    <div className="h-16 animate-pulse rounded-lg bg-[#161B28]" />
                    <div className="h-16 animate-pulse rounded-lg bg-[#161B28]" />
                  </div>
                  <div className="h-40 animate-pulse rounded-lg bg-[#161B28]" />
                </div>
              ) : error ? (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                  {error}
                </div>
              ) : detail ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-6"
                >
              {/* Top hero split */}
              <div className="grid gap-5 md:grid-cols-[240px_1fr]">
                <DemonThumbnail
                  src={detail.thumbnail}
                  alt={detail.name}
                  rank={detail.pointercratePosition ?? detail.aredlPosition ?? detail.rank}
                  className="aspect-video w-full rounded-lg md:aspect-[16/10]"
                />
                <div className="flex flex-col justify-between gap-3">
                  {detail.description ? (
                    <p className="text-sm leading-relaxed text-slate-300">{detail.description}</p>
                  ) : (
                    <p className="text-sm text-slate-400">
                      Ranked Extreme Demon tracked across Pointercrate and AREDL.
                    </p>
                  )}

                  {detail.tags.length > 0 && (
                    <div className="text-xs text-slate-400">
                      {detail.tags.join(' · ')}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {detail.video && (
                      <a
                        href={detail.video}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-500 whitespace-nowrap"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Watch Verification
                      </a>
                    )}
                    {detail.pointercrateId && (
                      <a
                        href={`https://pointercrate.com/demonlist/${detail.pointercratePosition ?? ''}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#151925] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-[#1C2232] whitespace-nowrap"
                      >
                        Pointercrate
                        <ExternalLink className="h-3 w-3 text-slate-400" />
                      </a>
                    )}
                    {detail.levelId && (
                      <a
                        href={`https://aredl.net/list/${detail.levelId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#151925] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-[#1C2232] whitespace-nowrap"
                      >
                        AREDL
                        <ExternalLink className="h-3 w-3 text-slate-400" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Metrics strip */}
              <div className="grid grid-cols-2 gap-3 border-y border-white/[0.08] py-4 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-slate-400">Pointercrate</div>
                  <div className="mt-1 font-mono text-lg font-semibold text-white tabular-nums">
                    {detail.pointercratePosition ? `#${detail.pointercratePosition}` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">AREDL Rank</div>
                  <div className="mt-1 font-mono text-lg font-semibold text-white tabular-nums">
                    {detail.aredlPosition ? `#${detail.aredlPosition}` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">AREDL Points</div>
                  <div className="mt-1 font-mono text-lg font-semibold text-white tabular-nums">
                    {detail.aredlPoints !== null ? detail.aredlPoints.toLocaleString() : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">List Requirement</div>
                  <div className="mt-1 font-mono text-lg font-semibold text-white tabular-nums">
                    {detail.requirement !== null ? `${detail.requirement}%` : '100%'}
                  </div>
                </div>
              </div>

              {/* Secondary details row */}
              {(detail.creators.length > 0 || detail.edelEnjoyment !== null || detail.gddlTier !== null) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {detail.creators.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                        <Users className="h-3.5 w-3.5" />
                        Creators
                      </div>
                      <p className="mt-1 text-sm text-slate-200">{detail.creators.join(', ')}</p>
                    </div>
                  )}
                  {(detail.edelEnjoyment !== null || detail.gddlTier !== null) && (
                    <div className="flex gap-6">
                      {detail.edelEnjoyment !== null && (
                        <div>
                          <div className="text-xs font-medium text-slate-400">EDEL Enjoyment</div>
                          <div className="mt-1 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                            {detail.edelEnjoyment.toFixed(1)} / 100
                          </div>
                        </div>
                      )}
                      {detail.gddlTier !== null && (
                        <div>
                          <div className="text-xs font-medium text-slate-400">GDDL Tier</div>
                          <div className="mt-1 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                            Tier {detail.gddlTier}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Victors & Approved Records */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 font-display text-base font-semibold text-white">
                    <Trophy className="h-4 w-4 text-amber-400" />
                    Victors &amp; Approved Records
                  </h3>
                  <span className="font-mono text-xs text-slate-400 tabular-nums">
                    {detail.victors.length} {detail.victors.length === 1 ? 'record' : 'records'}
                  </span>
                </div>

                {detail.victors.length === 0 ? (
                  <div className="rounded-lg border border-white/[0.08] bg-[#121622] px-4 py-6 text-center text-sm text-slate-400">
                    No public victor records have been approved for this level yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
                    <table className="w-full min-w-[460px] text-left text-sm">
                      <thead className="border-b border-white/[0.08] bg-[#131722] text-xs font-medium text-slate-400">
                        <tr>
                          <th className="px-4 py-2.5">Player</th>
                          <th className="px-4 py-2.5">Source</th>
                          <th className="px-4 py-2.5 text-right">Progress</th>
                          <th className="px-4 py-2.5 text-right">Date</th>
                          <th className="px-4 py-2.5 text-right">Proof</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {detail.victors.map((v) => (
                          <tr key={v.id} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-2.5 font-medium text-slate-100">
                              {v.playerName}
                              {v.isVerification && (
                                <span className="ml-2 text-xs font-normal text-amber-400">Verifier</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-400">
                              {v.source}
                              {v.countryCode ? ` · ${v.countryCode}` : ''}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-200 tabular-nums">
                              {v.progress}%
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-400 tabular-nums">
                              {v.achievedAt ? formatRelativeTime(v.achievedAt) : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {v.video ? (
                                <a
                                  href={v.video}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-rose-400 hover:text-rose-300"
                                >
                                  Video
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <span className="text-xs text-slate-500">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
                </motion.div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
