import React, { useState, useEffect, createContext, useContext } from 'react';
import {
  TrendingUp, TrendingDown, AlertTriangle, Target, Calendar,
  Activity, Zap, Star, Flame, Eye, Loader2, AlertCircle,
  CheckCircle2, RefreshCw, Database, Sparkles, Crown, Trophy
} from 'lucide-react';

/**
 * IMPORTANT:
 * - This component assumes you have backend endpoints at:
 *   - GET  /api/auth/yahoo/login               -> redirects user to Yahoo
 *   - GET  /api/auth/yahoo/callback?code=...   -> exchanges code for tokens (sets cookie)
 *   - GET  /api/yahoo/leagues                  -> lists user leagues
 *   - GET  /api/yahoo/league/:leagueId/waiver  -> returns FA (free agents) in that league
 *
 * - Do NOT put your Client Secret in the frontend. Only the backend uses it.
 * - Frontend may reference NEXT_PUBLIC_YAHOO_CLIENT_ID (public) if you want to build auth URL client-side,
 *   but this example uses backend /api/auth/yahoo/login so you don't leak secrets or mess with params.
 */

// ---------- Context ----------
const FantasyContext = createContext(null);
const useFantasyContext = () => {
  const ctx = useContext(FantasyContext);
  if (!ctx) throw new Error('useFantasyContext must be used within FantasyContext.Provider');
  return ctx;
};

// ---------- App Config ----------
const APP_CONFIG = {
  defaultLeagues: {
    Yahoo: {
      id: '747884',               // raw numeric id you shared
      keyPrefix: 'nfl.l.',        // Yahoo league key = nfl.l.<id>
      name: 'Your Yahoo League',
      url: (id) => `https://football.fantasysports.yahoo.com/f1/${id}`
    },
    ESPN: { id: '1237285', name: 'ESPN League Example' },
    Sleeper: { id: '123456789012345678', name: 'Sleeper Example' }
  },
  currentWeek: 3,
  currentYear: 2024,
  season: '2024'
};

// ---------- Static Fallback Data (used until live data is fetched) ----------
const ENHANCED_PLAYER_DATA = {
  waiverTargets: [
    { id: 1, name: 'Jordan Mason', position: 'RB', team: 'SF', ownershipPct: 23, priorityScore: 98, urgency: 'HIGH', opportunityType: 'INJURY_REPLACEMENT', reason: 'CMC on IR - Mason is the clear RB1 in elite SF offense', weeklyProjection: { min: 12, max: 22, avg: 16.8 }, metrics: { 'Snap Share': '85%', 'Touch Share': '78%', 'Goal Line Work': '100%', 'RB1 Weeks': '3/3' }, recentNews: 'Three straight RB1 performances with CMC out', rosterAdvice: 'MUST-ADD - Potential league winner', trend: 'UP', faabBid: '$40-60' },
    { id: 2, name: 'Malik Nabers', position: 'WR', team: 'NYG', ownershipPct: 67, priorityScore: 95, urgency: 'HIGH', opportunityType: 'ROOKIE_BREAKOUT', reason: 'Elite rookie WR, massive target share, Daniel Jones connection', weeklyProjection: { min: 10, max: 20, avg: 14.2 }, metrics: { 'Target Share': '31%', 'Air Yards/Game': '112', 'Slot Rate': '68%', 'First Downs': '18' }, recentNews: '10+ targets in consecutive games', rosterAdvice: 'WR2 with WR1 ceiling - priority add', trend: 'UP', faabBid: '$35-50' },
    { id: 3, name: 'Bucky Irving', position: 'RB', team: 'TB', ownershipPct: 41, priorityScore: 89, urgency: 'HIGH', opportunityType: 'BACKFIELD_EMERGENCE', reason: 'Overtaking White for lead role, explosive plays', weeklyProjection: { min: 8, max: 16, avg: 11.5 }, metrics: { 'YPC': '6.2', 'Explosive Runs': '12', 'Snap Trend': '+38%', 'Goal Line Looks': '4' }, recentNews: 'Two TDs last week, passing White in depth chart', rosterAdvice: 'RB2 upside with great playoff schedule', trend: 'UP', faabBid: '$25-40' },
    { id: 4, name: 'Tank Dell', position: 'WR', team: 'HOU', ownershipPct: 52, priorityScore: 86, urgency: 'MEDIUM', opportunityType: 'TARGET_MONOPOLY', reason: 'Nico Collins injury opens massive target share', weeklyProjection: { min: 9, max: 18, avg: 13.1 }, metrics: { 'Route %': '89%', 'Red Zone Targets': '8', 'Stroud Chemistry': 'Elite', 'Deep Targets': '15' }, recentNews: 'Nico Collins to miss 4+ weeks', rosterAdvice: 'WR2 while Collins out, hold through return', trend: 'UP', faabBid: '$20-35' },
    { id: 5, name: 'Tyler Allgeier', position: 'RB', team: 'ATL', ownershipPct: 34, priorityScore: 82, urgency: 'MEDIUM', opportunityType: 'GOAL_LINE_SPECIALIST', reason: 'Red zone role expanding, Bijan load management', weeklyProjection: { min: 6, max: 14, avg: 9.2 }, metrics: { 'Goal Line Carries': '9', 'Short Yardage %': '71%', 'Handcuff Value': 'Elite', 'TD Upside': 'High' }, recentNews: 'Three TDs in last four games', rosterAdvice: 'Great handcuff with standalone TD value', trend: 'STEADY', faabBid: '$15-25' },
    { id: 6, name: 'Keon Coleman', position: 'WR', team: 'BUF', ownershipPct: 28, priorityScore: 78, urgency: 'MEDIUM', opportunityType: 'ROOKIE_DEVELOPMENT', reason: 'Josh Allen connection growing, red zone target', weeklyProjection: { min: 5, max: 15, avg: 8.7 }, metrics: { 'Red Zone Targets': '6', 'Deep Target %': '24%', 'Catch Rate': '68%', 'YAC Average': '5.8' }, recentNews: 'Allen praising Coleman in press conferences', rosterAdvice: 'Stash for upside - could breakout any week', trend: 'UP', faabBid: '$12-20' }
  ],
  injuryUpdates: [
    { id: 1, player: 'Christian McCaffrey', team: 'SF', position: 'RB', status: 'IR - Achilles Tendinitis', impactLevel: 'HIGH', lastUpdate: '3 hours ago', backupTargets: [{ name: 'Jordan Mason', ownership: 23, priority: 'IMMEDIATE', faab: '$50-70' }, { name: 'Isaac Guerendo', ownership: 8, priority: 'HANDCUFF', faab: '$10-15' }], fantasyImpact: 'Mason is clear RB1 - must-add with RB1 upside', timeline: 'Minimum 4 weeks, could be season-long', weeklyImpact: '+15-20 fantasy points available' },
    { id: 2, player: 'Nico Collins', team: 'HOU', position: 'WR', status: 'IR - Hamstring', impactLevel: 'HIGH', lastUpdate: '1 day ago', backupTargets: [{ name: 'Tank Dell', ownership: 52, priority: 'IMMEDIATE', faab: '$25-40' }, { name: 'Robert Woods', ownership: 15, priority: 'DEPTH', faab: '$8-12' }], fantasyImpact: 'Dell becomes WR2 with 25+ target upside', timeline: 'Out 4-6 weeks minimum', weeklyImpact: '+12-16 fantasy points available' },
    { id: 3, player: 'Isiah Pacheco', team: 'KC', position: 'RB', status: 'IR - Fibula Fracture', impactLevel: 'MEDIUM', lastUpdate: '5 hours ago', backupTargets: [{ name: 'Kareem Hunt', ownership: 78, priority: 'ROSTERED', faab: 'N/A' }, { name: 'Samaje Perine', ownership: 12, priority: 'HANDCUFF', faab: '$5-10' }], fantasyImpact: 'Hunt locked in as RB2, Perine for depth', timeline: 'Out 6-8 weeks', weeklyImpact: 'Hunt getting 18+ touches' }
  ],
  sleepers: [
    { name: 'Demario Douglas', position: 'WR', team: 'NE', ownershipPct: 12, upside: 'Slot specialist, Maye development, target hog potential', risk: 'Patriots offense struggles, QB uncertainty', reason: 'Drake Maye era could unlock his potential', faab: '$5-10' },
    { name: 'Elijah Mitchell', position: 'RB', team: 'SF', ownershipPct: 6, upside: 'Mason handcuff, proven starter when healthy', risk: 'Injury history, limited touches currently', reason: 'One Mason injury from being lead back', faab: '$8-12' },
    { name: 'Quentin Johnston', position: 'WR', team: 'LAC', ownershipPct: 18, upside: 'Herbert connection, red zone size, breakout candidate', risk: 'Inconsistent targets, drop issues', reason: 'Talent finally matching opportunity', faab: '$10-15' }
  ],
  strategyTips: [
    { title: 'FAAB Budget Management', priority: 'HIGH', tip: 'Spend big on Mason (50-70%) - potential league winner', reasoning: 'CMC replacement in elite offense' },
    { title: 'Roster Construction', priority: 'MEDIUM', tip: 'Target RBs over WRs - scarcity is real', reasoning: 'RB injuries creating more value than WR depth' },
    { title: 'Playoff Preparation', priority: 'MEDIUM', tip: 'Check playoff schedules for targets', reasoning: 'Week 15-17 matchups matter for championships' }
  ]
};

// ---------- Fake AI Helper ----------
class FantasyAnalysisAI {
  static async analyzeLeague(leagueData) {
    await new Promise(r => setTimeout(r, 1200));
    return {
      summary: "Your league has several high-value waiver targets. Prioritize Jordan Mason (RB1 upside) and Tank Dell (WR2 ceiling with Collins out).",
      rosterGaps: [
        "Running back depth needed - only 1 startable RB on bench",
        "Consider handcuffs for your studs",
        "WR depth solid; add upside plays"
      ],
      weeklyStrategy: "Focus bids on Mason and Dell this week.",
      faabAdvice: "Aggressive week: Mason 50-70%, Dell 25-40%"
    };
  }
}

// ---------- Small UI Components ----------
const AIAnalysisCard = ({ analysisData, onRefresh, loading }) => (
  <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-xl p-6 border border-purple-500/30 backdrop-blur-sm">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-lg">AI Analysis</h3>
          <p className="text-sm text-slate-400">Powered by advanced fantasy intelligence</p>
        </div>
      </div>
      <button onClick={onRefresh} disabled={loading} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>

    {analysisData ? (
      <div className="space-y-4">
        <div className="bg-slate-800/50 rounded-lg p-4">
          <h4 className="font-semibold text-purple-300 mb-2">Weekly Summary</h4>
          <p className="text-slate-300 text-sm leading-relaxed">{analysisData.summary}</p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="font-semibold text-purple-300 mb-2">FAAB Strategy</h4>
            <p className="text-slate-300 text-sm">{analysisData.faabAdvice}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="font-semibold text-purple-300 mb-2">This Week's Focus</h4>
            <p className="text-slate-300 text-sm">{analysisData.weeklyStrategy}</p>
          </div>
        </div>
        {analysisData.rosterGaps && (
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="font-semibold text-purple-300 mb-2">Roster Gaps</h4>
            <ul className="space-y-1">
              {analysisData.rosterGaps.map((gap, idx) => (
                <li key={idx} className="text-slate-300 text-sm flex items-center space-x-2">
                  <div className="w-1 h-1 bg-purple-400 rounded-full"></div>
                  <span>{gap}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    ) : (
      <div className="text-center py-8">
        <Database className="w-12 h-12 text-slate-500 mx-auto mb-3" />
        <p className="text-slate-400">Run analysis to see AI insights</p>
      </div>
    )}
  </div>
);

const EnhancedWaiverCard = ({ player, index, showFAAB = true }) => {
  const getUrgencyConfig = (urgency) => {
    const cfg = {
      HIGH: { color: 'text-red-400 bg-red-900/30', icon: Flame, border: 'border-red-500/30' },
      MEDIUM:{ color: 'text-yellow-400 bg-yellow-900/30', icon: Star,  border: 'border-yellow-500/30' },
      LOW:  { color: 'text-green-400 bg-green-900/30', icon: Eye,   border: 'border-green-500/30' }
    };
    return cfg[urgency] || cfg.MEDIUM;
  };
  const urgencyConfig = getUrgencyConfig(player.urgency);
  const UrgencyIcon = urgencyConfig.icon;
  const trendIcon = player.trend === 'UP' ? <TrendingUp className="w-4 h-4 text-green-400" /> :
                    player.trend === 'DOWN' ? <TrendingDown className="w-4 h-4 text-red-400" /> :
                    <Activity className="w-4 h-4 text-slate-400" />;

  return (
    <div className={`bg-slate-900/50 rounded-xl p-5 border hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10 ${urgencyConfig.border}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start space-x-4">
          <div className="flex items-center justify-center w-10 h-10 bg-slate-800 rounded-lg">
            <span className="text-xl font-bold text-purple-400">#{index + 1}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h3 className="font-bold text-xl text-white">{player.name}</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                player.position === 'QB' ? 'bg-purple-900/30 text-purple-300' :
                player.position === 'RB' ? 'bg-green-900/30 text-green-300' :
                player.position === 'WR' ? 'bg-blue-900/30 text-blue-300' :
                'bg-orange-900/30 text-orange-300'
              }`}>{player.position}</span>
              <span className="text-slate-400 font-medium">{player.team}</span>
              {trendIcon}
            </div>
            <p className="text-slate-300 leading-relaxed">{player.reason}</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className={`flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium ${urgencyConfig.color}`}>
            <UrgencyIcon className="w-3 h-3" />
            <span>{player.urgency}</span>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              {player.priorityScore}
            </div>
            <div className="text-xs text-slate-500">Priority</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="text-center bg-slate-800/50 rounded-lg py-2">
          <div className="text-lg font-bold text-white">{player.ownershipPct}%</div>
          <div className="text-xs text-slate-400">Owned</div>
        </div>
        <div className="text-center bg-slate-800/50 rounded-lg py-2">
          <div className="text-lg font-bold text-purple-300">{player.weeklyProjection.avg}</div>
          <div className="text-xs text-slate-400">Proj PPG</div>
        </div>
        <div className="text-center bg-slate-800/50 rounded-lg py-2">
          <div className="text-lg font-bold text-green-300">{player.weeklyProjection.max}</div>
          <div className="text-xs text-slate-400">Ceiling</div>
        </div>
        {showFAAB && player.faabBid && (
          <div className="text-center bg-slate-800/50 rounded-lg py-2">
            <div className="text-lg font-bold text-yellow-300">{player.faabBid}</div>
            <div className="text-xs text-slate-400">FAAB Bid</div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-700 pt-4 mb-4">
        <div className="text-xs text-slate-500 mb-3">Advanced Metrics</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(player.metrics || {}).map(([k, v]) => (
            <div key={k} className="bg-slate-800/30 rounded-lg p-2 text-center">
              <div className="font-semibold text-white text-sm">{v}</div>
              <div className="text-xs text-slate-400">{k}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-700">
        <div className="text-xs text-slate-400">
          <span className="text-slate-500">News:</span> {player.recentNews || '—'}
        </div>
        <div className="text-xs font-medium text-purple-400">{player.rosterAdvice || ''}</div>
      </div>
    </div>
  );
};

const InjuryImpactCard = ({ injury }) => (
  <div className="bg-slate-900/50 rounded-xl p-5 border border-slate-600">
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-start space-x-3">
        <AlertTriangle className={`w-6 h-6 mt-1 ${injury.impactLevel === 'HIGH' ? 'text-red-400' : 'text-yellow-400'}`} />
        <div>
          <h3 className="font-bold text-xl text-white">{injury.player}</h3>
          <div className="flex items-center space-x-2 mt-1">
            <span className="text-slate-400">{injury.team} {injury.position}</span>
            <span className="text-slate-300">• {injury.status}</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">Updated {injury.lastUpdate}</div>
        </div>
      </div>
      <div className={`px-3 py-2 rounded-full text-sm font-medium ${injury.impactLevel === 'HIGH' ? 'bg-red-900/30 text-red-300' : 'bg-yellow-900/30 text-yellow-300'}`}>
        {injury.impactLevel} Impact
      </div>
    </div>

    <div className="bg-slate-800/30 rounded-lg p-4 mb-4">
      <div className="font-medium text-white mb-2">Fantasy Impact:</div>
      <div className="text-slate-300">{injury.fantasyImpact}</div>
      <div className="text-sm text-slate-400 mt-2"><strong>Timeline:</strong> {injury.timeline}</div>
      {injury.weeklyImpact && <div className="text-sm text-purple-300 mt-1"><strong>Available Points:</strong> {injury.weeklyImpact}</div>}
    </div>

    {injury.backupTargets && (
      <div>
        <div className="text-sm text-slate-500 mb-3">Immediate Waiver Targets:</div>
        <div className="grid md:grid-cols-2 gap-3">
          {injury.backupTargets.map((t, idx) => (
            <div key={idx} className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3">
              <div className="font-medium text-purple-300">{t.name}</div>
              <div className="text-sm text-slate-400 mt-1">{t.ownership}% owned • {t.priority}</div>
              {t.faab && <div className="text-sm text-yellow-300 mt-1">FAAB: {t.faab}</div>}
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

// ---------- Main App ----------
const FantasyWaiverApp = () => {
  const [leagueType, setLeagueType] = useState('Yahoo');
  const [leagueId, setLeagueId] = useState(APP_CONFIG.defaultLeagues.Yahoo.id);
  const [analysisData, setAnalysisData] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedTab, setSelectedTab] = useState('targets');
  const [authed, setAuthed] = useState(false);
  const [leagues, setLeagues] = useState(null);

  // On first load, detect Yahoo redirect (?code=...) and finish login
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (code) {
      // exchange code for tokens
      finishYahooLogin(code, state);
      // cleanup query params
      const url = new URL(window.location.href);
      url.searchParams.delete('code');
      url.searchParams.delete('state');
      window.history.replaceState({}, '', url.toString());
    } else {
      // optional: ping an endpoint to see if we already have a session
      checkSession();
    }
  }, []);

  const checkSession = async () => {
    try {
      const res = await fetch('/api/yahoo/leagues', { credentials: 'include' });
      if (res.ok) {
        setAuthed(true);
        const data = await res.json().catch(() => null);
        if (data?.leagues) setLeagues(data.leagues);
      }
    } catch (_) {}
  };

  const startYahooLogin = async () => {
    // Send user to backend which builds the proper Yahoo URL and redirects
    window.location.href = '/api/auth/yahoo/login';
  };

  const finishYahooLogin = async (code, state) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/auth/yahoo/callback?code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`, {
        method: 'GET',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Yahoo login failed');
      setAuthed(true);
      setSuccess('Yahoo connected. You can now analyze your live league.');
      // Optionally fetch leagues right away
      const leaguesRes = await fetch('/api/yahoo/leagues', { credentials: 'include' });
      if (leaguesRes.ok) {
        const data = await leaguesRes.json().catch(() => null);
        if (data?.leagues) setLeagues(data.leagues);
      }
    } catch (e) {
      setError(e.message || 'Yahoo login failed');
    } finally {
      setLoading(false);
    }
  };

  const runAIAnalysis = async (leagueData) => {
    setAiLoading(true);
    try {
      const analysis = await FantasyAnalysisAI.analyzeLeague(leagueData);
      setAiAnalysis(analysis);
    } finally {
      setAiLoading(false);
    }
  };

  const runAnalysis = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      let waiverTargets = ENHANCED_PLAYER_DATA.waiverTargets;
      let injuries = ENHANCED_PLAYER_DATA.injuryUpdates;
      let sleepers = ENHANCED_PLAYER_DATA.sleepers;
      let strategy = ENHANCED_PLAYER_DATA.strategyTips;

      if (leagueType === 'Yahoo' && authed) {
        const leagueKey = `${APP_CONFIG.defaultLeagues.Yahoo.keyPrefix}${leagueId}`; // e.g., nfl.l.747884
        const res = await fetch(`/api/yahoo/league/${encodeURIComponent(leagueKey)}/waiver`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          // Expecting shape: { players: [{ name, position, team, ownershipPct, ... }], injuries: [...], ... }
          if (data?.players?.length) {
            // map into the UI shape if needed
            waiverTargets = data.players.map((p, idx) => ({
              id: idx + 1,
              name: p.name,
              position: p.position,
              team: p.team || p.editorial_team_abbr || '—',
              ownershipPct: p.percent_owned ? Number(p.percent_owned) : (p.ownershipPct || 0),
              priorityScore: p.priorityScore || 75,
              urgency: p.urgency || 'MEDIUM',
              reason: p.reason || 'Waiver-eligible free agent',
              weeklyProjection: p.weeklyProjection || { min: 5, max: 15, avg: 9.5 },
              metrics: p.metrics || {},
              recentNews: p.recentNews || '',
              rosterAdvice: p.rosterAdvice || '',
              trend: p.trend || 'STEADY',
              faabBid: p.faabBid || ''
            }));
          }
          if (data?.injuries) injuries = data.injuries;
        }
      }

      const mockLeagueData = {
        leagueInfo: {
          name: `${leagueType} League ${leagueId}`,
          platform: leagueType,
          week: APP_CONFIG.currentWeek,
          url: leagueType === 'Yahoo' ? APP_CONFIG.defaultLeagues.Yahoo.url(leagueId) : null,
          lastUpdated: new Date().toISOString()
        },
        waiverTargets,
        injuries,
        sleepers,
        strategy
      };

      setAnalysisData(mockLeagueData);
      setSuccess(`Analyzed ${leagueType} league ${leagueId} • Found ${mockLeagueData.waiverTargets.length} targets`);

      runAIAnalysis(mockLeagueData);
    } catch (err) {
      setError(err?.message || 'Failed to analyze league. Check your Yahoo connection and League ID.');
    } finally {
      setLoading(false);
    }
  };

  const contextValue = {
    leagueType, leagueId, analysisData, aiAnalysis, loading, aiLoading, error, success, authed, leagues
  };

  return (
    <FantasyContext.Provider value={contextValue}>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
        {/* Header */}
        <div className="bg-black/30 backdrop-blur-sm border-b border-white/10 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl">
                  <Target className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Fantasy Waiver Wire Magic ✨
                  </h1>
                  <p className="text-slate-400">
                    Week {APP_CONFIG.currentWeek} • AI-Powered Analysis • Your League: {leagueId}
                  </p>
                </div>
              </div>

              {/* Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                {/* Yahoo Connect / Status */}
                {leagueType === 'Yahoo' && (
                  authed ? (
                    <div className="px-3 py-2 bg-green-900/30 border border-green-600/50 rounded-lg text-sm">
                      Connected to Yahoo ✅
                    </div>
                  ) : (
                    <button
                      onClick={startYahooLogin}
                      className="bg-slate-800 border border-slate-600 hover:bg-slate-700 rounded-lg px-3 py-2 text-sm"
                    >
                      Connect Yahoo
                    </button>
                  )
                )}

                {/* League Type */}
                <select
                  value={leagueType}
                  onChange={(e) => setLeagueType(e.target.value)}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="Yahoo">Yahoo Fantasy</option>
                  <option value="ESPN">ESPN</option>
                  <option value="Sleeper">Sleeper</option>
                </select>

                {/* League ID */}
                <div className="flex-1 sm:w-80">
                  <input
                    type="text"
                    placeholder={
                      leagueType === 'Yahoo' ? '747884' :
                      leagueType === 'Sleeper' ? '123456789012345678' : '1237285'
                    }
                    value={leagueId}
                    onChange={(e) => setLeagueId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Analyze */}
                <button
                  onClick={runAnalysis}
                  disabled={loading || (leagueType === 'Yahoo' && !authed)}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-medium transition-all duration-200 whitespace-nowrap flex items-center space-x-2"
                >
                  {loading ? (<><Loader2 className="w-4 h-4 animate-spin" /><span>Analyzing...</span></>) : (<><Sparkles className="w-4 h-4" /><span>Analyze League</span></>)}
                </button>
              </div>
            </div>

            {/* Alerts */}
            {error && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <span className="text-red-300 text-sm">{error}</span>
              </div>
            )}
            {success && (
              <div className="mt-4 p-3 bg-green-900/30 border border-green-500/50 rounded-lg flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <span className="text-green-300 text-sm">{success}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tabs (after analysis) */}
        {analysisData && (
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex space-x-1 bg-slate-800/50 rounded-lg p-1">
              {[
                { id: 'targets', label: 'Top Targets', icon: Target, count: analysisData.waiverTargets.length },
                { id: 'injuries', label: 'Injury Impact', icon: AlertTriangle, count: analysisData.injuries.length },
                { id: 'sleepers', label: 'Sleeper Picks', icon: Zap, count: analysisData.sleepers.length },
                { id: 'strategy', label: 'Strategy Guide', icon: Crown }
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedTab(tab.id)}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-md font-medium transition-all duration-200 ${
                      selectedTab === tab.id
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                    {tab.count && <span className="bg-black/30 px-1.5 py-0.5 rounded text-xs">{tab.count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main */}
        <div className="max-w-7xl mx-auto px-4 pb-8">
          {loading && !analysisData && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin text-purple-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Analyzing Your League</h3>
                <p className="text-slate-400">Fetching waiver data and running AI analysis...</p>
              </div>
            </div>
          )}

          {!analysisData && !loading && (
            <div className="text-center py-16">
              <div className="max-w-2xl mx-auto">
                <div className="p-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                  <Target className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-4">Ready to Dominate Your Waiver Wire?</h2>
                <p className="text-slate-400 mb-8 leading-relaxed">
                  Connect Yahoo and get AI-powered targets, injury impacts, and strategy tailored to your league.
                </p>
                {!authed && (
                  <button onClick={startYahooLogin} className="px-5 py-2 rounded-lg bg-slate-800 border border-slate-600 hover:bg-slate-700">
                    Connect Yahoo
                  </button>
                )}
              </div>
            </div>
          )}

          {analysisData && (
            <div className="space-y-6">
              <AIAnalysisCard analysisData={aiAnalysis} onRefresh={() => runAIAnalysis(analysisData)} loading={aiLoading} />

              {selectedTab === 'targets' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">Priority Waiver Targets</h2>
                    <div className="flex items-center space-x-2 text-sm text-slate-400">
                      <Calendar className="w-4 h-4" />
                      <span>Week {APP_CONFIG.currentWeek} • Updated {new Date().toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="grid gap-6">
                    {analysisData.waiverTargets.map((p, i) => (
                      <EnhancedWaiverCard key={`${p.name}-${i}`} player={p} index={i} showFAAB />
                    ))}
                  </div>
                </div>
              )}

              {selectedTab === 'injuries' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold">Injury Impact Analysis</h2>
                  <div className="grid gap-6">
                    {analysisData.injuries.map((inj) => <InjuryImpactCard key={`${inj.player}-${inj.lastUpdate}`} injury={inj} />)}
                  </div>
                </div>
              )}

              {selectedTab === 'sleepers' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold">Deep Sleeper Picks</h2>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {analysisData.sleepers.map((s, i) => (
                      <div key={`${s.name}-${i}`} className="bg-slate-900/50 rounded-lg p-4 border border-slate-600">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-bold text-lg">{s.name}</h3>
                          <span className="text-xs bg-slate-700 px-2 py-1 rounded">{s.position} - {s.team}</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div><span className="text-slate-500">Owned:</span> <span className="text-white ml-1">{s.ownershipPct}%</span></div>
                          <div><span className="text-slate-500">Upside:</span><p className="text-slate-300 mt-1">{s.upside}</p></div>
                          <div><span className="text-slate-500">Risk:</span><p className="text-slate-300 mt-1">{s.risk}</p></div>
                          {s.faab && (<div className="pt-2 border-t border-slate-700"><span className="text-yellow-400 font-medium">FAAB: {s.faab}</span></div>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedTab === 'strategy' && (
                <div className="space-y-4">
                  {/* Simple Strategy section to keep length reasonable */}
                  <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                    <h3 className="font-bold text-lg mb-4 flex items-center space-x-2">
                      <Trophy className="w-5 h-5 text-yellow-400" />
                      <span>Strategy Guide</span>
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      {analysisData.strategy.map((tip, idx) => (
                        <div key={idx} className="bg-slate-800/40 rounded-lg p-4">
                          <div className="flex items-start space-x-2">
                            <div className={`w-2 h-2 rounded-full mt-2 ${tip.priority === 'HIGH' ? 'bg-red-400' : tip.priority === 'MEDIUM' ? 'bg-yellow-400' : 'bg-green-400'}`} />
                            <div>
                              <div className="font-semibold">{tip.title}</div>
                              <div className="text-sm text-slate-300 mt-1">{tip.tip}</div>
                              <div className="text-xs text-slate-500 mt-1">{tip.reasoning}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </FantasyContext.Provider>
  );
};

export default FantasyWaiverApp;