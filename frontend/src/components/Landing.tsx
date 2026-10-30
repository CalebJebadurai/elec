import { useNavigate } from 'react-router-dom';
import QuickStart from './QuickStart';
import { LogoMark } from './Logo';
import type { StatsSummary } from '../types';

const FEATURES = [
  {
    title: 'State overview',
    body: 'Seat tallies, vote share trends, turnout and women’s representation across decades.',
    icon: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
  },
  {
    title: 'National dashboard',
    body: 'An interactive map of India, party strength by state, comparisons and a timeline.',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </>
    ),
  },
  {
    title: 'Marginal seats',
    body: 'The closest contests, and the seats each party lost by the thinnest margins.',
    icon: (
      <>
        <path d="M3 12h18" />
        <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
      </>
    ),
  },
  {
    title: 'Scenario simulator',
    body: 'Try what-if swings, turnout and alliances. Simulations, not forecasts.',
    icon: (
      <>
        <path d="M5 18a7 7 0 0 1 14 0" />
        <path d="M12 18l4-6" />
        <circle cx="12" cy="18" r="1.5" />
      </>
    ),
  },
];

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="px-4 py-3 md:px-6">
      <div className="font-display text-2xl font-semibold text-white tabular md:text-3xl">
        {value}
      </div>
      <div className="text-xs uppercase tracking-[0.14em] text-neutral-400 mt-1">{label}</div>
    </div>
  );
}

export default function Landing({
  stats,
  onGetStarted,
}: {
  stats: StatsSummary | null;
  onGetStarted: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="pt-6 pb-4 md:pt-14">
      <section className="grid gap-10 items-center lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/70 px-3 py-1 text-xs text-neutral-300">
            <span className="h-1.5 w-1.5 rounded-full bg-india-green" aria-hidden="true" />
            Free, open source, built on TCPD data
          </span>
          <h2 className="mt-5 text-4xl font-semibold leading-[1.05] text-white sm:text-5xl xl:text-6xl">
            Every Indian election,
            <br />
            <span className="bg-gradient-to-r from-saffron via-neutral-50 to-india-green bg-clip-text text-transparent">
              swing by swing.
            </span>
          </h2>
          <p className="mt-5 text-base text-neutral-400 max-w-xl mx-auto lg:mx-0 md:text-lg">
            Explore{' '}
            {stats?.total_years ? (
              <span className="text-neutral-200">{stats.total_years} years</span>
            ) : (
              'decades'
            )}{' '}
            of results across{' '}
            {stats?.total_constituencies ? (
              <span className="text-neutral-200 tabular">{stats.total_constituencies}</span>
            ) : (
              'hundreds of'
            )}{' '}
            constituencies. Track swings, find the marginal seats and check claims against the
            record.
          </p>
          <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <button
              className="w-full sm:w-auto bg-primary-400 text-black font-semibold px-7 h-12 rounded-full text-base hover:bg-primary-300 transition-colors cursor-pointer shadow-[0_8px_30px_-8px_rgba(56,189,248,0.6)]"
              onClick={onGetStarted}
            >
              Get started <span aria-hidden="true">→</span>
            </button>
            <button
              className="w-full sm:w-auto border border-neutral-700 text-neutral-100 px-7 h-12 rounded-full text-base hover:border-neutral-500 hover:bg-neutral-900 transition-colors cursor-pointer"
              onClick={() => navigate('/national')}
            >
              Open the national map
            </button>
          </div>
          <p className="mt-5 text-sm text-neutral-400">
            New to elections?{' '}
            <button
              type="button"
              className="text-primary-300 underline underline-offset-2 cursor-pointer"
              onClick={() => navigate('/learn')}
            >
              Learn how seats are won
            </button>
            {' · '}First-time voter?{' '}
            <button
              type="button"
              className="text-primary-300 underline underline-offset-2 cursor-pointer"
              onClick={() => navigate('/vote')}
            >
              How to register
            </button>
          </p>
        </div>

        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(closest-side,rgba(56,189,248,0.18),transparent)] blur-2xl"
          />
          <div className="relative">
            <div className="hidden lg:flex justify-end mb-[-2.25rem] mr-6 relative z-10">
              <LogoMark size={72} className="drop-shadow-[0_10px_30px_rgba(129,140,248,0.35)]" />
            </div>
            <QuickStart className="w-full max-w-xl mx-auto" />
          </div>
        </div>
      </section>

      {stats && (
        <section
          aria-label="Data at a glance"
          className="mt-12 grid grid-cols-2 divide-neutral-800 rounded-2xl border border-neutral-800 bg-neutral-900/60 md:grid-cols-4 md:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-neutral-800 md:[&>*]:border-b-0"
        >
          <Stat value={stats.general_years.length} label="Elections" />
          <Stat value={stats.total_constituencies} label="Constituencies" />
          <Stat value={stats.total_parties} label="Parties" />
          <Stat
            value={`${((stats.total_electors_latest ?? 0) / 1e6).toFixed(0)}M`}
            label="Electors"
          />
        </section>
      )}

      <section className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Features">
        {FEATURES.map((f) => (
          <div key={f.title} className="glass-card rounded-2xl p-5 text-left">
            <div className="grid place-items-center w-10 h-10 rounded-xl bg-primary-400/10 text-primary-300 border border-primary-400/20">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {f.icon}
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-white">{f.title}</h3>
            <p className="mt-1.5 text-sm text-neutral-400 leading-relaxed">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
