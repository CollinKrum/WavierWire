import 'dotenv/config';
import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8081';
const SEASON = 2025;

// Position mappings
const POSITION_SLOTS = [
  { id: 0, name: 'QB', limit: 50 },
  { id: 2, name: 'RB', limit: 100 },
  { id: 4, name: 'WR', limit: 150 },
  { id: 6, name: 'TE', limit: 50 },
  { id: 16, name: 'D/ST', limit: 32 },
  { id: 17, name: 'K', limit: 32 }
];

async function fetchPlayersFromESPN(positionSlot, limit = 100) {
  console.log(`🔍 Fetching ${positionSlot.name} players...`);
  
  const filter = {
    players: {
      filterSlotIds: { value: [positionSlot.id] },
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      limit,
      offset: 0
    }
  };

  try {
    const response = await fetch(`${API_BASE}/api/espn/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season: SEASON, filter })
    });

    if (!response.ok) {
      throw new Error(`ESPN API failed: ${response.status}`);
    }

    const data = await response.json();
    const players = data.players || data || [];
    
    console.log(`✅ Found ${players.length} ${positionSlot.name} players`);
    
    return players.map(player => ({
      espn_id: player.id,
      name: player.fullName || player.name,
      position: positionSlot.name,
      team: player.proTeamAbbreviation || 'FA',
      bye_week: null, // Will be updated separately
      status: 'active'
    }));
  } catch (error) {
    console.error(`❌ Error fetching ${positionSlot.name}:`, error.message);
    return [];
  }
}

async function fetchByeWeeks() {
  console.log('📅 Fetching bye weeks...');
  
  try {
    const response = await fetch(`${API_BASE}/api/espn/byeWeeks?season=${SEASON}`);
    if (!response.ok) return {};
    
    const data = await response.json();
    const byeWeeks = {};
    
    if (data.settings?.proTeams) {
      data.settings.proTeams.forEach(team => {
        if (team.byeWeek && team.abbrev) {
          byeWeeks[team.abbrev] = team.byeWeek;
        }
      });
    }
    
    console.log(`✅ Found bye weeks for ${Object.keys(byeWeeks).length} teams`);
    return byeWeeks;
  } catch (error) {
    console.error('❌ Error fetching bye weeks:', error.message);
    return {};
  }
}

async function upsertPlayers(players) {
  if (players.length === 0) return;
  
  console.log(`💾 Upserting ${players.length} players...`);
  
  try {
    const response = await fetch(`${API_BASE}/api/players/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ players })
    });

    if (!response.ok) {
      throw new Error(`Upsert failed: ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ Upserted ${result.upserted || players.length} players`);
  } catch (error) {
    console.error('❌ Error upserting players:', error.message);
  }
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  console.log('🏈 Starting NFL Player Ingestion...\n');
  
  // First, get bye weeks
  const byeWeeks = await fetchByeWeeks();
  
  let allPlayers = [];
  
  // Fetch players for each position
  for (const position of POSITION_SLOTS) {
    const players = await fetchPlayersFromESPN(position, position.limit);
    
    // Add bye weeks to players
    players.forEach(player => {
      if (byeWeeks[player.team]) {
        player.bye_week = byeWeeks[player.team];
      }
    });
    
    allPlayers = allPlayers.concat(players);
    
    // Small delay to be nice to ESPN's API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n📊 Total players found: ${allPlayers.length}`);
  
  // Remove duplicates (some players might appear in multiple positions)
  const uniquePlayers = allPlayers.reduce((acc, player) => {
    const existing = acc.find(p => p.espn_id === player.espn_id);
    if (!existing) {
      acc.push(player);
    } else {
      // Keep the first position we found
      console.log(`🔄 Duplicate found: ${player.name} (${player.position})`);
    }
    return acc;
  }, []);
  
  console.log(`📊 Unique players: ${uniquePlayers.length}`);
  
  // Upsert in batches to avoid overwhelming the database
  const batches = chunkArray(uniquePlayers, 50);
  console.log(`\n📦 Processing ${batches.length} batches...`);
  
  for (let i = 0; i < batches.length; i++) {
    console.log(`\n📦 Batch ${i + 1}/${batches.length}`);
    await upsertPlayers(batches[i]);
    
    // Small delay between batches
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log('\n🎉 Player ingestion complete!');
  console.log(`✅ Total players processed: ${uniquePlayers.length}`);
  
  // Summary by position
  console.log('\n📊 Players by position:');
  POSITION_SLOTS.forEach(pos => {
    const count = uniquePlayers.filter(p => p.position === pos.name).length;
    console.log(`   ${pos.name}: ${count} players`);
  });
}

// Run the ingestion
main().catch(error => {
  console.error('💥 Ingestion failed:', error);
  process.exit(1);
});
