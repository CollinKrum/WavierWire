import { Router } from 'express';
import { query } from '../db';


const router = Router();


router.get('/', async (_req, res) => {
const { rows } = await query(
'SELECT w.*, p.name, p.position, p.team FROM watchlist w JOIN players p ON p.id = w.player_id ORDER BY added_date DESC'
);
res.json({ watchlist: rows });
});


router.post('/', async (req, res) => {
const { player_id, interest_level = 3, notes } = req.body || {};
if (!player_id) return res.status(400).json({ error: 'player_id required' });
const { rows } = await query(
'INSERT INTO watchlist (player_id, interest_level, notes) VALUES ($1, $2, $3) ON CONFLICT (player_id) DO UPDATE SET interest_level = EXCLUDED.interest_level, notes = EXCLUDED.notes RETURNING *',
[player_id, interest_level, notes ?? null]
);
res.json({ item: rows[0] });
});


router.delete('/:id', async (req, res) => {
await query('DELETE FROM watchlist WHERE id = $1', [req.params.id]);
res.json({ ok: true });
});


export default router;