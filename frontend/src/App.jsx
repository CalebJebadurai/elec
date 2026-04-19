import { useState, useEffect, useMemo, useCallback } from 'react';
import StateOverview from './components/StateOverview';
import ConstituencyList from './components/ConstituencyList';
import ConstituencyDetail from './components/ConstituencyDetail';
import PredictionPanel from './components/PredictionPanel';
import PredictionResults from './components/PredictionResults';
import PredictionConstituencyTable from './components/PredictionConstituencyTable';
import LoginModal from './components/LoginModal';
import UserMenu from './components/UserMenu';
import SaveBookmarkModal from './components/SaveBookmarkModal';
import MyBookmarks from './components/MyBookmarks';
import CommunityFeed from './components/CommunityFeed';
import Disclaimer from './components/Disclaimer';
import ErrorBoundary from './components/ErrorBoundary';
import { useAuth } from './contexts/AuthContext';
import { api } from './api';
import { DEFAULT_PREDICTION_PARAMS, normalizeParty, buildAffinityPresets } from './constants';
import { generateBaseline, applyNewParty, aggregateResults } from './engine/predictionEngine';
import './index.css';

export default function App() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [selected, setSelected] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showCommunity, setShowCommunity] = useState(false);

  // App-level stats (drives dynamic headings)
  const [stats, setStats] = useState(null);

  // Prediction state
  const [predData, setPredData] = useState(null);
  const [predLoading, setPredLoading] = useState(false);
  const [predParams, setPredParams] = useState({ ...DEFAULT_PREDICTION_PARAMS });

  // Load stats on mount
  useEffect(() => {
    api.stats().then(setStats).catch(console.error);
  }, []);

  function handleSelect(name) {
    setSelected(name);
    setTab('detail');
  }

  function handleBack() {
    setSelected(null);
    setTab('constituencies');
  }

  // Load prediction data when tab is activated
  useEffect(() => {
    if (tab === 'prediction' && !predData) {
      setPredLoading(true);
      api.predictionData()
        .then((data) => setPredData(data))
        .catch(console.error)
        .finally(() => setPredLoading(false));
    }
  }, [tab, predData]);

  // Derive top parties and dynamic affinity presets from prediction data
  const topParties = useMemo(() => {
    if (!predData) return [];
    const seats = {};
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

  // Compute growth factor
  const growthFactor = useMemo(() => {
    if (!predData) return 1;
    return predData.total_electors_next / predData.total_electors_latest;
  }, [predData]);

  // Compute predictions reactively from params
  const predictions = useMemo(() => {
    if (!predData) return [];
    const baseline = generateBaseline(predData.constituencies, {
      antiIncumbencyPct: predParams.antiIncumbencyPct,
      turnoutPct: predParams.turnoutPct,
      growthFactor,
    });
    if (predParams.newPartyName && predParams.newPartyStatewideVoteShare > 0) {
      return applyNewParty(baseline, {
        name: predParams.newPartyName,
        color: predParams.newPartyColor,
        statewideVoteShare: predParams.newPartyStatewideVoteShare,
        affinityWeights: predParams.affinityWeights,
        constituencyOverrides: predParams.constituencyOverrides,
      });
    }
    return baseline;
  }, [predData, predParams, growthFactor]);

  const summary = useMemo(() => aggregateResults(predictions), [predictions]);

  // Build actual seat counts from latest election for comparison
  const actualLatest = useMemo(() => {
    if (!predData) return [];
    const seats = {};
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
    (name) => {
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
  const handleLoadBookmark = useCallback((params) => {
    if (params) {
      setPredParams({ ...DEFAULT_PREDICTION_PARAMS, ...params });
      setShowBookmarks(false);
      setShowCommunity(false);
      setTab('prediction');
    }
  }, []);

  return (
    <ErrorBoundary>
      <div className="app">
        <header>
          <div className="header-top">
            <div>
              <h1>{stats?.state_name || 'Election'} Election Analysis</h1>
              <p className="subtitle">
                {stats
                  ? `Assembly Elections ${stats.year_min}–${stats.year_max} · ${stats.total_constituencies} Constituencies · ${stats.general_years.length} General Elections`
                  : 'Loading…'}
              </p>
            </div>
            <div className="header-actions">
              {user ? (
                <UserMenu />
              ) : (
                <button className="btn-login" onClick={() => setShowLogin(true)}>
                  Sign In
                </button>
              )}
            </div>
          </div>
          <nav>
            <button className={tab === 'overview' ? 'active' : ''} onClick={() => {
              if (!user) { setShowLogin(true); return; }
              setTab('overview'); setSelected(null);
            }}>
              State Overview
            </button>
            <button className={tab === 'constituencies' || tab === 'detail' ? 'active' : ''} onClick={() => {
              if (!user) { setShowLogin(true); return; }
              setTab('constituencies'); setSelected(null);
            }}>
              Constituencies
            </button>
            <button className={tab === 'prediction' ? 'active' : ''} onClick={() => {
              if (!user) { setShowLogin(true); return; }
              setTab('prediction');
            }}>
              {stats?.next_election_year || 'Next'} Prediction
            </button>
            <button className={tab === 'community' ? 'active' : ''} onClick={() => {
              if (!user) { setShowLogin(true); return; }
              setTab('community');
            }}>
              Community
            </button>
          </nav>
        </header>
        <main>
          {!user && tab === 'overview' && (
            <div className="hero">
              <div className="hero-glow" />
              <div className="hero-content">
                <span className="hero-badge">Free &amp; Open Source</span>
                <h2 className="hero-title">
                  Explore {stats?.total_years || ''} Years of<br />
                  <span className="hero-accent">Election Data</span>
                </h2>
                <p className="hero-desc">
                  Dive into {stats?.total_constituencies || '—'} constituencies, track party swings, 
                  run what-if predictions, and share scenarios with the community.
                </p>
                <button className="hero-cta" onClick={() => setShowLogin(true)}>
                  Get Started
                  <span className="hero-cta-arrow">→</span>
                </button>
              </div>
              <div className="hero-features">
                <div className="hero-feature">
                  <div className="hero-feature-icon">📊</div>
                  <h3>State Overview</h3>
                  <p>Vote share trends, party dominance, and turnout patterns across decades.</p>
                </div>
                <div className="hero-feature">
                  <div className="hero-feature-icon">🗺️</div>
                  <h3>Constituency Deep Dive</h3>
                  <p>Swing history, winning margins, and candidate performance for every seat.</p>
                </div>
                <div className="hero-feature">
                  <div className="hero-feature-icon">🔮</div>
                  <h3>{stats?.next_election_year || 'Next'} Predictions</h3>
                  <p>Model scenarios with anti-incumbency, turnout, and hypothetical new parties.</p>
                </div>
                <div className="hero-feature">
                  <div className="hero-feature-icon">👥</div>
                  <h3>Community</h3>
                  <p>Share your prediction scenarios and vote on others' analyses.</p>
                </div>
              </div>
              {stats && (
                <div className="hero-stats">
                  <div className="hero-stat">
                    <span className="hero-stat-value">{stats.general_years.length}</span>
                    <span className="hero-stat-label">Elections</span>
                  </div>
                  <div className="hero-stat">
                    <span className="hero-stat-value">{stats.total_constituencies}</span>
                    <span className="hero-stat-label">Constituencies</span>
                  </div>
                  <div className="hero-stat">
                    <span className="hero-stat-value">{stats.total_parties}</span>
                    <span className="hero-stat-label">Parties</span>
                  </div>
                  <div className="hero-stat">
                    <span className="hero-stat-value">{(stats.total_electors_latest / 1e6).toFixed(0)}M</span>
                    <span className="hero-stat-label">Electors</span>
                  </div>
                </div>
              )}
            </div>
          )}
          {user && tab === 'overview' && <StateOverview />}
          {user && tab === 'constituencies' && <ConstituencyList onSelect={handleSelect} />}
          {user && tab === 'detail' && selected && <ConstituencyDetail name={selected} onBack={handleBack} />}
          {user && tab === 'prediction' && (
            predLoading ? (
              <div className="loading">Loading prediction data for {stats?.total_constituencies || ''} constituencies...</div>
            ) : (
              <>
                <Disclaimer />
                <div className="pred-toolbar">
                  <button className="btn-sm btn-primary" onClick={() => setShowSave(true)}>
                    Save Prediction
                  </button>
                  <button className="btn-sm btn-secondary" onClick={() => setShowBookmarks(!showBookmarks)}>
                    {showBookmarks ? 'Hide' : 'My'} Bookmarks
                  </button>
                </div>
                {showBookmarks && <MyBookmarks onLoad={handleLoadBookmark} />}
                <div className="pred-layout">
                  <PredictionPanel params={predParams} onChange={setPredParams} presets={dynamicPresets} topParties={topParties} />
                  <div className="pred-main">
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
            )
          )}
          {user && tab === 'community' && (
            <CommunityFeed onLoad={handleLoadBookmark} />
          )}
        </main>
        <footer className="app-footer">
          <div className="footer-content">
            <p>
              Data: <a href="https://tcpd.ashoka.edu.in/" target="_blank" rel="noopener noreferrer">
                Trivedi Centre for Political Data (TCPD), Ashoka University
              </a>
            </p>
            <p className="footer-legal">
              This tool is for analytical exploration only. Predictions are mathematical simulations,
              not electoral forecasts. Not affiliated with the Election Commission of India.
              Thanks Afrah for motivation!!!
            </p>
            <p className="footer-links">
              <a href="https://github.com/cnickson/elec" target="_blank" rel="noopener noreferrer">
                Source Code
              </a>
              {' · '}
              Open Source under MIT License
            </p>
          </div>
        </footer>

        {/* Modals */}
        {showLogin && <LoginModal initialStep={user && !user.google_email ? 'google' : 'phone'} onClose={() => setShowLogin(false)} />}
        {user && !user.google_email && !showLogin && (
          <LoginModal initialStep="google" onClose={() => {}} />
        )}
        {showSave && (
          <SaveBookmarkModal
            params={predParams}
            onClose={() => setShowSave(false)}
            onSaved={() => setShowSave(false)}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
