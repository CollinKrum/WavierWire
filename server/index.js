import 'dotenv/config';
import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const SWID = process.env.SWID;
const ESPN_S2 = process.env.ESPN_S2;

if (!SWID || !ESPN_S2) {
  console.warn("[WARN] Missing SWID or ESPN_S2 env vars. Set them in your host.");
  console.log("SWID exists:", !!SWID);
  console.log("ESPN_S2 exists:", !!ESPN_S2);
}

// Simple in-memory rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 15;

function checkRateLimit(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  let requestHistory = rateLimitMap.get(clientIP) || [];
  requestHistory = requestHistory.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  
  if (requestHistory.length >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a minute before trying again.',
      retryAfter: 60
    });
  }
  
  requestHistory.push(now);
  rateLimitMap.set(clientIP, requestHistory);
  
  if (Math.random() < 0.1) {
    const cutoff = now - RATE_LIMIT_WINDOW;
    for (const [ip, history] of rateLimitMap.entries()) {
      const filtered = history.filter(timestamp => timestamp > cutoff);
      if (filtered.length === 0) {
        rateLimitMap.delete(ip);
      } else {
        rateLimitMap.set(ip, filtered);
      }
    }
  }
  
  next();
}

app.use('/api/espn', checkRateLimit);

// Enhanced ESPN fetch with better error handling
async function espnFetch(url, init = {}) {
  console.log(`Making ESPN API request to: ${url}`);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json',
    'Cookie': `SWID=${SWID}; ESPN_S2=${ESPN_S2}`,
    ...(init.headers || {})
  };

  if (init.filter) {
    headers['x-fantasy-filter'] = JSON.stringify(init.filter);
  }

  try {
    const res = await fetch(url, { 
      headers, 
      method: init.method || "GET",
      body: init.body
    });
    
    console.log(`ESPN API response status: ${res.status}`);
    
    if (res.status === 429) {
      console.warn(`ESPN rate limit hit for: ${url}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      const retryRes = await fetch(url, { headers, method: init.method || "GET", body: init.body });
      if (!retryRes.ok) {
        const text = await retryRes.text();
        throw new Error(`ESPN ${retryRes.status}: Rate limited - ${text.substring(0, 200)}`);
      }
      const retryJson = await retryRes.json();
      return retryJson;
    }
    
    if (!res.ok) {
      const text = await res.text();
      console.log(`ESPN Error Response (first 500 chars): ${text.substring(0, 500)}`);
      
      // Check if we got HTML instead of JSON (usually means wrong endpoint or auth issue)
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
        throw new Error(`ESPN returned HTML instead of JSON. Status: ${res.status}. This usually means authentication failed or wrong endpoint.`);
      }
      
      throw new Error(`ESPN ${res.status}: ${text.substring(0, 200)}`);
    }
    
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      console.log(`Non-JSON response: ${text.substring(0, 200)}`);
      throw new Error(`ESPN returned non-JSON response. Content-Type: ${contentType}`);
    }
    
    const json = await res.json();
    console.log(`ESPN API success: received ${JSON.stringify(json).length} characters`);
    return json;
    
  } catch (error) {
    console.error(`ESPN fetch error for ${url}:`, error.message);
    throw error;
  }
}

app.get("/api/espn/league", async (req, res) => {
  try {
    const { season = 2025, leagueId, view } = req.query;
    
    if (!leagueId) {
      return res.status(400).json({ error: "League ID is required" });
    }
    
    const v = view || "mTeam,mRoster,mSettings,mNav";
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=${encodeURIComponent(v)}`;
    
    console.log(`Fetching league data for League ID: ${leagueId}, Season: ${season}`);
    const data = await espnFetch(url);
    res.json(data);
  } catch (e) {
    console.error("League fetch error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/espn/leagueHistory", async (req, res) => {
  try {
    const { season = 2024, leagueId, view } = req.query;
    const v = view || "mTeam,mRoster,mSettings";
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${leagueId}?seasonId=${season}&view=${encodeURIComponent(v)}`;
    
    console.log(`Fetching league history for: ${leagueId}`);
    const data = await espnFetch(url);
    res.json(data);
  } catch (e) {
    console.error("League history fetch error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/espn/players", async (req, res) => {
  try {
    const { season = 2024, filter } = req.body;
    
    // Use GET method instead of POST for players endpoint
    let url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/players?view=players_wl`;
    
    // Add basic query parameters if filter exists
    if (filter && filter.players) {
      const params = new URLSearchParams();
      if (filter.players.limit) params.append('limit', filter.players.limit);
      if (filter.players.offset) params.append('offset', filter.players.offset || 0);
      
      if (params.toString()) {
        url += '&' + params.toString();
      }
    }
    
    console.log(`Fetching players for season: ${season}`);
    console.log(`URL: ${url}`);
    
    const data = await espnFetch(url, { 
      method: 'GET',
      filter: filter // This goes in x-fantasy-filter header
    });
    res.json(data);
  } catch (e) {
    console.error("Players fetch error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/espn/playerInfo", async (req, res) => {
  try {
    const { season = 2025, pprId = 0, filter } = req.body;
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/${pprId}?view=kona_player_info`;
    
    console.log(`Fetching player info for season: ${season}`);
    const data = await espnFetch(url, { filter });
    res.json(data);
  } catch (e) {
    console.error("Player info fetch error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/espn/byeWeeks", async (req, res) => {
  try {
    const { season = 2025 } = req.query;
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}?view=proTeamSchedules_wl`;
    
    console.log(`Fetching bye weeks for season: ${season}`);
    const data = await espnFetch(url);
    res.json(data);
  } catch (e) {
    console.error("Bye weeks fetch error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/espn/news", async (req, res) => {
  try {
    const { playerId, limit = 10 } = req.query;
    const url = `https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?playerId=${playerId}&limit=${limit}`;
    
    console.log(`Fetching news for player: ${playerId}`);
    const data = await espnFetch(url);
    res.json(data);
  } catch (e) {
    console.error("News fetch error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Test endpoint to verify ESPN credentials
app.get("/api/espn/test", async (req, res) => {
  try {
    // Try a simple request to verify our credentials work
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2024?view=proTeamSchedules_wl`;
    console.log("Testing ESPN credentials...");
    const data = await espnFetch(url);
    res.json({ 
      success: true, 
      message: "ESPN API access working",
      dataSize: JSON.stringify(data).length 
    });
  } catch (e) {
    console.error("ESPN test error:", e.message);
    res.status(500).json({ 
      success: false, 
      error: e.message,
      suggestion: "Try refreshing your SWID and ESPN_S2 cookies from ESPN.com"
    });
  }
});

// Simple players endpoint without filters
app.get("/api/espn/players-simple", async (req, res) => {
  try {
    const { season = 2024 } = req.query;
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/players?view=players_wl`;
    
    console.log(`Fetching simple players list for season: ${season}`);
    const data = await espnFetch(url);
    res.json({
      success: true,
      playersCount: data.players?.length || 0,
      players: data.players?.slice(0, 50) || [] // Return first 50 players
    });
  } catch (e) {
    console.error("Simple players fetch error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    rateLimitStats: {
      activeIPs: rateLimitMap.size,
      maxRequestsPerMinute: MAX_REQUESTS_PER_WINDOW
    },
    env: {
      hasSwid: !!SWID,
      hasEspnS2: !!ESPN_S2,
      swidLength: SWID?.length || 0,
      espnS2Length: ESPN_S2?.length || 0
    }
  });
});

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`🚀 Fantasy proxy running on http://localhost:${PORT}`);
  console.log(`📊 Rate limiting: ${MAX_REQUESTS_PER_WINDOW} requests per minute per IP`);
  console.log(`⚡ ESPN API delays: 1 second between requests`);
  if (!SWID || !ESPN_S2) {
    console.log(`⚠️  Warning: Missing ESPN credentials`);
  } else {
    console.log(`✅ ESPN credentials loaded (SWID: ${SWID.length} chars, ESPN_S2: ${ESPN_S2.length} chars)`);
    console.log(`🧪 Test your credentials at: http://localhost:${PORT}/api/espn/test`);
  }
});
