import fetch from 'node-fetch';
import 'dotenv/config';

const API_BASE_URL = 'https://wavierwire.onrender.com';

// NFL team mapping for bye weeks
const NFL_TEAMS = {
  1: { abbrev: 'ATL', bye: 12 },
  2: { abbrev: 'BUF', bye: 12 },
  3: { abbrev: 'CHI', bye: 7 },
  4: { abbrev: 'CIN', bye: 12 },
  5: { abbrev: 'CLE', bye: 10 },
  6: { abbrev: 'DAL', bye: 7 },
  7: { abbrev: 'DEN', bye: 14 },
  8: { abbrev: 'DET', bye: 5 },
  9: { abbrev: 'GB', bye: 10 },
  10: { abbrev: 'TEN', bye: 5 },
  11: { abbrev: 'IND', bye: 14 },
  12: { abbrev: 'KC', bye: 6 },
  13: { abbrev: 'LV', bye: 10 },
  14: { abbrev: 'LAR', bye: 6 },
  15: { abbrev: 'MIA', bye: 6 },
  16: { abbrev: 'MIN', bye: 6 },
  17: { abbrev: 'NE', bye: 14 },
  18: { abbrev: 'NO', bye: 12 },
  19: { abbrev: 'NYG', bye: 11 },
  20: { abbrev: 'NYJ', bye: 12 },
  21: { abbrev: 'PHI', bye: 5 },
  22: { abbrev: 'ARI', bye: 11 },
  23: { abbrev: 'PIT', bye: 9 },
  24: { abbrev: 'LAC', bye: 5 },
  25: { abbrev: 'SF', bye: 9 },
  26: { abbrev: 'SEA', bye: 10 },
  27: { abbrev: 'TB', bye: 11 },
  28: { abbrev: 'WAS', bye: 14 },
  29: { abbrev: 'CAR', bye: 11 },
  30: { abbrev: 'JAX', bye: 9 },
  33: { abbrev: 'BAL', bye: 14 },
  34: { abbrev: 'HOU', bye: 9 }
};

// Position slot mapping
const POSITION_SLOTS = {
  0: 'QB',
  2: 'RB', 
  4: 'WR',
  6: 'TE',
  16: 'D/ST',
  17: 'K'
};

const INJURY_STATUS = {
  0: 'ACTIVE',
  1: 'BEREAVEMENT',
  2: 'DAY_TO_DAY',
  3: 'DOUBTFUL',
  4: 'FIFTEEN_DAY_DL',
  5: 'INJURY_RESERVE',
  6: 'OUT',
  7: 'PHYSICALLY_UNABLE_TO_PERFORM',
  8: 'PROBABLE',
  9: 'QUESTIONABLE',
  10: 'SEVEN_DAY_DL',
  11: 'SIXTY_DAY_DL',
  12: 'SUSPENSION',
  13: 'TEN_DAY_DL',
  14: 'WAIVERS'
};

async function fetchPlayersFromESPN(position) {
  console.log(`Fetching ${POSITION_SLOTS[position]} players...`);
  
  const filter = {
    players: {
      filterSlotIds: {
        value: [position]
      },
      limit: 1000,
      sortPercOwned: {
        sortAsc: false,
        sortPriority: 1
      }
    }
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/espn/players`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        season: 2024,
        filter: filter
      })
    });

    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();
    return data.players || [];
  } catch (error) {
    console.error(`Error fetching ${POSITION_SLOTS[position]} players:`, error.message);
    return [];
  }
}

function processPlayer(player) {
  const name = `${player.player?.firstName || ''} ${player.player?.lastName || ''}`.trim();
  const position = POSITION_SLOTS[player.player?.defaultPositionId] || 'UNKNOWN';
  const teamInfo = NFL_TEAMS[player.player?.proTeamId];
  const team = teamInfo?.abbrev || 'FA';
  const bye_week = teamInfo?.bye || null;
  const status = INJURY_STATUS[player.player?.injuryStatus] || 'ACTIVE';

  return {
    espn_id: player.player?.id,
    name: name,
    position: position,
    team: team,
    bye_week: bye_week,
    status: status
  };
}

async function uploadPlayersBatch(players) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/players/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ players })
    });

    if (!response.ok) {
      throw new Error(`Upload error: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error uploading players:', error.message);
    throw error;
  }
}

async function ingestAllPlayers() {
  console.log('🏈 Starting NFL player ingestion...');
  console.log(`API Base URL: ${API_BASE_URL}`);
  
  const allPlayers = [];
  const positions = [0, 2, 4, 6, 16, 17]; // QB, RB, WR, TE, D/ST, K
  
  // Fetch players for each position
  for (const position of positions) {
    const players = await fetchPlayersFromESPN(position);
    console.log(`Found ${players.length} ${POSITION_SLOTS[position]} players`);
    
    const processedPlayers = players
      .filter(p => p.player?.id && p.player?.firstName && p.player?.lastName)
      .map(processPlayer);
    
    allPlayers.push(...processedPlayers);
    
    // Small delay to be nice to ESPN's API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n📊 Total players to upload: ${allPlayers.length}`);
  
  // Upload in batches of 50
  const batchSize = 50;
  let totalUploaded = 0;
  
  for (let i = 0; i < allPlayers.length; i += batchSize) {
    const batch = allPlayers.slice(i, i + batchSize);
    
    try {
      const result = await uploadPlayersBatch(batch);
      totalUploaded += result.inserted;
      console.log(`✅ Uploaded batch ${Math.floor(i/batchSize) + 1}: ${result.inserted} players`);
    } catch (error) {
      console.error(`❌ Failed to upload batch ${Math.floor(i/batchSize) + 1}:`, error.message);
    }
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n🎉 Ingestion complete! Total players uploaded: ${totalUploaded}`);
  
  // Test the database
  console.log('\n🔍 Testing database...');
  try {
    const testResponse = await fetch(`${API_BASE_URL}/api/players?limit=5`);
    const testData = await testResponse.json();
    const testPlayers = testData.players || [];
    console.log('Sample players in database:');
    testPlayers.forEach(p => {
      console.log(`  - ${p.name} (${p.position}, ${p.team})`);
    });
  } catch (error) {
    console.error('Error testing database:', error.message);
  }
}

// Run the ingestion
ingestAllPlayers().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
