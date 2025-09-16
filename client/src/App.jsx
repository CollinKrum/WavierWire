import { useState, useMemo } from "react";
import { useWaiverAnalysis, useRoster, useWatchlist, useProjections } from "./hooks/useFantasy";

const API = import.meta.env.VITE_API_BASE || "";

export default function EnhancedFantasyApp() {
  // Existing state
  const [season, setSeason] = useState(new Date().getFullYear());
  const [leagueId, setLeagueId] = useState("");
  const [slot, setSlot] = useState(2);
  const [loadingCount, setLoadingCount] = useState(0);
  const [error, setError] = useState(null);
  const [league, setLeague] = useState(null);
  const [freeAgents, setFreeAgents] = useState([]);
  const [byeWeeks, setByeWeeks] = useState(null);

  // New state for advanced features
  const [activeTab, setActiveTab] = useState('basic');
  const [selectedPlayers, setSelectedPlayers] = useState([]);

  // Custom hooks
  const { analysis: waiverAnalysis, loading: waiverLoading, runAnalysis } = useWaiverAnalysis();
  const { roster, loading: rosterLoading, addPlayer, removePlayer } = useRoster();
  const { watchlist, loading: watchlistLoading, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const { projections, loading: projectionsLoading } = useProjections(selectedPlayers, season);

  const positionLabel = useMemo(() => {
    const map = { 0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST", 17: "K" };
    return map[slot] || `Slot ${slot}`;
  }, [slot]);

  // Existing helper functions
  function startRequest() {
    setError(null);
    setLoadingCount((count) => count + 1);
  }

  function finishRequest() {
    setLoadingCount((count) => Math.max(0, count - 1));
  }

  async function withRequest(fetcher, onSuccess) {
    startRequest();
    try {
      const data = await fetcher();
      onSuccess?.(data);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unexpected error");
      onSuccess?.(null);
    } finally {
      finishRequest();
    }
  }

  function fetchJson(url, init) {
    return fetch(url, init).then((res) => {
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      return res.json();
    });
  }

  // Existing functions
  function fetchLeague() {
    withRequest(
      () => fetchJson(`${API}/api/espn/league?season=${season}&leagueId=${leagueId}`),
      (data) => setLeague(data)
    );
  }

  function fetchByeWeeks() {
    withRequest(
      () => fetchJson(`${API}/api/espn/byeWeeks?season=${season}`),
      (data) => setByeWeeks(data)
    );
  }

  function fetchFreeAgents() {
    const filter = {
      players: {
        filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
        filterSlotIds: { value: [Number(slot)] },
        sortPercOwned: { sortPriority: 1, sortAsc: false },
        limit: 100,
        offset: 0
      }
    };

    withRequest(
      () =>
        fetchJson(`${API}/api/espn/players`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ season, filter })
        }),
      (json) => setFreeAgents(json?.players || json || [])
    );
  }

  // New functions for advanced features
  function handleWaiverAnalysis() {
    const position = positionLabel;
    runAnalysis([]);
  }

  function handleAddToWatchlist(player) {
    const playerId = player.id || player.espn_id;
    addToWatchlist(playerId, 3, `Added from ${positionLabel} search`);
  }

  const loading = loadingCount > 0;

  const tabs = [
    { id: 'basic', name: '🏈 Basic Search', icon: '📊' },
    { id: 'waiver', name: '🎯 Waiver Analysis', icon: '⚡' },
    { id: 'roster', name: '👥 My Roster', icon: '📋' },
    { id: 'watchlist', name: '👀 Watchlist', icon: '⭐' },
    { id: 'projections', name: '📈 Projections', icon: '🔮' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-4xl font-bold text-white mb-8 text-center">
          🏆 ESPN Fantasy Helper Pro
        </h1>

        {/* Tab Navigation */}
        <div className="flex flex-wrap justify-center mb-8 bg-slate-800 rounded-lg p-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 mx-1 my-1 rounded-md font-medium transition-colors ${
                activeTab === tab.id 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {tab.icon} {tab.name}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded mb-6">
            ⚠️ {error}
          </div>
        )}

        {/* Basic Search Tab */}
        {activeTab === 'basic' && (
          <div className="space-y-6">
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 className="text-2xl font-semibold text-white mb-4">📊 Basic Player Search</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Season</label>
                  <input 
                    type="number" 
                    value={season} 
                    onChange={(e) => setSeason(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">League ID</label>
                  <input 
                    type="text" 
                    value={leagueId} 
                    onChange={(e) => setLeagueId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Position</label>
                  <select 
                    value={slot} 
                    onChange={(e) => setSlot(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-md"
                  >
                    <option value={0}>QB</option>
                    <option value={2}>RB</option>
                    <option value={4}>WR</option>
                    <option value={6}>TE</option>
                    <option value={17}>K</option>
                    <option value={16}>D/ST</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 mb-6">
                <button 
                  onClick={fetchLeague} 
                  disabled={!leagueId || loading}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-md font-medium"
                >
                  📋 Load League
                </button>
                <button 
                  onClick={fetchByeWeeks} 
                  disabled={loading}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-md font-medium"
                >
                  📅 Load Bye Weeks
                </button>
                <button 
                  onClick={fetchFreeAgents} 
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-md font-medium"
                >
                  🔍 Find {positionLabel} FAs
                </button>
              </div>

              {loading && <div className="text-blue-400 mb-4">🔄 Loading...</div>}
            </div>

            {/* Results sections (league, bye weeks, free agents) */}
            {league && (
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h3 className="text-xl font-semibold text-white mb-4">📋 League Info</h3>
                <div className="bg-slate-900 rounded p-4 font-mono text-sm text-gray-300">
                  <pre>{JSON.stringify({
                    name: league.settings?.name,
                    scoringPeriodId: league.scoringPeriodId,
                    teams: (league.teams || []).length
                  }, null, 2)}</pre>
                </div>
              </div>
            )}

            {!!freeAgents?.length && (
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h3 className="text-xl font-semibold text-white mb-4">
                  🎯 Top {positionLabel} Free Agents
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-600">
                        <th className="text-left py-2 text-gray-300">Player</th>
                        <th className="text-left py-2 text-gray-300">Team</th>
                        <th className="text-center py-2 text-gray-300">% Owned</th>
                        <th className="text-left py-2 text-gray-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {freeAgents.slice(0, 15).map((p, i) => (
                        <tr key={p.id || i} className="border-b border-slate-700 hover:bg-slate-700">
                          <td className="py-3 text-white font-medium">
                            {p?.fullName || p?.player?.fullName}
                          </td>
                          <td className="py-3 text-gray-300">
                            {p?.proTeamAbbreviation || p?.player?.proTeamAbbreviation}
                          </td>
                          <td className="py-3 text-center text-gray-300">
                            {(p?.ownership?.percentOwned ?? p?.percentOwned ?? 0).toFixed?.(1) ?? ""}%
                          </td>
                          <td className="py-3">
                            <button
                              onClick={() => handleAddToWatchlist(p)}
                              className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded"
                            >
                              👀 Watch
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Waiver Analysis Tab */}
        {activeTab === 'waiver' && (
          <div className="space-y-6">
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 className="text-2xl font-semibold text-white mb-4">🎯 Waiver Wire Analysis</h2>
              
              <div className="flex items-center gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Position</label>
                  <select 
                    value={positionLabel} 
                    onChange={(e) => {
                      const posMap = { QB: 0, RB: 2, WR: 4, TE: 6, K: 17, 'D/ST': 16 };
                      setSlot(posMap[e.target.value] || 2);
                    }}
                    className="px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-md"
                  >
                    <option value="QB">Quarterback</option>
                    <option value="RB">Running Back</option>
                    <option value="WR">Wide Receiver</option>
                    <option value="TE">Tight End</option>
                    <option value="K">Kicker</option>
                    <option value="D/ST">Defense/ST</option>
                  </select>
                </div>
                
                <button 
                  onClick={handleWaiverAnalysis}
                  disabled={waiverLoading}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md font-medium mt-6"
                >
                  {waiverLoading ? '🔄 Analyzing...' : '🔍 Run Analysis'}
                </button>
              </div>

              {waiverAnalysis && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-slate-700 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-red-400">{waiverAnalysis.summary?.highPriority || 0}</div>
                      <div className="text-gray-300">High Priority</div>
                    </div>
                    <div className="bg-slate-700 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-yellow-400">{waiverAnalysis.summary?.mediumPriority || 0}</div>
                      <div className="text-gray-300">Medium Priority</div>
                    </div>
                    <div className="bg-slate-700 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-blue-400">{waiverAnalysis.summary?.totalAnalyzed || 0}</div>
                      <div className="text-gray-300">Total Analyzed</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-600">
                          <th className="text-left py-2 text-gray-300">Player</th>
                          <th className="text-left py-2 text-gray-300">Team</th>
                          <th className="text-center py-2 text-gray-300">% Owned</th>
                          <th className="text-center py-2 text-gray-300">Projection</th>
                          <th className="text-center py-2 text-gray-300">Priority</th>
                          <th className="text-center py-2 text-gray-300">FAAB Bid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(waiverAnalysis.analysis || []).slice(0, 10).map((player, i) => (
                          <tr key={i} className="border-b border-slate-700 hover:bg-slate-700">
                            <td className="py-3 text-white font-medium">{player.name}</td>
                            <td className="py-3 text-gray-300">{player.team}</td>
                            <td className="py-3 text-center text-gray-300">{player.ownershipPct?.toFixed(1)}%</td>
                            <td className="py-3 text-center text-gray-300">{player.seasonProjection?.toFixed(1)}</td>
                            <td className="py-3 text-center">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                player.priority === 'HIGH' ? 'bg-red-200 text-red-800' :
                                player.priority === 'MEDIUM' ? 'bg-yellow-200 text-yellow-800' :
                                'bg-gray-200 text-gray-800'
                              }`}>
                                {player.priority}
                              </span>
                            </td>
                            <td className="py-3 text-center text-green-400 font-medium">{player.faabBid}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Roster Tab */}
        {activeTab === 'roster' && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-2xl font-semibold text-white mb-4">👥 My Roster</h2>
            {rosterLoading ? (
              <div className="text-blue-400">🔄 Loading roster...</div>
            ) : roster.length === 0 ? (
              <div className="text-gray-400 text-center py-8">
                📝 No players in your roster yet. Add some from the search or waiver analysis!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-600">
                      <th className="text-left py-2 text-gray-300">Player</th>
                      <th className="text-left py-2 text-gray-300">Position</th>
                      <th className="text-left py-2 text-gray-300">Team</th>
                      <th className="text-center py-2 text-gray-300">Bye Week</th>
                      <th className="text-left py-2 text-gray-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((player) => (
                      <tr key={player.id} className="border-b border-slate-700 hover:bg-slate-700">
                        <td className="py-3 text-white font-medium">{player.name}</td>
                        <td className="py-3 text-gray-300">{player.position}</td>
                        <td className="py-3 text-gray-300">{player.team}</td>
                        <td className="py-3 text-center text-gray-300">{player.bye_week}</td>
                        <td className="py-3">
                          <button
                            onClick={() => removePlayer(player.id)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded"
                          >
                            🗑️ Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Watchlist Tab */}
        {activeTab === 'watchlist' && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-2xl font-semibold text-white mb-4">👀 Watchlist</h2>
            {watchlistLoading ? (
              <div className="text-blue-400">🔄 Loading watchlist...</div>
            ) : watchlist.length === 0 ? (
              <div className="text-gray-400 text-center py-8">
                👁️ Your watchlist is empty. Add players from the search results!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-600">
                      <th className="text-left py-2 text-gray-300">Player</th>
                      <th className="text-left py-2 text-gray-300">Position</th>
                      <th className="text-left py-2 text-gray-300">Team</th>
                      <th className="text-center py-2 text-gray-300">Interest</th>
                      <th className="text-left py-2 text-gray-300">Notes</th>
                      <th className="text-left py-2 text-gray-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchlist.map((item) => (
                      <tr key={item.id} className="border-b border-slate-700 hover:bg-slate-700">
                        <td className="py-3 text-white font-medium">{item.name}</td>
                        <td className="py-3 text-gray-300">{item.position}</td>
                        <td className="py-3 text-gray-300">{item.team}</td>
                        <td className="py-3 text-center text-yellow-400">
                          {'⭐'.repeat(item.interest_level)}
                        </td>
                        <td className="py-3 text-gray-300 text-sm">{item.notes}</td>
                        <td className="py-3">
                          <button
                            onClick={() => removeFromWatchlist(item.id)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded"
                          >
                            🗑️ Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Projections Tab */}
        {activeTab === 'projections' && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-2xl font-semibold text-white mb-4">📈 Player Projections</h2>
            <div className="text-gray-400 text-center py-8">
              🔮 Projections feature coming soon! This will show weekly and season-long projections for players.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
