import { useState, useEffect } from 'react';
import { espnAPI, dbAPI, fantasyAPI } from '../lib/api';

// Hook for player projections
export function useProjections(playerIds, season = 2025) {
  const [projections, setProjections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!playerIds || playerIds.length === 0) return;
    
    setLoading(true);
    setError(null);
    
    espnAPI.getProjections(season, playerIds)
      .then(data => setProjections(data.projections || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [playerIds.join(','), season]);

  return { projections, loading, error };
}

// Hook for waiver wire analysis
export function useWaiverAnalysis(position = 'RB', season = 2025) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runAnalysis = async (currentPlayerIds = []) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/espn/waiver-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          season, 
          position, 
          currentPlayerIds 
        })
      });
      
      if (!response.ok) throw new Error('Analysis failed');
      const data = await response.json();
      setAnalysis(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { analysis, loading, error, runAnalysis };
}

// Hook for injury tracking
export function useInjuryTracker() {
  const [injuryUpdates, setInjuryUpdates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const checkInjuries = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const updates = await fantasyAPI.getInjuryUpdates();
      setInjuryUpdates(updates);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { injuryUpdates, loading, error, checkInjuries };
}

// Hook for roster management
export function useRoster() {
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRoster = async () => {
    setLoading(true);
    try {
      const data = await dbAPI.getRoster();
      setRoster(data.roster || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addPlayer = async (playerId, positionSlot) => {
    try {
      await dbAPI.addToRoster(playerId, positionSlot);
      await fetchRoster(); // Refresh
    } catch (err) {
      setError(err.message);
    }
  };

  const removePlayer = async (id) => {
    try {
      await dbAPI.removeFromRoster(id);
      await fetchRoster(); // Refresh
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchRoster();
  }, []);

  return { roster, loading, error, addPlayer, removePlayer, refresh: fetchRoster };
}

// Hook for watchlist
export function useWatchlist() {
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchWatchlist = async () => {
    setLoading(true);
    try {
      const data = await dbAPI.getWatchlist();
      setWatchlist(data.watchlist || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addToWatchlist = async (playerId, interestLevel = 3, notes = '') => {
    try {
      await dbAPI.addToWatchlist(playerId, interestLevel, notes);
      await fetchWatchlist(); // Refresh
    } catch (err) {
      setError(err.message);
    }
  };

  const removeFromWatchlist = async (id) => {
    try {
      await dbAPI.removeFromWatchlist(id);
      await fetchWatchlist(); // Refresh
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchWatchlist();
  }, []);

  return { watchlist, loading, error, addToWatchlist, removeFromWatchlist, refresh: fetchWatchlist };
}

// Hook for player search
export function usePlayers(filters = {}) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    
    dbAPI.getPlayers(filters)
      .then(data => setPlayers(data.players || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [JSON.stringify(filters)]);

  return { players, loading, error };
}
