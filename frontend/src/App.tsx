import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams, Navigate } from 'react-router-dom';
const StateOverview = lazy(() => import('./components/StateOverview'));
const ConstituencyList = lazy(() => import('./components/ConstituencyList'));
const ConstituencyDetail = lazy(() => import('./components/ConstituencyDetail'));
const PredictionPanel = lazy(() => import('./components/PredictionPanel'));
const PredictionResults = lazy(() => import('./components/PredictionResults'));
const PredictionConstituencyTable = lazy(() => import('./components/PredictionConstituencyTable'));
const CommunityFeed = lazy(() => import('./components/CommunityFeed'));
const MyBookmarks = lazy(() => import('./components/MyBookmarks'));
const NationalDashboard = lazy(() => import('./components/NationalDashboard'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));
const PricingPage = lazy(() => import('./components/PricingPage'));
const SupportPage = lazy(() => import('./components/SupportPage'));
const LoginModal = lazy(() => import('./components/LoginModal'));
const UserMenu = lazy(() => import('./components/UserMenu'));
const SaveBookmarkModal = lazy(() => import('./components/SaveBookmarkModal'));
const Landing = lazy(() => import('./components/Landing'));
const GlossaryPage = lazy(() => import('./components/GlossaryPage'));
const LearnPage = lazy(() => import('./components/LearnPage'));
const MethodologyPage = lazy(() => import('./components/MethodologyPage'));
const MarginalSeats = lazy(() => import('./components/MarginalSeats'));
const ClaimCheck = lazy(() => import('./components/ClaimCheck'));
const VoterInfoPage = lazy(() => import('./components/VoterInfoPage'));
import ElectionTypeToggle from './components/ElectionTypeToggle';
import Disclaimer from './components/Disclaimer';
import ErrorBoundary from './components/ErrorBoundary';
import BottomNav from './components/BottomNav';
import { useAuth } from './contexts/AuthContext';
import { useStateSelection } from './contexts/StateContext';
import { useDebounce } from './hooks/useDebounce';
import { api } from './api';
import {
  DEFAULT_PREDICTION_PARAMS,
  normalizeParty,
  buildAffinityPresets,
  isColourBlindSafe,
  setColourBlindSafe,
} from './constants';
import {
  generateBaseline,
  applyNewParty,
  applyAllianceTransfers,
  aggregateResults,
} from './engine/predictionEngine';
import { buildSwingInput, learnedSwing, runSwingModel } from './engine/swingAdapter';
import { AnimatePresence, motion } from 'motion/react';
import { pageTransition } from './lib/motion';
import { isLowData, useLowData } from './lib/lowData';
import { THEMES, useTheme, type Theme } from './lib/theme';
import Skeleton from './components/Skeleton';
import Logo from './components/Logo';
import { useImmersive } from './lib/immersive';
import type { StatsSummary, PredictionDataResponse, AppPredictionParams } from './types';

// Prefetch heavy route chunks during idle time (skipped in low-data mode)
if (typeof window !== 'undefined' && 'requestIdleCallback' in window && !isLowData()) {
  requestIdleCallback(() => {
    import('./components/NationalDashboard');
    import('./components/StateOverview');
    import('./components/ConstituencyList');
  });
}

function IconButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="shrink-0 grid place-items-center w-9 h-9 rounded-full border border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors cursor-pointer"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {icon}
      </svg>
    </button>
  );
}

function FooterLinks({ title, links }: { title: string; links: [string, string][] }) {
  const navigate = useNavigate();
  return (
    <div>
      <h2 className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-neutral-300 mb-3">
        {title}
      </h2>
      <ul className="space-y-2">
        {links.map(([href, label]) => {
          const external = href.startsWith('http');
          return (
            <li key={href}>
              <a
                href={href}
                className="hover:text-white transition-colors"
                {...(external
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {
                      onClick: (e: React.MouseEvent) => {
                        e.preventDefault();
                        navigate(href);
                      },
                    })}
              >
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const Loading = () => (
  <div className="py-8 min-h-[60vh]">
    <Skeleton variant="header" />
    <Skeleton variant="chart" />
  </div>
);

// Wrapper for constituency detail to extract route param
function ConstituencyDetailRoute({ onBack }: { onBack: () => void }) {
  const { name } = useParams();
  return <ConstituencyDetail name={decodeURIComponent(name!)} onBack={onBack} />;
}

// Require auth — redirect to landing if not logged in
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="py-8">
        <Skeleton variant="header" />
        <Skeleton variant="card" count={2} />
      </div>
    );
  if (!user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  const { states, selectedState, selectState, electionType } = useStateSelection();
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogin, setShowLogin] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [lowData, setLowData] = useLowData();
  const [cbSafe, setCbSafe] = useState(isColourBlindSafe);
  const [theme, setTheme] = useTheme();
  const [immersive, setImmersive] = useImmersive();

  // App-level stats (drives dynamic headings)
  const [stats, setStats] = useState<StatsSummary | null>(null);

  // Prediction state
  const [predData, setPredData] = useState<(PredictionDataResponse & { _state?: string }) | null>(
    null
  );
  const [predLoading, setPredLoading] = useState(false);
  const [predParams, setPredParams] = useState<AppPredictionParams>({
    ...DEFAULT_PREDICTION_PARAMS,
  });
  const debouncedPredParams = useDebounce(predParams, 200);

  // Load stats when state or election type changes
  useEffect(() => {
    if (!selectedState) return;
    setStats(null);
    api.stats(selectedState, electionType).then(setStats).catch(console.error);
  }, [selectedState, electionType]);

  // Redirect authenticated users from landing to national dashboard
  useEffect(() => {
    if (user && location.pathname === '/') {
      navigate('/national', { replace: true });
    }
  }, [user, location.pathname, navigate]);

  // Load prediction data when on prediction route (AE only)
  const onPrediction = location.pathname.includes('/predictions');
  useEffect(() => {
    if (
      onPrediction &&
      electionType === 'AE' &&
      selectedState &&
      (!predData || predData._state !== selectedState)
    ) {
      setPredLoading(true);
      api
        .predictionData(selectedState)
        .then((data) => {
          data._state = selectedState;
          setPredData(data);
        })
        .catch(console.error)
        .finally(() => setPredLoading(false));
    }
  }, [onPrediction, selectedState, predData, electionType]);

  // Derive top parties and dynamic affinity presets from prediction data
  const topParties = useMemo(() => {
    if (!predData) return [];
    const seats: Record<string, number> = {};
    predData.constituencies.forEach((c) => {
      const p = normalizeParty(c.winner_party_latest);
      if (p && p !== 'IND') seats[p] = (seats[p] || 0) + 1;
    });
    return Object.entries(seats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([p]) => p);
  }, [predData]);

  const dynamicPresets = useMemo(() => buildAffinityPresets(topParties), [topParties]);

  // Compute growth factor (use custom totalElectors if set)
  const growthFactor = useMemo(() => {
    if (!predData) return 1;
    if (debouncedPredParams.totalElectors) {
      return debouncedPredParams.totalElectors / predData.total_electors_latest;
    }
    return predData.total_electors_next / predData.total_electors_latest;
  }, [predData, debouncedPredParams.totalElectors]);

  // Learned swing model: input built once per state, forecast re-simulated on slider changes
  const useSwing = debouncedPredParams.predictionMode === 'swing';
  const swingInput = useMemo(() => (predData ? buildSwingInput(predData) : null), [predData]);
  const swingLearned = useMemo(() => (swingInput ? learnedSwing(swingInput) : {}), [swingInput]);
  const swingRun = useMemo(() => {
    if (!useSwing || !predData || !swingInput) return null;
    return runSwingModel(predData, swingInput, debouncedPredParams, growthFactor);
  }, [useSwing, predData, swingInput, debouncedPredParams, growthFactor]);

  // Compute baseline predictions (only re-runs when core params change)
  const formulaBaseline = useMemo(() => {
    if (!predData || useSwing) return [];
    return generateBaseline(
      predData.constituencies,
      {
        antiIncumbencyPct: debouncedPredParams.antiIncumbencyPct,
        turnoutPct: debouncedPredParams.turnoutPct,
        growthFactor,
      },
      {
        turnoutChange: debouncedPredParams.turnoutChange,
        incumbencyFatigue: debouncedPredParams.incumbencyFatigue,
        turncoatPenalty: debouncedPredParams.turncoatPenalty,
        recontestBonus: debouncedPredParams.recontestBonus,
        sameConstituencyBonus: debouncedPredParams.sameConstituencyBonus,
        previousMarginFactor: debouncedPredParams.previousMarginFactor,
        enopFactor: debouncedPredParams.enopFactor,
        nCandFactor: debouncedPredParams.nCandFactor,
        constituencyTypeFactor: debouncedPredParams.constituencyTypeFactor,
        genderFactor: debouncedPredParams.genderFactor,
        partyStrengthFactor: debouncedPredParams.partyStrengthFactor,
        partyVoteShareFactor: debouncedPredParams.partyVoteShareFactor,
      },
      predData._state || null
    );
  }, [
    predData,
    debouncedPredParams.antiIncumbencyPct,
    debouncedPredParams.turnoutPct,
    debouncedPredParams.turnoutChange,
    debouncedPredParams.incumbencyFatigue,
    debouncedPredParams.turncoatPenalty,
    debouncedPredParams.recontestBonus,
    debouncedPredParams.sameConstituencyBonus,
    debouncedPredParams.previousMarginFactor,
    debouncedPredParams.enopFactor,
    debouncedPredParams.nCandFactor,
    debouncedPredParams.constituencyTypeFactor,
    debouncedPredParams.genderFactor,
    debouncedPredParams.partyStrengthFactor,
    debouncedPredParams.partyVoteShareFactor,
    growthFactor,
    useSwing,
  ]);
  const baseline = swingRun ? swingRun.results : formulaBaseline;

  // Apply new party on top of baseline, then alliance transfers
  const predictions = useMemo(() => {
    if (!baseline.length) return baseline;
    let result = baseline;
    if (debouncedPredParams.newPartyName && debouncedPredParams.newPartyStatewideVoteShare > 0) {
      result = applyNewParty(result, {
        name: debouncedPredParams.newPartyName,
        color: debouncedPredParams.newPartyColor,
        statewideVoteShare: debouncedPredParams.newPartyStatewideVoteShare,
        affinityWeights: debouncedPredParams.affinityWeights,
        constituencyOverrides: debouncedPredParams.constituencyOverrides,
      });
    }
    if (debouncedPredParams.allianceConfig.length > 0) {
      result = applyAllianceTransfers(result, debouncedPredParams.allianceConfig);
    }
    return result;
  }, [
    baseline,
    debouncedPredParams.newPartyName,
    debouncedPredParams.newPartyColor,
    debouncedPredParams.newPartyStatewideVoteShare,
    debouncedPredParams.affinityWeights,
    debouncedPredParams.constituencyOverrides,
    debouncedPredParams.allianceConfig,
  ]);

  const summary = useMemo(() => {
    const agg = aggregateResults(predictions);
    // The learned model's simulated seat ranges and chances replace the formula's rough
    // ranges, unless a new-party or alliance scenario has reshaped the votes afterwards
    const scenario =
      (debouncedPredParams.newPartyName && debouncedPredParams.newPartyStatewideVoteShare > 0) ||
      debouncedPredParams.allianceConfig.length > 0;
    if (!swingRun || scenario) return agg;
    // Headline seats are the simulated average: adding up each seat's favourite would hand a
    // party that is 60% likely everywhere every seat
    const sim = new Map(swingRun.forecast.parties.map((p) => [p.party, p]));
    return {
      ...agg,
      parties: agg.parties
        .map((p) => {
          const s = sim.get(p.party);
          return s
            ? {
                ...p,
                seats: Math.round(s.mean),
                seatRangeLow: s.low,
                seatRangeHigh: s.high,
                pLargest: s.pLargest,
                pMajority: s.pMajority,
              }
            : { ...p, seats: 0 };
        })
        .sort((a, b) => b.seats - a.seats || b.avgVoteShare - a.avgVoteShare),
    };
  }, [
    predictions,
    swingRun,
    debouncedPredParams.newPartyName,
    debouncedPredParams.newPartyStatewideVoteShare,
    debouncedPredParams.allianceConfig,
  ]);

  // Build actual seat counts from latest election for comparison
  const actualLatest = useMemo(() => {
    if (!predData) return [];
    const seats: Record<string, number> = {};
    predData.constituencies.forEach((c) => {
      const party = normalizeParty(c.winner_party_latest);
      if (party) seats[party] = (seats[party] || 0) + 1;
    });
    return Object.entries(seats)
      .map(([party, count]) => ({ party, seats: count }))
      .sort((a, b) => b.seats - a.seats);
  }, [predData]);

  // Handle adding constituency override from table click
  const handleConstituencyOverride = useCallback(
    (name: string) => {
      if (!predParams.newPartyName) return;
      const current = predParams.constituencyOverrides[name];
      const val = current !== undefined ? undefined : predParams.newPartyStatewideVoteShare;
      const next = { ...predParams.constituencyOverrides };
      if (val === undefined) delete next[name];
      else next[name] = val;
      setPredParams((prev) => ({ ...prev, constituencyOverrides: next }));
    },
    [predParams]
  );

  // Load bookmark params
  const handleLoadBookmark = useCallback(
    (params: Record<string, unknown> | null) => {
      if (params) {
        const { state_name, ...rest } = params;
        setPredParams({ ...DEFAULT_PREDICTION_PARAMS, ...rest } as AppPredictionParams);
        setShowBookmarks(false);
        const targetState = (state_name as string) || selectedState;
        if (targetState !== selectedState) {
          selectState(targetState);
          setPredData(null);
        }
        navigate(`/state/${targetState}/predictions`);
      }
    },
    [navigate, selectedState, selectState]
  );

  // Determine active nav from path
  const path = location.pathname;
  const isNational = path.startsWith('/national');
  const isLanding = path === '/';
  const mode = isNational ? 'national' : isLanding ? null : 'state';
  const stateTabs = [
    { key: 'overview', label: 'Overview', match: (p: string) => p.endsWith('/overview') },
    {
      key: 'constituencies',
      label: 'Constituencies',
      match: (p: string) => p.includes('/constituencies'),
    },
    { key: 'marginal', label: 'Marginal seats', match: (p: string) => p.endsWith('/marginal') },
    { key: 'claim-check', label: 'Claim check', match: (p: string) => p.endsWith('/claim-check') },
    ...(electionType === 'AE'
      ? [
          {
            key: 'predictions',
            label: `${stats?.next_election_year || 'Next'} simulator`,
            match: (p: string) => p.endsWith('/predictions'),
            auth: true,
          },
        ]
      : []),
    {
      key: 'community',
      label: 'Community',
      match: (p: string) => p.endsWith('/community'),
      auth: true,
    },
  ];

  // Sync state from URL for /state/:name/* routes
  useEffect(() => {
    const match = path.match(/^\/state\/([^/]+)/);
    if (match && match[1] !== selectedState) {
      const urlState = decodeURIComponent(match[1]);
      const valid = states.find((s) => s.state_name === urlState);
      if (valid) {
        selectState(urlState);
        setPredData(null);
        setPredParams({ ...DEFAULT_PREDICTION_PARAMS });
      }
    }
  }, [path, states]);

  return (
    <ErrorBoundary>
      <div
        className={`app app-shell bg-transparent text-neutral-200 pb-20 md:pb-0 ${immersive ? 'is-immersive' : ''}`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-neutral-900 focus:text-primary-400 focus:px-4 focus:py-2 focus:rounded"
        >
          Skip to main content
        </a>
        <header role="banner" className="app-header glass safe-top sticky top-0 z-40">
          <div className="page-width flex items-center gap-2 px-4 h-14 md:h-16 md:gap-3 md:px-8">
            <a
              href="/"
              aria-label="Election Swings home"
              className="shrink-0 rounded-lg"
              onClick={(e) => {
                e.preventDefault();
                navigate(user ? '/national' : '/');
              }}
            >
              <Logo compact />
            </a>
            <div
              className="scope-switch hidden md:flex ml-4 p-1 rounded-full bg-neutral-900/80 border border-neutral-800"
              role="group"
              aria-label="Scope"
            >
              {(
                [
                  ['national', 'National', '/national'],
                  ['state', 'State', `/state/${selectedState}/overview`],
                ] as const
              ).map(([key, label, to]) => (
                <button
                  key={key}
                  aria-pressed={mode === key}
                  className={`px-4 h-8 rounded-full text-sm transition-colors cursor-pointer ${mode === key ? 'bg-saffron text-black font-semibold shadow-sm' : 'text-neutral-400 hover:text-white'}`}
                  onClick={() => navigate(to)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            {!isNational && !isLanding && (
              <select
                value={selectedState}
                aria-label="Select state"
                className="bg-neutral-900/80 border border-neutral-800 text-neutral-100 rounded-full pl-3 pr-8 h-9 text-sm w-[9.5rem] sm:w-auto sm:max-w-[13rem] cursor-pointer hover:border-neutral-600 transition-colors"
                onChange={(e) => {
                  selectState(e.target.value);
                  setPredData(null);
                  setPredParams({ ...DEFAULT_PREDICTION_PARAMS });
                  navigate(`/state/${e.target.value}/overview`);
                }}
              >
                {states
                  .slice()
                  .sort((a, b) => a.display_name.localeCompare(b.display_name))
                  .map((s) => (
                    <option key={s.state_name} value={s.state_name}>
                      {s.display_name}
                    </option>
                  ))}
              </select>
            )}
            {!isNational && !isLanding && (
              <div className="hidden lg:block">
                <ElectionTypeToggle />
              </div>
            )}
            <IconButton
              label="Full screen"
              onClick={() => setImmersive(true)}
              icon={<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
            />
            {user ? (
              <Suspense fallback={null}>
                <UserMenu />
              </Suspense>
            ) : (
              <button
                className="bg-primary-400 text-black font-semibold px-4 h-9 rounded-full text-sm hover:bg-primary-300 transition-colors cursor-pointer shrink-0"
                onClick={() => setShowLogin(true)}
              >
                Sign in
              </button>
            )}
          </div>
          <div className="tricolour-rule" aria-hidden="true" />
        </header>

        {!isLanding && (
          <div className="page-hero page-width px-4 pt-5 pb-3 md:px-8 md:pt-8 md:pb-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-saffron mb-1.5">
                  {isNational
                    ? 'All India'
                    : electionType === 'GE'
                      ? 'Lok Sabha · General elections'
                      : 'Vidhan Sabha · Assembly elections'}
                </p>
                <h1 className="text-2xl font-semibold text-white md:text-3xl lg:text-4xl">
                  {isNational
                    ? 'National election dashboard'
                    : `${stats?.state_name || 'Election'} election analysis`}
                </h1>
                <p className="header-subtitle text-sm text-neutral-400 mt-1.5">
                  {isNational ? (
                    'Every state, every party, every election since independence'
                  ) : stats ? (
                    <>
                      <span className="tabular text-neutral-200">
                        {stats.year_min}–{stats.year_max}
                      </span>
                      {' · '}
                      <span className="tabular text-neutral-200">
                        {stats.total_constituencies}
                      </span>{' '}
                      constituencies ·{' '}
                      <span className="tabular text-neutral-200">{stats.general_years.length}</span>{' '}
                      general elections
                    </>
                  ) : (
                    'Loading…'
                  )}
                </p>
              </div>
              {!isNational && (
                <div className="lg:hidden">
                  <ElectionTypeToggle />
                </div>
              )}
            </div>
            {!isNational && (
              <nav
                role="navigation"
                aria-label="State navigation"
                className="scroll-x -mx-4 px-4 mt-5 flex gap-1.5 md:mx-0 md:px-0 md:gap-1 md:border-b md:border-neutral-800"
              >
                {stateTabs.map((t) => {
                  const active = t.match(path);
                  return (
                    <button
                      key={t.key}
                      aria-current={active ? 'page' : undefined}
                      className={`shrink-0 whitespace-nowrap text-sm cursor-pointer transition-colors h-9 px-4 rounded-full border md:h-11 md:px-3.5 md:rounded-none md:border-0 md:border-b-2 md:-mb-px ${active ? 'bg-primary-400 text-black border-primary-400 font-semibold md:bg-transparent md:text-white md:border-primary-400' : 'bg-neutral-900/70 border-neutral-800 text-neutral-400 hover:text-white md:bg-transparent md:border-transparent'}`}
                      onClick={() => {
                        if (t.auth && !user) {
                          setShowLogin(true);
                          return;
                        }
                        navigate(`/state/${selectedState}/${t.key}`);
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </nav>
            )}
          </div>
        )}
        <main id="main-content" role="main" className="page-width px-4 md:px-8">
          <Suspense fallback={<Loading />}>
            <AnimatePresence mode="wait">
              <motion.div key={`${path}:${cbSafe}`} {...(lowData ? {} : pageTransition)}>
                <Routes>
                  {/* Landing page */}
                  <Route
                    path="/"
                    element={
                      !loading && user ? (
                        <Navigate to="/national" replace />
                      ) : (
                        <Landing stats={stats} onGetStarted={() => setShowLogin(true)} />
                      )
                    }
                  />

                  {/* National dashboard routes */}
                  <Route path="/national" element={<NationalDashboard initialTab="map" />} />
                  <Route
                    path="/national/parties"
                    element={<NationalDashboard initialTab="parties" />}
                  />
                  <Route
                    path="/national/compare"
                    element={<NationalDashboard initialTab="compare" />}
                  />
                  <Route
                    path="/national/timeline"
                    element={<NationalDashboard initialTab="timeline" />}
                  />

                  {/* State-scoped routes */}
                  <Route path="/state/:stateName/overview" element={<StateOverview />} />
                  <Route
                    path="/state/:stateName/constituencies"
                    element={
                      <ConstituencyList
                        onSelect={(name) =>
                          navigate(
                            `/state/${selectedState}/constituencies/${encodeURIComponent(name)}`
                          )
                        }
                      />
                    }
                  />
                  <Route path="/state/:stateName/marginal" element={<MarginalSeats />} />
                  <Route path="/state/:stateName/claim-check" element={<ClaimCheck />} />
                  <Route
                    path="/state/:stateName/constituencies/:name"
                    element={
                      <ConstituencyDetailRoute
                        onBack={() => navigate(`/state/${selectedState}/constituencies`)}
                      />
                    }
                  />
                  <Route
                    path="/state/:stateName/predictions"
                    element={
                      <RequireAuth>
                        {electionType === 'GE' ? (
                          <Navigate to={`/state/${selectedState}/overview`} replace />
                        ) : predLoading ? (
                          <div className="text-center py-16 text-neutral-400">
                            Loading prediction data for {stats?.total_constituencies || ''}{' '}
                            constituencies...
                          </div>
                        ) : (
                          <>
                            <Disclaimer />
                            <div className="flex flex-wrap gap-2 mb-4">
                              <button
                                className="bg-primary-400 text-black font-semibold text-sm px-4 py-2 rounded-md min-h-[44px] md:min-h-0 hover:opacity-90 transition-opacity cursor-pointer"
                                onClick={() => setShowSave(true)}
                              >
                                Save Prediction
                              </button>
                              <button
                                className="bg-neutral-800 text-neutral-200 text-sm px-4 py-2 rounded-md min-h-[44px] md:min-h-0 border border-neutral-700 hover:bg-neutral-700 transition-colors cursor-pointer"
                                onClick={() => setShowBookmarks(!showBookmarks)}
                              >
                                {showBookmarks ? 'Hide' : 'My'} Bookmarks
                              </button>
                            </div>
                            {showBookmarks && <MyBookmarks onLoad={handleLoadBookmark} />}
                            <div className="flex flex-col lg:flex-row gap-4">
                              <PredictionPanel
                                params={predParams}
                                onChange={setPredParams}
                                presets={dynamicPresets}
                                topParties={topParties}
                                stateName={selectedState}
                                swingInfo={
                                  swingInput
                                    ? {
                                        largest: swingInput.largest,
                                        learned: swingLearned,
                                        lsYear: predData?.ls_year ?? null,
                                      }
                                    : undefined
                                }
                              />
                              <div className="flex-1 min-w-0">
                                <PredictionResults
                                  summary={summary}
                                  actualLatest={actualLatest}
                                  latestYear={predData?.latest_year}
                                  nextYear={stats?.next_election_year}
                                  newPartyColor={predParams.newPartyColor}
                                  newPartyName={predParams.newPartyName}
                                />
                                <PredictionConstituencyTable
                                  predictions={predictions}
                                  onOverride={handleConstituencyOverride}
                                  latestYear={predData?.latest_year}
                                  nextYear={stats?.next_election_year}
                                />
                              </div>
                            </div>
                          </>
                        )}
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/state/:stateName/community"
                    element={
                      <RequireAuth>
                        <CommunityFeed onLoad={handleLoadBookmark} />
                      </RequireAuth>
                    }
                  />

                  {/* Legal pages */}
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  <Route path="/pricing" element={<PricingPage />} />
                  <Route path="/support" element={<SupportPage />} />
                  <Route path="/glossary" element={<GlossaryPage />} />
                  <Route path="/learn" element={<LearnPage />} />
                  <Route path="/vote" element={<VoterInfoPage />} />
                  <Route path="/methodology" element={<MethodologyPage />} />

                  {/* Backward compatibility redirects */}
                  <Route
                    path="/overview"
                    element={<Navigate to={`/state/${selectedState}/overview`} replace />}
                  />
                  <Route
                    path="/constituencies"
                    element={<Navigate to={`/state/${selectedState}/constituencies`} replace />}
                  />
                  <Route
                    path="/constituencies/:name"
                    element={<Navigate to={`/state/${selectedState}/constituencies`} replace />}
                  />
                  <Route
                    path="/predictions"
                    element={<Navigate to={`/state/${selectedState}/predictions`} replace />}
                  />
                  <Route
                    path="/community"
                    element={<Navigate to={`/state/${selectedState}/community`} replace />}
                  />

                  {/* Catch-all */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </main>
        <footer className="app-footer border-t border-neutral-800 mt-16 bg-neutral-950/60">
          <div className="page-width px-4 py-10 md:px-8 grid gap-8 text-sm text-neutral-400 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
            <div className="space-y-3">
              <Logo />
              <p className="text-xs leading-relaxed max-w-sm">
                For analytical exploration only. Simulations are mathematical scenarios, not
                electoral forecasts. Not affiliated with the Election Commission of India. Thanks
                Afrah for motivation!!!
              </p>
              <p className="text-xs">
                Data:{' '}
                <a
                  href="https://tcpd.ashoka.edu.in/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-300 hover:underline"
                >
                  Trivedi Centre for Political Data (TCPD), Ashoka University
                </a>
                {' · '}
                <a
                  href="https://lokdhaba.ashoka.edu.in/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-300 hover:underline"
                >
                  Lok Dhaba
                </a>
              </p>
            </div>
            <FooterLinks
              title="Learn"
              links={[
                ['/learn', 'Learn'],
                ['/glossary', 'Glossary'],
                ['/methodology', 'Methodology'],
                ['/vote', 'Register to vote'],
              ]}
            />
            <FooterLinks
              title="About"
              links={[
                ['/privacy', 'Privacy Policy'],
                ['/terms', 'Terms of Service'],
                ['https://github.com/cnickson/elec', 'Source code (MIT)'],
              ]}
            />
            <div>
              <h2 className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-neutral-300 mb-3">
                Display
              </h2>
              <div className="flex flex-col items-start gap-2">
                <button
                  type="button"
                  aria-pressed={lowData}
                  onClick={() => setLowData(!lowData)}
                  className="text-primary-300 hover:underline cursor-pointer min-h-[44px] md:min-h-0"
                >
                  Low-data mode: {lowData ? 'On' : 'Off'}
                </button>
                <button
                  type="button"
                  aria-pressed={cbSafe}
                  onClick={() => {
                    setColourBlindSafe(!cbSafe);
                    setCbSafe(!cbSafe);
                  }}
                  className="text-primary-300 hover:underline cursor-pointer min-h-[44px] md:min-h-0"
                >
                  Colour-blind-safe colours: {cbSafe ? 'On' : 'Off'}
                </button>
                <label className="flex items-center gap-2">
                  Theme
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as Theme)}
                    className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-full px-3 h-9 text-xs cursor-pointer"
                  >
                    {THEMES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setImmersive(true)}
                  className="text-primary-300 hover:underline cursor-pointer min-h-[44px] md:min-h-0"
                >
                  Full screen
                </button>
              </div>
            </div>
          </div>
        </footer>

        {immersive && (
          <button
            type="button"
            onClick={() => setImmersive(false)}
            aria-label="Exit full screen"
            className="immersive-exit glass flex items-center justify-center gap-2 rounded-full border border-neutral-700 w-11 sm:w-auto sm:px-4 h-11 text-sm text-neutral-100 shadow-lg cursor-pointer"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            </svg>
            <span className="hidden sm:inline">Exit full screen</span>
          </button>
        )}

        {/* Modals */}
        <Suspense fallback={null}>
          <LoginModal open={showLogin} onOpenChange={setShowLogin} />
        </Suspense>
        <Suspense fallback={null}>
          {showSave && (
            <SaveBookmarkModal
              params={predParams}
              stateName={selectedState}
              open={showSave}
              onOpenChange={setShowSave}
              onSaved={() => setShowSave(false)}
            />
          )}
        </Suspense>

        {/* Mobile bottom navigation */}
        <BottomNav selectedState={selectedState} />
      </div>
    </ErrorBoundary>
  );
}
