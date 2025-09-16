import { Router } from 'express';
import { query } from '../db';


const router = Router();


router.get('/', async (_req, res) => {
const { rows } = await query('SELECT * FROM v_my_roster ORDER BY position_slot');
res.json({ roster: rows });
});


router.post('/', async (req, res) => {
const { player_id, position_slot } = req.body || {};
if (!player_id || !position_slot) return res.status(400).json({ error: 'player_id, position_slot required' });
const { rows } = await query(
'INSERT INTO my_roster (player_id, position_slot) VALUES ($1, $2) RETURNING *',
[player_id, position_slot]
);
res.json({ item: rows[0] });
});


router.delete('/:id', async (req, res) => {
await query('DELETE FROM my_roster WHERE id = $1', [req.params.id]);
res.json({ ok: true });
});


export default router;