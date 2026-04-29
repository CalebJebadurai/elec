import { useLocation, useNavigate } from 'react-router-dom';

interface BottomNavProps {
  selectedState: string;
}

const NAV_ITEMS = [
  {
    key: 'national',
    label: 'National',
    path: '/national',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    ),
  },
  {
    key: 'predictions',
    label: 'Predictions',
    pathFn: (state: string) => `/state/${state}/predictions`,
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="12" width="4" height="9" />
        <rect x="10" y="7" width="4" height="14" />
        <rect x="17" y="3" width="4" height="18" />
      </svg>
    ),
  },
  {
    key: 'community',
    label: 'Community',
    pathFn: (state: string) => `/state/${state}/community`,
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    key: 'overview',
    label: 'Overview',
    pathFn: (state: string) => `/state/${state}/overview`,
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    ),
  },
];

export default function BottomNav({ selectedState }: BottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  function isActive(item: (typeof NAV_ITEMS)[number]) {
    if (item.key === 'national') return path.startsWith('/national');
    if (item.key === 'predictions') return path.includes('/predictions');
    if (item.key === 'community') return path.includes('/community');
    if (item.key === 'overview')
      return path.includes('/overview') || path.includes('/constituencies');
    return false;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex h-14 items-center justify-around border-t border-neutral-800 bg-neutral-950 shadow-lg md:hidden"
      aria-label="Mobile navigation"
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(item);
        const dest = item.path || item.pathFn!(selectedState);
        return (
          <button
            key={item.key}
            onClick={() => navigate(dest)}
            className={`flex min-w-[44px] min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
              active ? 'text-primary-400' : 'text-neutral-400'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
