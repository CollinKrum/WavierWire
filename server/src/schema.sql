CREATE TABLE players (
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

CREATE TABLE my_roster (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  position_slot VARCHAR(20),
  added_date TIMESTAMP DEFAULT NOW()
);

CREATE TABLE watchlist (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) UNIQUE,
  interest_level INTEGER DEFAULT 3,
  notes TEXT,
  added_date TIMESTAMP DEFAULT NOW()
);

CREATE TABLE player_news (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  headline VARCHAR(500),
  content TEXT,
  source VARCHAR(100),
  published_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Helpful view
CREATE VIEW v_my_roster AS
SELECT r.*, p.name, p.position, p.team, p.bye_week
FROM my_roster r
JOIN players p ON p.id = r.player_id;
