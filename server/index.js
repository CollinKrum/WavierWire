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
