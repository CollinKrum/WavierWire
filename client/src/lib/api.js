const API_BASE = import.meta.env.VITE_API_BASE || '';

export const API = async (path, init = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
};

// ESPN API calls (your existing functionality)
export const espnAPI = {
  // Test ESPN connection
  test: () => API('/api/espn/test'),
  
  // Get league info
  getLeague: (season, leagueId, view) => 
    API(`/api/espn/league?season=${season}&leagueId=${leagueId}${view ? `&view=${view}` : ''}`),
  
  // Get free agents
  getFreeAgents: (season, filter) =>
    API('/api/espn/players', {
      method: 'POST',
      body: JSON.stringify({ season, filter })
    }),
  
  // Get player projections
  getProjections: (season, playerIds, pprId = 0) =>
    API('/api/espn/playerInfo', {
      method: 'POST',
      body: JSON.stringify({ 
        season, 
        pprId,
        filter: {
          players: {
            filterIds: { value: playerIds },
            filterStatsForTopScoringPeriodIds: {
              value: 2,
              additionalValue: [`00${season}`, `10${season}`]
            }
          }
        }
      })
    }),
  
  // Get bye weeks
  getByeWeeks: (season) => API(`/api/espn/byeWeeks?season=${season}`),
  
  // Get player news
  getNews: (playerId, limit = 10) => 
    API(`/api/espn/news?playerId=${playerId}&limit=${limit}`)
};

// Database API calls (roster management)
export const dbAPI = {
  // Players
  getPlayers: (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return API(`/api/players${params ? `?${params}` : ''}`);
  },
  
  upsertPlayers: (players) =>
    API('/api/players/upsert', {
      method: 'POST',
      body: JSON.stringify({ players })
    }),
  
  // Roster management
  getRoster: () => API('/api/roster'),
  
  addToRoster: (playerId, positionSlot) =>
    API('/api/roster', {
      method: 'POST',
      body: JSON.stringify({ player_id: playerId, position_slot: positionSlot })
    }),
  
  removeFromRoster: (id) =>
    API(`/api/roster/${id}`, { method: 'DELETE' }),
  
  // Watchlist
  getWatchlist: () => API('/api/watchlist'),
  
  addToWatchlist: (playerId, interestLevel = 3, notes = '') =>
    API('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify({ 
        player_id: playerId, 
        interest_level: interestLevel, 
        notes 
      })
    }),
  
  removeFromWatchlist: (id) =>
    API(`/api/watchlist/${id}`, { method: 'DELETE' }),
  
  // News
  getPlayerNews: (playerId) => API(`/api/news${playerId ? `?player_id=${playerId}` : ''}`),
  
  addNews: (newsItems) =>
    API('/api/news/bulk', {
      method: 'POST',
      body: JSON.stringify({ items: newsItems })
    })
};

// Combined API for advanced features
export const fantasyAPI = {
  // Player Projections - Compare multiple players
  comparePlayerProjections: async (playerIds, season = 2025) => {
    const projections = await espnAPI.getProjections(season, playerIds);
    return projections?.players?.map(player => ({
      id: player.id,
      name: player.fullName,
      position: player.defaultPositionId,
      team: player.proTeamAbbreviation,
      projectedPoints: player.stats?.find(s => s.scoringPeriodId === 0)?.appliedTotal || 0,
      weeklyProjections: player.stats?.filter(s => s.scoringPeriodId > 0) || []
    })) || [];
  },
  
  // Waiver Priority - Compare roster vs free agents
  getWaiverRecommendations: async (season = 2025, position = 'RB', limit = 10) => {
    const [roster, freeAgents] = await Promise.all([
      dbAPI.getRoster(),
      espnAPI.getFreeAgents(season, {
        players: {
          filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
          filterSlotIds: { value: [position === 'RB' ? 2 : position === 'WR' ? 4 : position === 'TE' ? 6 : 0] },
          sortPercOwned: { sortPriority: 1, sortAsc: false },
          limit
        }
      })
    ]);
    
    const positionPlayers = roster.roster?.filter(p => p.position === position) || [];
    const availablePlayers = freeAgents.players || freeAgents || [];
    
    return {
      currentPlayers: positionPlayers,
      availableUpgrades: availablePlayers.slice(0, 5),
      recommendations: availablePlayers.map(fa => ({
        ...fa,
        recommendation: fa.ownership?.percentOwned > 50 ? 'HIGH_PRIORITY' : 'CONSIDER',
        reasoning: `${fa.ownership?.percentOwned || 0}% owned, available upgrade`
      }))
    };
  },
  
  // Injury Tracker - Get news for all roster players
  getInjuryUpdates: async () => {
    const roster = await dbAPI.getRoster();
    const newsPromises = roster.roster?.map(player => 
      espnAPI.getNews(player.espn_id, 3).catch(() => ({ articles: [] }))
    ) || [];
    
    const allNews = await Promise.all(newsPromises);
    return roster.roster?.map((player, idx) => ({
      ...player,
      recentNews: allNews[idx]?.articles || [],
      injuryStatus: allNews[idx]?.articles?.some(article => 
        article.headline?.toLowerCase().includes('injury') ||
        article.headline?.toLowerCase().includes('hurt') ||
        article.headline?.toLowerCase().includes('questionable')
      ) ? 'QUESTIONABLE' : 'HEALTHY'
    })) || [];
  }
};
