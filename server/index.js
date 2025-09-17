import 'dotenv/config';
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import pkg from 'pg';
import { spawn } from 'child_process';
const { Pool } = pkg;

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

// Helper function to run R scripts
async function runRScript(script) {
  return new Promise((resolve, reject) => {
    const rProcess = spawn('Rscript', ['-e', script]);
    
    let output = '';
    let errorOutput = '';
    
    rProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    rProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    rProcess.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(output);
          resolve(result);
        } catch (parseError) {
          reject(new Error(`Failed to parse R output: ${output}`));
        }
      } else {
        reject(new Error(`R script failed: ${errorOutput}`));
      }
    });
    
    // Set timeout
    setTimeout(() => {
      rProcess.kill();
      reject(new Error('R script timeout'));
    }, 30000); // 30 second timeout
  });
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
      "GET /api/espn/test",
      "GET /api/ffscrapr/test",
      "GET /api/ffscrapr/league/:leagueId",
      "GET /api/ffscrapr/freeagents/:leagueId"
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

// FFscrapr endpoints
app.get("/api/ffscrapr/test", async (req, res) => {
  try {
    const rScript = `
      # Test if ffscrapr is installed and working
      if (!require("ffscrapr", quietly = TRUE)) {
        install.packages("ffscrapr", repos = "http://cran.r-project.org")
        library(ffscrapr)
      }
      
      library(jsonlite)
      
      # Simple test
      result <- list(
        message = "ffscrapr is working!",
        version = as.character(packageVersion("ffscrapr")),
        success = TRUE
      )
      
      cat(toJSON(result, auto_unbox = TRUE))
    `;
    
    const result = await runRScript(rScript);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      error: error.message, 
      success: false,
      message: "Make sure R and ffscrapr are installed on your server"
    });
  }
});

app.get("/api/ffscrapr/league/:leagueId", async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { season = 2024 } = req.query;
    
    const rScript = `
      library(ffscrapr)
      library(jsonlite)
      
      tryCatch({
        # Connect to ESPN league
        conn <- espn_connect(season = ${season}, league_id = ${leagueId})
        
        # Get league info and rosters
        league_data <- ff_league(conn)
        rosters <- ff_rosters(conn)
        
        # Combine data
        result <- list(
          league = league_data,
          rosters = rosters,
          success = TRUE
        )
        
        cat(toJSON(result, auto_unbox = TRUE))
      }, error = function(e) {
        cat(toJSON(list(error = e$message, success = FALSE), auto_unbox = TRUE))
      })
    `;
    
    const result = await runRScript(rScript);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

app.get("/api/ffscrapr/freeagents/:leagueId", async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { season = 2024 } = req.query;
    
    const rScript = `
      library(ffscrapr)
      library(jsonlite)
      
      tryCatch({
        # Connect to ESPN league
        conn <- espn_connect(season = ${season}, league_id = ${leagueId})
        
        # Get free agents
        free_agents <- ff_freeagents(conn)
        
        result <- list(
          players = free_agents,
          success = TRUE
        )
        
        cat(toJSON(result, auto_unbox = TRUE))
      }, error = function(e) {
        cat(toJSON(list(error = e$message, success = FALSE), auto_unbox = TRUE))
      })
    `;
    
    const result = await runRScript(rScript);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

app.get("/api/ffscrapr/players/:leagueId", async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { season = 2024, position } = req.query;
    
    const positionFilter = position ? `filter(pos == "${position}")` : "";
    
    const rScript = `
      library(ffscrapr)
      library(jsonlite)
      library(dplyr)
      
      tryCatch({
        # Connect to ESPN league
        conn <- espn_connect(season = ${season}, league_id = ${leagueId})
        
        # Get all players
        all_players <- ff_playerscores(conn)
        
        # Apply position filter if specified
        ${positionFilter ? `all_players <- all_players %>% ${positionFilter}` : ""}
        
        result <- list(
          players = all_players,
          success = TRUE
        )
        
        cat(toJSON(result, auto_unbox = TRUE))
      }, error = function(e) {
        cat(toJSON(list(error = e$message, success = FALSE), auto_unbox = TRUE))
      })
    `;
    
    const result = await runRScript(rScript);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message, success: false });
  }
});

// Enhanced database migration endpoint
app.post("/admin/migrate", async (req, res) => {
  try {
    // Check existing columns
    const checkColumnsQuery = `
      SELECT column_name, table_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name IN ('players', 'my_roster', 'watchlist', 'league_cache', 'player_analytics')
      ORDER BY table_name, column_name;
    `;
    
    const existingColumns = await safeQuery(checkColumnsQuery);
    console.log('Existing columns before migration:', existingColumns.rows);

    // Enhanced players table
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

    // League cache for storing ESPN league data
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

    // Player analytics for tracking performance
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

    // *** ADD MISSING COLUMNS SECTION ***
    console.log('Adding missing columns...');
    
    // Add missing columns to existing tables
    const addColumnStatements = [
      // Players table missing columns
      "ALTER TABLE players ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE players ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      
      // My_roster table missing columns
      "ALTER TABLE my_roster ADD COLUMN IF NOT EXISTS added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE my_roster ADD COLUMN IF NOT EXISTS notes TEXT",
      
      // Watchlist table missing columns  
      "ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    ];

    // Execute each ALTER TABLE statement
    for (const statement of addColumnStatements) {
      try {
        await safeQuery(statement);
        console.log(`✅ Executed: ${statement}`);
      } catch (error) {
        console.log(`⚠️ Skipped (likely already exists): ${statement} - ${error.message}`);
      }
    }

    // Create indexes for better performance
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

    // Check final column state
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

// Watchlist endpoints
app.get("/api/watchlist", async (req, res) => {
  if (!pool) {
    return res.json({ watchlist: [], message: 'Database not available' });
  }

  try {
    // Try the query with created_at first
    let { rows } = await safeQuery(
      'SELECT w.*, p.name, p.position, p.team FROM watchlist w JOIN players p ON p.id = w.player_id ORDER BY w.created_at DESC'
    );
    res.json({ watchlist: rows });
  } catch (error) {
    if (error?.code === '42703') {
      // Column doesn't exist, try without created_at
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

// Roster endpoints
app.get("/api/roster", async (_req, res) => {
  if (!pool) {
    return res.json({ roster: [], message: 'Database not available' });
  }

  try {
    // Try with added_date first
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
      // Column doesn't exist, try without added_date
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

// ESPN API endpoints (legacy - kept for backwards compatibility)
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
      'POST /api/players',
      'POST /admin/migrate',
      'GET /api/ffscrapr/test',
      'GET /api/ffscrapr/league/:leagueId',
      'GET /api/ffscrapr/freeagents/:leagueId',
      'GET /api/ffscrapr/players/:leagueId'
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
  console.log(`FFscrapr test: http://localhost:${PORT}/api/ffscrapr/test`);
});
