import 'dotenv/config';
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

// Database connection with proper error handling
let pool = null;

if (DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 10
    });

    pool.on('connect', () => {
      console.log('Connected to the database');
    });

    pool.on('error', (err) => {
      console.error('Database connection error:', err);
    });

    // Test initial connection
    pool.query('SELECT NOW()').then(() => {
      console.log('Database connection successful');
    }).catch(err => {
      console.error('Initial database connection failed:', err);
    });

  } catch (error) {
    console.error('Failed to create database pool:', error);
    pool = null;
  }
} else {
  console.warn('[WARN] DATABASE_URL not provided. Database features will be disabled.');
}

// Helper function to safely execute queries
async function safeQuery(text, params = []) {
  if (!pool) {
    throw new Error('Database not available');
  }
  return await pool.query(text, params);
}

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
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

// Root endpoint
app.get("/", (req, res) => {
  res.json({ 
    message: "Fantasy Helper API", 
    status: "running",
    endpoints: [
      "GET /api/health",
      "GET /api/roster", 
      "GET /api/watchlist",
      "GET /api/players",
      "POST /api/espn/players",
      "GET /api/espn/test"
    ]
  });
});

// API root
app.get("/api", (req, res) => {
  res.json({ 
    message: "Fantasy Helper API v1.0",
    status: "ok" 
  });
});

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    let dbStatus = 'disconnected';
    let dbTime = null;
    
    if (pool) {
      const dbResult = await safeQuery('SELECT NOW()');
      dbStatus = 'connected';
      dbTime = dbResult.rows[0].now;
    }
    
    res.json({ 
      status: 'ok', 
      database: dbStatus,
      timestamp: dbTime,
      espn_auth: !!(SWID && ESPN_S2)
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      database: 'error',
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

    const createRosterTable = `
      CREATE TABLE IF NOT EXISTS my_roster (
        id SERIAL PRIMARY KEY,
        player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
        position_slot VARCHAR(20) NOT NULL,
        added_date TIMESTAMP DEFAULT NOW(),
        notes TEXT
      );
    `;

    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_players_espn_id ON players(espn_id);
      CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
      CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);
    `;

    await safeQuery(createPlayersTable);
    await safeQuery(createWatchlistTable);
    await safeQuery(createRosterTable);
    await safeQuery(createIndexes);

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
    
    if (!pool) {
      return res.json({ players: [], message: 'Database not available' });
    }
    
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

    const result = await safeQuery(query, params);
    res.json({ players: result.rows });
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add or update a player
app.post("/api/players", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: 'Database not available' });
    }

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

    const result = await safeQuery(query, [espn_id, name, position, team, bye_week, status]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding/updating player:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manage saved roster
app.get("/api/roster", async (_req, res) => {
  if (!pool) {
    return res.json({ roster: [], message: 'Database not available' });
  }

  try {
    const { rows } = await safeQuery(`
      SELECT
        r.id,
        r.position_slot,
        r.added_date,
        r.notes AS roster_notes,
        p.id AS player_id,
        p.espn_id,
        p.name,
        p.position,
        p.team,
        p.bye_week,
        p.status
      FROM my_roster r
      JOIN players p ON p.id = r.player_id
      ORDER BY
        CASE r.position_slot
          WHEN 'QB' THEN 1
          WHEN 'RB' THEN 2
          WHEN 'WR' THEN 3
          WHEN 'TE' THEN 4
          WHEN 'FLEX' THEN 5
          WHEN 'D/ST' THEN 6
          WHEN 'K' THEN 7
          WHEN 'BENCH' THEN 8
          ELSE 9
        END;
    `);
    return res.json({ roster: rows });
  } catch (error) {
    if (error?.code === '42P01') {
      console.warn('[WARN] Roster tables missing, returning empty roster');
      return res.json({ roster: [], message: 'Roster tables not created yet' });
    }

    console.error('Error fetching roster:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/roster", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { player_id, position_slot } = req.body || {};
    if (player_id == null || position_slot == null) {
      return res.status(400).json({ error: 'player_id, position_slot required' });
    }

    const { rows } = await safeQuery(
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
    if (!pool) {
      return res.status(500).json({ error: 'Database not available' });
    }

    await safeQuery('DELETE FROM my_roster WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting roster item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manage watchlist
app.get("/api/watchlist", async (req, res) => {
  if (!pool) {
    return res.json({ watchlist: [], message: 'Database not available' });
  }

  try {
    const { rows } = await safeQuery(
      'SELECT w.*, p.name, p.position, p.team FROM watchlist w JOIN players p ON p.id = w.player_id ORDER BY created_at DESC'
    );
    res.json({ watchlist: rows });
  } catch (error) {
    if (error?.code === '42P01') {
      console.warn('[WARN] Watchlist table missing');
      return res.json({ watchlist: [], message: 'Watchlist table not created yet' });
    }
    console.error('Error fetching watchlist:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/watchlist", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { player_id, interest_level = 3, notes } = req.body || {};
    if (player_id == null) {
      return res.status(400).json({ error: 'player_id required' });
    }

    const { rows } = await safeQuery(
      'INSERT INTO watchlist (player_id, priority, notes) VALUES ($1, $2, $3) RETURNING *',
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
    if (!pool) {
      return res.status(500).json({ error: 'Database not available' });
    }

    await safeQuery('DELETE FROM watchlist WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting watchlist item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk player upsert (ingester)
app.post("/api/players/bulk", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: 'Database not available' });
    }

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

// ESPN API endpoints
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

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    error: isDevelopment ? err.message : 'Internal server error',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Handle 404s
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
    availableEndpoints: [
      'GET /',
      'GET /api',
      'GET /api/health',
      'GET /api/espn/test', 
      'POST /api/espn/players',
      'GET /api/roster',
      'GET /api/watchlist',
      'GET /api/players',
      'POST /admin/migrate'
    ]
  });
});

// Add process error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`Fantasy proxy running on ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`ESPN test: http://localhost:${PORT}/api/espn/test`);
});
