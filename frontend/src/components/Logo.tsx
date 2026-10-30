import { useId } from 'react';

/**
 * Swingometer mark: a tricolour gauge arc with a needle tipped past centre,
 * its hub the violet of the indelible ink voters get on their finger.
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient
          id={`${id}-arc`}
          x1="5"
          y1="0"
          x2="27"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#ff9933" />
          <stop offset="0.5" stopColor="#f8fafc" />
          <stop offset="1" stopColor="#22c55e" />
        </linearGradient>
        <linearGradient
          id={`${id}-tile`}
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#1b2140" />
          <stop offset="1" stopColor="#0b0e1c" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}-tile)`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" stroke="#ffffff" strokeOpacity="0.12" />
      <path
        d="M6.5 22.5a9.5 9.5 0 0 1 19 0"
        stroke={`url(#${id}-arc)`}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path d="M16 22.5 21.6 12.4" stroke="#f8fafc" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="16" cy="22.5" r="3" fill="#818cf8" stroke="#0b0e1c" strokeWidth="1.2" />
    </svg>
  );
}

export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={compact ? 30 : 34} />
      <span className={`font-display leading-none ${compact ? 'hidden sm:block' : ''}`}>
        <span className="block text-[0.95rem] font-semibold tracking-tight text-white">
          Election <span className="text-saffron">Swings</span>
        </span>
        <span className="block text-[0.62rem] uppercase tracking-[0.22em] text-neutral-400 mt-1 font-sans">
          &amp; Trends · India
        </span>
      </span>
    </span>
  );
}
