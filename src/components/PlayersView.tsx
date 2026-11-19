import { motion } from 'motion/react';
import type { RankedPlayer } from '../types';

interface PlayersViewProps {
  players: RankedPlayer[];
  source: 'pointercrate' | 'aredl';
  onChangeSource: (src: 'pointercrate' | 'aredl') => void;
  loading: boolean;
}

export function PlayersView({ players, source, onChangeSource, loading }: PlayersViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-white">Player Rankings</h2>
          <p className="mt-1 text-sm text-slate-400">
            Top 100 Demonlist players ranked by list points across Pointercrate and AREDL.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-[#10131C] p-1">
          {(['pointercrate', 'aredl'] as const).map((src) => {
            const active = source === src;
            return (
              <button
                key={src}
                type="button"
                onClick={() => onChangeSource(src)}
                className={`relative rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="players-source-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                    className="absolute inset-0 rounded-md bg-[#1C2233]"
                  />
                )}
                <span className="relative z-10">{src === 'pointercrate' ? 'Pointercrate' : 'AREDL'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading && players.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg border border-white/[0.06] bg-[#10131C]" />
          ))}
        </div>
      ) : players.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#10131C] p-10 text-center text-sm text-slate-400">
          Player rankings are syncing from {source === 'aredl' ? 'AREDL' : 'Pointercrate'}.
        </div>
      ) : (
        <motion.div
          key={source}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#10131C]"
        >
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/[0.08] bg-[#131722] text-xs font-medium text-slate-400">
              <tr>
                <th className="w-20 px-5 py-3">Rank</th>
                <th className="px-5 py-3">Player</th>
                <th className="hidden px-5 py-3 sm:table-cell">Region</th>
                {source === 'aredl' && <th className="hidden px-5 py-3 md:table-cell">Hardest</th>}
                {source === 'aredl' && <th className="hidden px-5 py-3 text-right sm:table-cell">Extremes</th>}
                <th className="px-5 py-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {players.map((p, idx) => (
                <motion.tr
                  key={p.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, delay: Math.min(idx * 0.01, 0.18), ease: [0.16, 1, 0.3, 1] }}
                  className="transition-colors hover:bg-white/[0.02]"
                >
                  <td className="px-5 py-3 font-mono text-sm font-semibold tabular-nums text-slate-300">
                    <span className={p.rank === 1 ? 'text-amber-400' : p.rank <= 3 ? 'text-rose-400' : ''}>
                      #{p.rank}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-medium text-white">{p.name}</td>
                  <td className="hidden px-5 py-3 text-xs text-slate-400 sm:table-cell">
                    {p.countryName ?? p.countryCode ?? '—'}
                  </td>
                  {source === 'aredl' && (
                    <td className="hidden px-5 py-3 text-xs text-slate-300 md:table-cell">
                      {p.hardestLevel ?? '—'}
                    </td>
                  )}
                  {source === 'aredl' && (
                    <td className="hidden px-5 py-3 text-right font-mono text-xs text-slate-400 tabular-nums sm:table-cell">
                      {p.extremesCount !== null ? p.extremesCount.toLocaleString() : '—'}
                    </td>
                  )}
                  <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-white tabular-nums">
                    {p.score.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  );
}
