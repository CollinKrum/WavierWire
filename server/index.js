import 'dotenv/config';
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { spawn } from 'child_process';
import pkg from pg;
const { Pool } = pg;

const app = express();
app.use(cors());
app.use(express.json());

const SWID = process.env.SWID;
const ESPN_S2 = process.env.ESPN_S2;
const LEAGUE_ID = process.env.LEAGUE_ID;
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

// Helper function to run Python scripts
async function runPythonScript(script) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', ['-c', script]);
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(output);
          resolve(result);
        } catch (parseError) {
          reject(new Error(`Failed to parse Python output: ${output}`));
        }
      } else {
        reject(new Error(`Python script failed: ${errorOutput}`));
      }
    });
    
    // Set timeout
    setTimeout(() => {
      pythonProcess.kill();
      reject(new Error('Python script timeout'));
    }, 30000); // 30 second timeout
  });
}

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({ 
    message: "Fantasy Helper API", 
    status: "running",
    endpoints: [
      "GET /api/health",
      "GET /api/roster", 
      "GET /api/watchlist",
      "POST /api/players",
      "GET /api/espn/python/test",
      "GET /api/espn/python/league/:leagueId",
      "GET /api/espn/python/freeagents/:leagueId"
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
      espn_auth: !!(SWID && ESPN_S2),
      integration: 'python'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      database: 'error',
      error: error.message 
    });
  }
});

// Python ESPN endpoints
app.get("/api/espn/python/test", async (req, res) => {
  try {
    const pythonScript = `
import json
try:
    from espn_api.football import League
    result = {
        "message": "Python ESPN API is working!",
        "espn_api_available": True,
        "success": True
    }
    print(json.dumps(result))
except ImportError as e:
    result = {
        "message": "ESPN API not installed",
        "error": str(e),
        "success": False
    }
    print(json.dumps(result))
except Exception as e:
    result = {
        "message": "Error testing ESPN API",
        "error": str(e),
        "success": False
    }
    print(json.dumps(result))
    `;
    
    const result = await runPythonScript(pythonScript);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      error: error.message, 
      success: false,
      message: "Make sure Python and espn-api are installed on your server"
    });
  }
});

app.get("/api/espn/python/league/:leagueId", async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { season = 2024 } = req.query;
    
    const pythonScript = `
import json
from espn_api.football import League

try:
    league = League(
        league_id=${leagueId}, 
        year=${season}, 
        espn_s2="${ESPN_S2}", 
        swid="${SWID}"
    )
    
    teams_data = []
    for team in league.teams:
        owner = getattr(team, 'owner', 'Unknown')
        teams_data.append({
            "name": team.team_name,
            "owner": owner,
            "wins": team.wins,
            "losses": team.losses,
            "ties": getattr(team, 'ties', 0),
            "points_for": getattr(team, 'points_for', 0),
            "points_against": getattr(team, 'points_against', 0)
        })
    
    result = {
        "league_name": league.settings.name,
        "season": ${season},
        "team_count": league.settings.team_count,
        "teams": teams_data,
        "success": True
    }
    
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "error": str(e),
        "success": False
    }
    print(json.dumps(result))
    `;
    
    const result = await runPythonScript(pythonScript);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

app.get("/api/espn/python/freeagents/:leagueId", async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { season = 2024, size = 50, position } = req.query;
    
    const positionFilter = position ? `if p.position == "${position.toUpperCase()}"` : "True";
    
    const pythonScript = `
import json
from espn_api.football import League

try:
    league = League(
        league_id=${leagueId}, 
        year=${season}, 
        espn_s2="${ESPN_S2}", 
        swid="${SWID}"
    )
    
    free_agents = league.free_agents(size=${size})
    
    players_data = []
    for p in free_agents:
        if ${positionFilter}:
            players_data.append({
                "name": p.name,
                "position": p.position,
                "team": p.proTeam,
                "percent_owned": getattr(p, 'percent_owned', 0),
                "percent_started": getattr(p, 'percent_started', 0),
                "points": getattr(p, 'total_points', 0),
                "projected_points": getattr(p, 'projected_total_points', 0)
            })
    
    result = {
        "players": players_data,
        "league_name": league.settings.name,
        "season": ${season},
        "success": True
    }
    
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "error": str(e),
        "success": False
    }
    print(json.dumps(result))
    `;
    
    const result = await runPythonScript(pythonScript);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

app.get("/api/espn/python/players/:leagueId", async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { season = 2024, position, week } = req.query;
    
    const positionFilter = position ? `if p.position == "${position.toUpperCase()}"` : "True";
    const weekParam = week ? `, week=${week}` : "";
    
    const pythonScript = `
import json
from espn_api.football import League

try:
    league = League(
        league_id=${leagueId}, 
        year=${season}, 
        espn_s2="${ESPN_S2}", 
        swid="${SWID}"
    )
    
    # Get both free agents and rostered players
    all_players = []
    
    # Add free agents
    free_agents = league.free_agents(size=100)
    for p in free_agents:
        if ${positionFilter}:
            all_players.append({
                "name": p.name,
                "position": p.position,
                "team": p.proTeam,
                "status": "free_agent",
                "percent_owned": getattr(p, 'percent_owned', 0),
                "points": getattr(p, 'total_points', 0)
            })
    
    # Add rostered players
    for team in league.teams:
        for p in team.roster:
            if ${positionFilter}:
                all_players.append({
                    "name": p.name,
                    "position": p.position,
                    "team": p.proTeam,
                    "status": "rostered",
                    "owner": team.team_name,
                    "points": getattr(p, 'total_points', 0)
                })
    
    result = {
        "players": all_players,
        "league_name": league.settings.name,
        "season": ${season},
        "success": True
    }
    
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "error": str(e),
        "success": False
    }
    print(json.dumps(result))
    `;
    
    const result = await runPythonScript(pythonScript);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

// Enhanced database migration endpoint (keep your working migration)
app.post("/admin/migrate", async (req, res) => {
  try {
    const checkColumnsQuery = `
      SELECT column_name, table_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name IN ('players', 'my_roster', 'watchlist', 'league_cache', 'player_analytics')
      ORDER BY table_name, column_name;
    `;
    
    const existingColumns = await safeQuery(checkColumnsQuery);
    console.log('Existing columns before migration:', existingColumns.rows);

    const createPlayersTable = `
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        espn_id INTEGER UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        position VARCHAR(10),
        team VARCHAR(10),
        bye_week INTEGER,
        status VARCHAR(50) DEFAULT 'active',
        jersey_number INTEGER,
        avg_draft_position DECIMAL,
        avg_auction_value DECIMAL,
        percent_owned DECIMAL,
        percent_started DECIMAL,
        percent_change DECIMAL,
        is_injured BOOLEAN DEFAULT FALSE,
        injury_status VARCHAR(50),
        availability_status VARCHAR(50),
        fantasy_value INTEGER DEFAULT 0,
        waiver_priority VARCHAR(20) DEFAULT 'LOW',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

    const createWatchlistTable = `
      CREATE TABLE IF NOT EXISTS watchlist (
        id SERIAL PRIMARY KEY,
        player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
        notes TEXT,
        priority INTEGER DEFAULT 1,
        added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const createLeagueCacheTable = `
      CREATE TABLE IF NOT EXISTS league_cache (
        id SERIAL PRIMARY KEY,
        league_id VARCHAR(20) NOT NULL,
        season INTEGER NOT NULL,
        data JSONB NOT NULL,
        cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        UNIQUE(league_id, season)
      );
    `;

    const createAnalyticsTable = `
      CREATE TABLE IF NOT EXISTS player_analytics (
        id SERIAL PRIMARY KEY,
        player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
        week INTEGER NOT NULL,
        season INTEGER NOT NULL,
        points_scored DECIMAL,
        projected_points DECIMAL,
        ownership_change DECIMAL,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(player_id, week, season)
      );
    `;

    // Execute table creation
    await safeQuery(createPlayersTable);
    await safeQuery(createRosterTable);
    await safeQuery(createWatchlistTable);
    await safeQuery(createLeagueCacheTable);
    await safeQuery(createAnalyticsTable);

    // Add missing columns
    console.log('Adding missing columns...');
    
    const addColumnStatements = [
      "ALTER TABLE players ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE players ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE my_roster ADD COLUMN IF NOT EXISTS added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE my_roster ADD COLUMN IF NOT EXISTS notes TEXT",
      "ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    ];

    for (const statement of addColumnStatements) {
      try {
        await safeQuery(statement);
        console.log(`✅ Executed: ${statement}`);
      } catch (error) {
        console.log(`⚠️ Skipped: ${statement} - ${error.message}`);
      }
    }

    const createIndexes = [
      "CREATE INDEX IF NOT EXISTS idx_players_espn_id ON players(espn_id)",
      "CREATE INDEX IF NOT EXISTS idx_players_position ON players(position)",
      "CREATE INDEX IF NOT EXISTS idx_my_roster_player_id ON my_roster(player_id)",
      "CREATE INDEX IF NOT EXISTS idx_watchlist_player_id ON watchlist(player_id)",
      "CREATE INDEX IF NOT EXISTS idx_league_cache_lookup ON league_cache(league_id, season)"
    ];

    for (const indexQuery of createIndexes) {
      try {
        await safeQuery(indexQuery);
        console.log(`✅ Created index: ${indexQuery}`);
      } catch (error) {
        console.log(`⚠️ Index exists: ${error.message}`);
      }
    }

    const finalColumns = await safeQuery(checkColumnsQuery);
    console.log('Final columns after migration:', finalColumns.rows);

    res.json({
      ok: true,
      message: "Migration completed",
      existingColumns: existingColumns.rows,
      finalColumns: finalColumns.rows
    });

  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({
      ok: false,
      error: error.message,
      message: "Migration failed"
    });
  }
});

// Watchlist endpoints (keep your working ones)
app.get("/api/watchlist", async (req, res) => {
  if (!pool) {
    return res.json({ watchlist: [], message: 'Database not available' });
  }

  try {
    let { rows } = await safeQuery(
      'SELECT w.*, p.name, p.position, p.team FROM watchlist w JOIN players p ON p.id = w.player_id ORDER BY w.created_at DESC'
    );
    res.json({ watchlist: rows });
  } catch (error) {
    if (error?.code === '42703') {
      console.warn('[WARN] created_at column missing, using fallback query');
      try {
        const { rows } = await safeQuery(
          'SELECT w.*, p.name, p.position, p.team FROM watchlist w JOIN players p ON p.id = w.player_id ORDER BY w.id DESC'
        );
        res.json({ watchlist: rows });
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
        res.json({ watchlist: [], message: 'Watchlist table structure mismatch' });
      }
    } else if (error?.code === '42P01') {
      console.warn('[WARN] Watchlist table missing');
      return res.json({ watchlist: [], message: 'Watchlist table not created yet' });
    } else {
      console.error('Error fetching watchlist:', error);
      res.status(500).json({ error: error.message });
    }
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

// Roster endpoints (keep your working ones)
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
    if (error?.code === '42703') {
      console.warn('[WARN] added_date column missing, using fallback query');
      try {
        const { rows } = await safeQuery(`
          SELECT
            r.id,
            r.position_slot,
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
              WHEN 'QB' THEN 1 WHEN 'RB' THEN 2 WHEN 'WR' THEN 3 WHEN 'TE' THEN 4
              WHEN 'FLEX' THEN 5 WHEN 'D/ST' THEN 6 WHEN 'K' THEN 7 WHEN 'BENCH' THEN 8
              ELSE 9
            END;
        `);
        return res.json({ roster: rows });
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
        return res.json({ roster: [], message: 'Roster table structure mismatch' });
      }
    } else if (error?.code === '42P01') {
      console.warn('[WARN] Roster tables missing, returning empty roster');
      return res.json({ roster: [], message: 'Roster tables not created yet' });
    } else {
      console.error('Error fetching roster:', error);
      return res.status(500).json({ error: error.message });
    }
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

// Player management endpoints
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
      'GET /api/espn/python/test',
      'GET /api/espn/python/league/:leagueId',
      'GET /api/espn/python/freeagents/:leagueId',
      'GET /api/roster',
      'GET /api/watchlist',
      'POST /api/players',
      'POST /admin/migrate'
    ]
  });
});

// Process error handlers
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
  console.log(`Python ESPN test: http://localhost:${PORT}/api/espn/python/test`);
});
