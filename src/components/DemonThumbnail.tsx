import { useState } from 'react';

interface DemonThumbnailProps {
  src: string | null;
  alt: string;
  rank: number;
  className?: string;
}

export function DemonThumbnail({ src, alt, rank, className = '' }: DemonThumbnailProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#161B29] via-[#10131D] to-[#1D1219] border border-white/[0.08] ${className}`}
        aria-label={alt}
      >
        <svg
          className="w-6 h-6 text-rose-500/45"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <polygon points="12 3 21 19 3 19" />
          <line x1="12" y1="9" x2="12" y2="15" />
        </svg>
        <span className="absolute bottom-1 right-1.5 font-mono text-[10px] font-medium text-slate-500 tabular-nums">
          #{rank}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-[#10131C] border border-white/[0.08] ${className}`}>
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
      />
    </div>
  );
}
