CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  espn_id INTEGER UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  position VARCHAR(10),
  team VARCHAR(10),
  bye_week INTEGER,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User's roster management
CREATE TABLE IF NOT EXISTS my_roster (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  position_slot VARCHAR(20) NOT NULL,
  added_date TIMESTAMP DEFAULT NOW(),
  notes TEXT
);

-- Watchlist for tracking potential pickups
CREATE TABLE IF NOT EXISTS watchlist (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE UNIQUE,
  interest_level INTEGER DEFAULT 3 CHECK (interest_level >= 1 AND interest_level <= 5),
  notes TEXT,
  added_date TIMESTAMP DEFAULT NOW()
);

-- Player news and updates
CREATE TABLE IF NOT EXISTS player_news (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  headline VARCHAR(500) NOT NULL,
  content TEXT,
  source VARCHAR(100) DEFAULT 'ESPN',
  published_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Waiver claims tracking (optional)
CREATE TABLE IF NOT EXISTS waiver_claims (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  claim_priority INTEGER,
  faab_bid INTEGER DEFAULT 0,
  claim_date TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT
);

-- Useful view for roster with player details
CREATE OR REPLACE VIEW v_my_roster AS
SELECT 
  r.id,
  r.position_slot,
  r.added_date,
  r.notes as roster_notes,
  p.id as player_id,
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

-- View for watchlist with player details
CREATE OR REPLACE VIEW v_watchlist AS
SELECT 
  w.id,
  w.interest_level,
  w.notes,
  w.added_date,
  p.id as player_id,
  p.espn_id,
  p.name,
  p.position,
  p.team,
  p.bye_week,
  p.status
FROM watchlist w
JOIN players p ON p.id = w.player_id
ORDER BY w.interest_level DESC, w.added_date DESC;

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_players_espn_id ON players(espn_id);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(position);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);
CREATE INDEX IF NOT EXISTS idx_roster_player_id ON my_roster(player_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_player_id ON watchlist(player_id);
CREATE INDEX IF NOT EXISTS idx_news_player_id ON player_news(player_id);
CREATE INDEX IF NOT EXISTS idx_news_published_date ON player_news(published_date);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_players_updated_at 
  BEFORE UPDATE ON players 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Sample data (optional - remove if you don't want test data)
INSERT INTO players (espn_id, name, position, team, bye_week) VALUES
  (4262921, 'Christian McCaffrey', 'RB', 'SF', 9),
  (3116385, 'Cooper Kupp', 'WR', 'LAR', 6),
  (4038524, 'Josh Allen', 'QB', 'BUF', 12),
  (3043078, 'Travis Kelce', 'TE', 'KC', 10),
  (4430692, 'Brock Purdy', 'QB', 'SF', 9)
ON CONFLICT (espn_id) DO NOTHING;
