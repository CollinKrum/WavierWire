import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import pkg from 'pg';
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

const SWID = process.env.SWID;
const ESPN_S2 = process.env.ESPN_S2;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SWID || !ESPN_S2) {
  console.warn("[WARN] Missing SWID or ESPN_S2 env vars. Set them in your host.");
}

if (!DATABASE_URL) {
  console.warn("[WARN] Missing DATABASE_URL env var. Set it in your host.");
}

// Database connection
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.on('connect', () => {
  console.log('Connected to the database');
});

pool.on('error', (err) => {
  console.error('Database connection error:', err);
});

async function espnFetch(url, init = {}) {
  const headers = {
    Cookie: `SWID=${SWID}; ESPN_S2=${ESPN_S2}`,
    "x-fantasy-filter": init.filter ? JSON.stringify(init.filter) : undefined,
    ...(init.headers || {})
  };
  Object.keys(headers).forEach((k) => headers[k] === undefined && delete headers[k]);

  const res = await fetch(url, { headers, method: "GET" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ESPN ${res.status}: ${text}`);
  }
  return res.json();
}

const POSITION_SLOT_MAP = {
  QB: 0,
  RB: 2,
  WR: 4,
  TE: 6,
  "D/ST": 16,
  DST: 16,
  DEF: 16,
  K: 17,
  PK: 17
};

const POSITION_ID_TO_NAME = {
  0: "QB",
  1: "TQB",
  2: "RB",
  3: "RB/WR",
  4: "WR",
  5: "WR/TE",
  6: "TE",
  7: "OP",
  16: "D/ST",
  17: "K"
};

const PRO_TEAM_ABBREVIATIONS = {
  1: { abbrev: 'ATL' },
  2: { abbrev: 'BUF' },
  3: { abbrev: 'CHI' },
  4: { abbrev: 'CIN' },
  5: { abbrev: 'CLE' },
  6: { abbrev: 'DAL' },
  7: { abbrev: 'DEN' },
  8: { abbrev: 'DET' },
  9: { abbrev: 'GB' },
  10: { abbrev: 'TEN' },
  11: { abbrev: 'IND' },
  12: { abbrev: 'KC' },
  13: { abbrev: 'LV' },
  14: { abbrev: 'LAR' },
  15: { abbrev: 'MIA' },
  16: { abbrev: 'MIN' },
  17: { abbrev: 'NE' },
  18: { abbrev: 'NO' },
  19: { abbrev: 'NYG' },
  20: { abbrev: 'NYJ' },
  21: { abbrev: 'PHI' },
  22: { abbrev: 'ARI' },
  23: { abbrev: 'PIT' },
  24: { abbrev: 'LAC' },
  25: { abbrev: 'SF' },
  26: { abbrev: 'SEA' },
  27: { abbrev: 'TB' },
  28: { abbrev: 'WAS' },
  29: { abbrev: 'CAR' },
  30: { abbrev: 'JAX' },
  33: { abbrev: 'BAL' },
  34: { abbrev: 'HOU' }
};

const ROSTER_DEPTH_TARGETS = {
  QB: 2,
  RB: 4,
  WR: 5,
  TE: 2,
  "D/ST": 1,
  K: 1
};

const MOCK_FREE_AGENTS = (() => {
  const buildStats = (seasonProjection, weeklyTotals = []) => {
    const stats = [{
      scoringPeriodId: 0,
      statSourceId: 1,
      statSplitTypeId: 1,
      appliedTotal: seasonProjection
    }];
    weeklyTotals.forEach((applied, index) => {
      stats.push({
        scoringPeriodId: index + 1,
        statSourceId: 1,
        statSplitTypeId: 1,
        appliedTotal: applied
      });
    });
    return stats;
  };

  const createPlayer = (id, firstName, lastName, positionId, proTeamId, ownership, seasonProjection, weeklyTotals) => ({
    id,
    player: {
      id,
      firstName,
      lastName,
      defaultPositionId: positionId,
      proTeamId
    },
    ownership: {
      percentOwned: ownership,
      percentStarted: Math.min(100, Math.max(0, ownership * 0.6))
    },
    stats: buildStats(seasonProjection, weeklyTotals)
  });

  return {
    QB: [
      createPlayer(9001, 'Jordan', 'Love', 0, 9, 62.4, 325.5, [21.4, 19.8, 18.6, 22.1]),
      createPlayer(9002, 'Brock', 'Purdy', 0, 25, 58.1, 318.4, [20.1, 21.7, 23.4, 19.6]),
      createPlayer(9003, 'Sam', 'Howell', 0, 28, 33.2, 285.7, [17.8, 16.9, 18.2, 17.0])
    ],
    RB: [
      createPlayer(9101, 'Tyler', 'Allgeier', 2, 1, 54.8, 184.2, [12.4, 11.8, 13.5, 12.9]),
      createPlayer(9102, 'Khalil', 'Herbert', 2, 3, 41.3, 172.7, [11.1, 10.5, 12.0, 11.8]),
      createPlayer(9103, 'Chuba', 'Hubbard', 2, 29, 28.6, 155.4, [10.2, 9.8, 10.6, 10.1])
    ],
    WR: [
      createPlayer(9201, 'Jakobi', 'Meyers', 4, 13, 48.5, 201.3, [13.1, 12.6, 14.3, 13.8]),
      createPlayer(9202, 'Curtis', 'Samuel', 4, 28, 36.9, 188.4, [12.2, 12.8, 11.4, 13.0]),
      createPlayer(9203, 'Rashod', 'Bateman', 4, 33, 24.7, 174.9, [11.0, 10.5, 11.6, 10.8])
    ],
    TE: [
      createPlayer(9301, 'Chigoziem', 'Okonkwo', 6, 10, 37.1, 156.2, [10.4, 9.8, 10.9, 10.1]),
      createPlayer(9302, 'Gerald', 'Everett', 6, 24, 32.8, 146.8, [9.8, 9.4, 10.1, 9.7]),
      createPlayer(9303, 'Luke', 'Musgrave', 6, 9, 22.4, 132.5, [8.6, 8.9, 9.2, 8.8])
    ],
    "D/ST": [
      createPlayer(9401, 'Commanders', 'D/ST', 16, 28, 46.2, 118.3, [7.2, 8.1, 7.8, 7.4]),
      createPlayer(9402, 'Packers', 'D/ST', 16, 9, 39.5, 112.6, [6.8, 7.4, 7.1, 6.9]),
      createPlayer(9403, 'Broncos', 'D/ST', 16, 7, 27.9, 103.5, [6.1, 6.7, 6.4, 6.2])
    ],
    K: [
      createPlayer(9501, 'Jake', 'Elliott', 17, 21, 55.6, 158.4, [9.8, 10.1, 9.5, 10.3]),
      createPlayer(9502, 'Jason', 'Myers', 17, 26, 48.2, 150.7, [9.2, 9.5, 9.0, 9.3]),
      createPlayer(9503, 'Dustin', 'Hopkins', 17, 24, 31.7, 139.9, [8.4, 8.8, 8.1, 8.6])
    ]
  };
})();

function normalizePositionName(position = 'RB') {
  const value = String(position || '').toUpperCase();
  if (value === 'DST' || value === 'DEF' || value === 'D/ST') {
    return 'D/ST';
  }
  if (value === 'PK') {
    return 'K';
  }
  return value || 'RB';
}

function getTeamAbbrev(teamId) {
  return PRO_TEAM_ABBREVIATIONS[teamId]?.abbrev || 'FA';
}

function getSeasonProjection(stats = []) {
  if (!Array.isArray(stats)) return 0;
  const projected = stats.find((stat) => stat.scoringPeriodId === 0 && stat.statSourceId === 1);
  if (projected && typeof projected.appliedTotal === 'number') {
    return projected.appliedTotal;
  }
  const fallback = stats.find((stat) => stat.scoringPeriodId === 0);
  return typeof fallback?.appliedTotal === 'number' ? fallback.appliedTotal : 0;
}

function getAverageProjection(stats = []) {
  if (!Array.isArray(stats)) return 0;
  const projected = stats.filter((stat) => stat.scoringPeriodId > 0 && stat.statSourceId === 1 && typeof stat.appliedTotal === 'number');
  const pool = projected.length ? projected : stats.filter((stat) => stat.scoringPeriodId > 0 && typeof stat.appliedTotal === 'number');
  if (!pool.length) return 0;
  const total = pool.reduce((sum, stat) => sum + Number(stat.appliedTotal || 0), 0);
  return total / pool.length;
}

function computePriority(percentOwned, avgProjection, rosterDepth, rosterTarget) {
  let score = 0;

  if (percentOwned >= 70) score += 2;
  else if (percentOwned >= 45) score += 1;

  if (avgProjection >= 14) score += 2;
  else if (avgProjection >= 10) score += 1;

  if (rosterDepth < rosterTarget) score += 1;

  if (score >= 4) return 'HIGH';
  if (score >= 2) return 'MEDIUM';
  return 'LOW';
}

function computeFaabBid(priority, percentOwned, avgProjection) {
  const baseline = Math.max(percentOwned / 3, avgProjection);
  if (priority === 'HIGH') {
    return `${Math.min(40, Math.max(12, Math.round(baseline)))}%`;
  }
  if (priority === 'MEDIUM') {
    return `${Math.min(25, Math.max(5, Math.round(baseline * 0.7)))}%`;
  }
  return `${Math.min(10, Math.max(0, Math.round(baseline * 0.3)))}%`;
}

function buildReasoning({ percentOwned, avgProjection, seasonProjection, rosterDepth, rosterTarget, percentChange }) {
  const parts = [];
  if (typeof percentOwned === 'number' && percentOwned > 0) {
    parts.push(`${percentOwned.toFixed(1)}% rostered`);
  }
  if (typeof percentChange === 'number' && percentChange !== 0) {
    parts.push(`${percentChange > 0 ? '+' : ''}${percentChange.toFixed(1)}% week-over-week`);
  }
  if (avgProjection) {
    parts.push(`${avgProjection.toFixed(1)} projected pts`);
  }
  if (seasonProjection) {
    parts.push(`${seasonProjection.toFixed(1)} season outlook`);
  }
  if (rosterDepth < rosterTarget) {
    parts.push('Adds needed depth');
  }
  return parts.join(' • ') || 'Available upgrade on the waiver wire';
}

function formatPlayerName(player) {
  if (!player) return 'Unknown Player';
  if (player.fullName) return player.fullName;
  const first = player.firstName || '';
  const last = player.lastName || '';
  const combined = `${first} ${last}`.trim();
  return combined || player.displayName || 'Unknown Player';
}

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    // Test database connection
    const dbResult = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      timestamp: dbResult.rows[0].now,
      espn_auth: !!(SWID && ESPN_S2)
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

// Database migration endpoint
app.post("/admin/migrate", async (req, res) => {
  try {
    const createPlayersTable = `
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        espn_id INTEGER UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        position VARCHAR(10),
        team VARCHAR(10),
        bye_week INTEGER,
        status VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const createWatchlistTable = `
      CREATE TABLE IF NOT EXISTS watchlist (
        id SERIAL PRIMARY KEY,
        player_id INTEGER REFERENCES players(id),
        notes TEXT,
        priority INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_players_espn_id ON players(espn_id);
      CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
      CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);
    `;

    await pool.query(createPlayersTable);
    await pool.query(createWatchlistTable);
    await pool.query(createIndexes);

    console.log('Database migration completed successfully');
    res.json({ ok: true, message: 'Migration completed' });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Get all players from database
app.get("/api/players", async (req, res) => {
  try {
    const { position, team, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM players WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (position) {
      query += ` AND position = $${paramIndex}`;
      params.push(position);
      paramIndex++;
    }

    if (team) {
      query += ` AND team = $${paramIndex}`;
      params.push(team);
      paramIndex++;
    }

    query += ` ORDER BY name LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json({ players: result.rows });
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add or update a player
app.post("/api/players", async (req, res) => {
  try {
    const { espn_id, name, position, team, bye_week, status } = req.body;

    const query = `
      INSERT INTO players (espn_id, name, position, team, bye_week, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (espn_id) 
      DO UPDATE SET 
        name = EXCLUDED.name,
        position = EXCLUDED.position,
        team = EXCLUDED.team,
        bye_week = EXCLUDED.bye_week,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const result = await pool.query(query, [espn_id, name, position, team, bye_week, status]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding/updating player:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manage saved roster
app.get("/api/roster", async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM v_my_roster ORDER BY position_slot');
    res.json({ roster: rows });
  } catch (error) {
    console.error('Error fetching roster:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/roster", async (req, res) => {
  try {
    const { player_id, position_slot } = req.body || {};
    if (player_id == null || position_slot == null) {
      return res.status(400).json({ error: 'player_id, position_slot required' });
    }

    const { rows } = await pool.query(
      'INSERT INTO my_roster (player_id, position_slot) VALUES ($1, $2) RETURNING *',
      [player_id, position_slot]
    );

    res.json({ item: rows[0] });
  } catch (error) {
    console.error('Error saving roster item:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/roster/:id", async (req, res) => {
  try {
    await pool.query('DELETE FROM my_roster WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting roster item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manage watchlist
app.get("/api/watchlist", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT w.*, p.name, p.position, p.team FROM watchlist w JOIN players p ON p.id = w.player_id ORDER BY added_date DESC'
    );
    res.json({ watchlist: rows });
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/watchlist", async (req, res) => {
  try {
    const { player_id, interest_level = 3, notes } = req.body || {};
    if (player_id == null) {
      return res.status(400).json({ error: 'player_id required' });
    }

    const { rows } = await pool.query(
      'INSERT INTO watchlist (player_id, interest_level, notes) VALUES ($1, $2, $3) ON CONFLICT (player_id) DO UPDATE SET interest_level = EXCLUDED.interest_level, notes = EXCLUDED.notes RETURNING *',
      [player_id, interest_level, notes ?? null]
    );

    res.json({ item: rows[0] });
  } catch (error) {
    console.error('Error saving watchlist item:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/watchlist/:id", async (req, res) => {
  try {
    await pool.query('DELETE FROM watchlist WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting watchlist item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk player upsert (ingester)
app.post("/api/players/upsert", async (req, res) => {
  try {
    const { players } = req.body || {};
    if (!Array.isArray(players) || players.length === 0) {
      return res.status(400).json({ error: 'players[] required' });
    }

    const valuesSql = players
      .map((_player, index) => `($${index * 6 + 1}, $${index * 6 + 2}, $${index * 6 + 3}, $${index * 6 + 4}, $${index * 6 + 5}, $${index * 6 + 6})`)
      .join(',');

    const params = players.flatMap((player) => [
      player.espn_id,
      player.name,
      player.position,
      player.team,
      player.bye_week,
      player.status ?? 'active'
    ]);

    const sql = `
      INSERT INTO players (espn_id, name, position, team, bye_week, status)
      VALUES ${valuesSql}
      ON CONFLICT (espn_id) DO UPDATE SET
        name = EXCLUDED.name,
        position = EXCLUDED.position,
        team = EXCLUDED.team,
        bye_week = EXCLUDED.bye_week,
        status = EXCLUDED.status,
        updated_at = NOW();
    `;

    await pool.query(sql, params);
    res.json({ ok: true, upserted: players.length });
  } catch (error) {
    console.error('Error upserting players:', error);
    res.status(500).json({ error: error.message });
  }
});

// Player news endpoints
app.get("/api/news", async (req, res) => {
  try {
    const playerIdRaw = req.query.player_id;
    const playerId = Array.isArray(playerIdRaw) ? playerIdRaw[0] : playerIdRaw;

    const params = [];
    let sql = 'SELECT * FROM player_news';
    if (playerId) {
      params.push(playerId);
      sql += ` WHERE player_id = $${params.length}`;
    }
    sql += ' ORDER BY published_date DESC LIMIT 200';

    const { rows } = await pool.query(sql, params);
    res.json({ news: rows });
  } catch (error) {
    console.error('Error fetching news:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/news/bulk", async (req, res) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items[] required' });
    }

    const valuesSql = items
      .map((_item, index) => `($${index * 5 + 1}, $${index * 5 + 2}, $${index * 5 + 3}, $${index * 5 + 4}, $${index * 5 + 5})`)
      .join(',');

    const params = items.flatMap((item) => [
      item.player_id,
      item.headline,
      item.content ?? null,
      item.source ?? 'misc',
      item.published_date ?? new Date()
    ]);

    const sql = `
      INSERT INTO player_news (player_id, headline, content, source, published_date)
      VALUES ${valuesSql}
    `;

    await pool.query(sql, params);
    res.json({ ok: true, inserted: items.length });
  } catch (error) {
    console.error('Error inserting news items:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk upsert players
app.post("/api/players/bulk", async (req, res) => {
  try {
    const { players } = req.body;

    if (!Array.isArray(players) || players.length === 0) {
      return res.status(400).json({ error: 'Players array is required' });
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const player of players) {
        const { espn_id, name, position, team, bye_week, status } = player;
        
        const query = `
          INSERT INTO players (espn_id, name, position, team, bye_week, status)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (espn_id) 
          DO UPDATE SET 
            name = EXCLUDED.name,
            position = EXCLUDED.position,
            team = EXCLUDED.team,
            bye_week = EXCLUDED.bye_week,
            status = EXCLUDED.status,
            updated_at = CURRENT_TIMESTAMP;
        `;
        
        await client.query(query, [espn_id, name, position, team, bye_week, status]);
      }
      
      await client.query('COMMIT');
      res.json({ success: true, inserted: players.length });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error bulk inserting players:', error);
    res.status(500).json({ error: error.message });
  }
});

// ESPN API endpoints (your existing ones)
app.get("/api/espn/league", async (req, res) => {
  try {
    const { season, leagueId, view } = req.query;
    const v = view || "mTeam,mRoster,mSettings,mNav";
    const url = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=${encodeURIComponent(v)}`;
    const data = await espnFetch(url);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/espn/leagueHistory", async (req, res) => {
  try {
    const { season, leagueId, view } = req.query;
    const v = view || "mTeam,mRoster,mSettings";
    const url = `https://fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${leagueId}?seasonId=${season}&view=${encodeURIComponent(v)}`;
    const data = await espnFetch(url);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/espn/players", async (req, res) => {
  try {
    const { season, filter } = req.body;
    const base = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/players?view=players_wl`;
    const data = await espnFetch(base, { filter });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/espn/playerInfo", async (req, res) => {
  try {
    const { season, pprId = 0, filter } = req.body;
    const base = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/${pprId}?view=kona_player_info`;
    const data = await espnFetch(base, { filter });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/espn/waiver-analysis", async (req, res) => {
  const {
    season: requestedSeason,
    position: requestedPosition = 'RB',
    currentPlayerIds = [],
    limit: requestedLimit = 25
  } = req.body || {};

  const season = Number(requestedSeason) || new Date().getFullYear();
  const position = normalizePositionName(requestedPosition);
  const slotId = POSITION_SLOT_MAP[position] ?? 0;
  const limit = Math.max(1, Math.min(50, Number(requestedLimit) || 25));
  const rosterTarget = ROSTER_DEPTH_TARGETS[position] ?? 2;

  let rosterPlayers = [];
  try {
    const rosterQuery = `
      SELECT p.espn_id, p.name, p.position, p.team, r.position_slot
      FROM my_roster r
      JOIN players p ON p.id = r.player_id
      WHERE ($1 = 'ALL') OR p.position = $1 OR r.position_slot = $1
    `;
    const rosterResult = await pool.query(rosterQuery, [position]);
    rosterPlayers = rosterResult.rows || [];
  } catch (dbError) {
    if (dbError?.code === '42P01' || dbError?.code === 'ECONNREFUSED') {
      console.warn('[WARN] Roster lookup unavailable for waiver analysis:', dbError.message);
    } else if (dbError) {
      console.error('Error fetching roster for waiver analysis:', dbError);
      return res.status(500).json({ error: 'Failed to load roster data' });
    }
  }

  const rosterEspnIds = new Set([
    ...rosterPlayers.map((player) => Number(player.espn_id)).filter(Boolean),
    ...currentPlayerIds.map((id) => Number(id)).filter(Boolean)
  ]);

  let freeAgentsRaw = [];
  if (process.env.USE_MOCK_WAIVER_DATA === '1') {
    freeAgentsRaw = MOCK_FREE_AGENTS[position] || [];
  } else {
    try {
      const base = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/players?view=players_wl`;
      const filter = {
        players: {
          filterStatus: { value: ["FREEAGENT", "WAIVERS"] },
          filterSlotIds: { value: [slotId] },
          sortPercOwned: { sortPriority: 1, sortAsc: false },
          limit: Math.max(limit * 2, 25)
        }
      };
      const freeAgentResponse = await espnFetch(base, { filter });
      const raw = Array.isArray(freeAgentResponse?.players)
        ? freeAgentResponse.players
        : Array.isArray(freeAgentResponse)
          ? freeAgentResponse
          : [];
      freeAgentsRaw = raw;
    } catch (err) {
      console.error('Error fetching ESPN free agents for waiver analysis:', err);
      if (process.env.NODE_ENV === 'test') {
        freeAgentsRaw = MOCK_FREE_AGENTS[position] || [];
      } else {
        return res.status(500).json({ error: 'Failed to retrieve ESPN free agent data', details: err.message });
      }
    }
  }

  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const rosterDepth = rosterPlayers.length;

  const analysis = freeAgentsRaw
    .filter((entry) => entry && entry.player && entry.player.id)
    .filter((entry) => !rosterEspnIds.has(Number(entry.player.id)))
    .map((entry) => {
      const percentOwned = Number(entry.ownership?.percentOwned ?? entry.percentOwned ?? 0);
      const percentChange = typeof entry.ownership?.percentChange === 'number'
        ? entry.ownership.percentChange
        : (typeof entry.percentChange === 'number' ? entry.percentChange : undefined);
      const seasonProjection = getSeasonProjection(entry.stats);
      const avgProjection = getAverageProjection(entry.stats);
      const priority = computePriority(percentOwned, avgProjection, rosterDepth, rosterTarget);
      const faabBid = computeFaabBid(priority, percentOwned, avgProjection);
      const reasoning = buildReasoning({
        percentOwned,
        avgProjection,
        seasonProjection,
        rosterDepth,
        rosterTarget,
        percentChange
      });

      return {
        id: Number(entry.player.id),
        name: formatPlayerName(entry.player),
        position: POSITION_ID_TO_NAME[entry.player.defaultPositionId] || position,
        team: getTeamAbbrev(entry.player.proTeamId),
        ownershipPct: percentOwned,
        seasonProjection,
        avgProjection,
        priority,
        faabBid,
        reasoning
      };
    })
    .sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.avgProjection - a.avgProjection;
    })
    .slice(0, limit);

  const summary = {
    highPriority: analysis.filter((player) => player.priority === 'HIGH').length,
    mediumPriority: analysis.filter((player) => player.priority === 'MEDIUM').length,
    lowPriority: analysis.filter((player) => player.priority === 'LOW').length,
    totalAnalyzed: analysis.length,
    rosterDepth
  };

  res.json({ analysis, summary });
});

app.get("/api/espn/byeWeeks", async (req, res) => {
  try {
    const { season } = req.query;
    const url = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}?view=proTeamSchedules_wl`;
    const data = await espnFetch(url);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/espn/news", async (req, res) => {
  try {
    const { playerId, limit = 10 } = req.query;
    const url = `https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?playerId=${playerId}&limit=${limit}`;
    const data = await espnFetch(url);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Test ESPN connection
app.get("/api/espn/test", async (req, res) => {
  try {
    const url = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/2024?view=proTeamSchedules_wl`;
    const data = await espnFetch(url);
    res.json({ status: 'ok', dataSize: JSON.stringify(data).length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`Fantasy proxy running on ${PORT}`);
});
