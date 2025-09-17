import { useState, useMemo } from "react";
import { useWaiverAnalysis, useRoster, useWatchlist, useProjections } from "./hooks/useFantasy";

const API = import.meta.env.VITE_API_BASE || "";

export default function EnhancedFantasyApp() {
  // Existing state
  const [season, setSeason] = useState(new Date().getFullYear());
  const [slot, setSlot] = useState(2);
  const [searchPosition, setSearchPosition] = useState("ALL");
  const [teamFilter, setTeamFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingCount, setLoadingCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState(null);
  const [players, setPlayers] = useState([]);

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

  const searchPositionLabel = useMemo(() => {
    return searchPosition === "ALL" ? "all players" : searchPosition;
  }, [searchPosition]);

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
  function fetchPlayers() {
    const params = new URLSearchParams();
    if (searchPosition && searchPosition !== "ALL") {
      params.set("position", searchPosition);
    }
    if (teamFilter.trim()) {
      params.set("team", teamFilter.trim());
    }
    if (searchQuery.trim()) {
      params.set("q", searchQuery.trim());
    }

    const url = `${API}/api/players${params.toString() ? `?${params.toString()}` : ""}`;
    setHasSearched(true);

    withRequest(
      () => fetchJson(url),
      (json) => setPlayers(json?.players || [])
    );
  }

  // New functions for advanced features
  function handleWaiverAnalysis() {
    runAnalysis([]);
  }

  function handleAddToRoster(player) {
    const playerId = player.id || player.player_id;
    if (!playerId) return;

    const slotName = (player.position || 'BENCH').toUpperCase();
    addPlayer(playerId, slotName);
  }

  function handleAddToWatchlist(player) {
    const playerId = player.id || player.player_id || player.espn_id;
    addToWatchlist(playerId, 3, `Added from ${searchPositionLabel}`);
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
                  <p className="text-xs text-gray-400 mt-1">Season is retained for future API-driven features.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Position</label>
                  <select
                    value={searchPosition}
                    onChange={(e) => setSearchPosition(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-md"
                  >
                    <option value="ALL">All Positions</option>
                    <option value="QB">QB</option>
                    <option value="RB">RB</option>
                    <option value="WR">WR</option>
                    <option value="TE">TE</option>
                    <option value="K">K</option>
                    <option value="D/ST">D/ST</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Team</label>
                  <input
                    type="text"
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                    placeholder="e.g. SF"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Search</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Player name"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-md"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 mb-6">
                <button
                  onClick={fetchPlayers}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-md font-medium"
                >
                  🔍 Search {searchPositionLabel}
                </button>
              </div>

              {loading && <div className="text-blue-400 mb-4">🔄 Loading...</div>}
            </div>

            {!!players?.length && (
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h3 className="text-xl font-semibold text-white mb-4">
                  📚 Player Database Results
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-600">
                        <th className="text-left py-2 text-gray-300">Player</th>
                        <th className="text-left py-2 text-gray-300">Position</th>
                        <th className="text-left py-2 text-gray-300">Team</th>
                        <th className="text-center py-2 text-gray-300">Bye</th>
                        <th className="text-center py-2 text-gray-300">Status</th>
                        <th className="text-left py-2 text-gray-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.slice(0, 50).map((p) => (
                        <tr key={p.id} className="border-b border-slate-700 hover:bg-slate-700">
                          <td className="py-3 text-white font-medium">{p.name}</td>
                          <td className="py-3 text-gray-300">{p.position || "-"}</td>
                          <td className="py-3 text-gray-300">{p.team || "-"}</td>
                          <td className="py-3 text-center text-gray-300">{p.bye_week ?? "-"}</td>
                          <td className="py-3 text-center text-gray-300 capitalize">{p.status || "active"}</td>
                          <td className="py-3">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleAddToRoster(p)}
                                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
                              >
                                ➕ Roster
                              </button>
                              <button
                                onClick={() => handleAddToWatchlist(p)}
                                className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded"
                              >
                                👀 Watch
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {hasSearched && !loading && !players.length && (
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 text-gray-300 text-center">
                No players matched your filters. Try adjusting the position, team, or search term.
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
