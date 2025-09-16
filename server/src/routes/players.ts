import { Router } from 'express';
import { query } from '../db';


const router = Router();


// List players (basic filters)
router.get('/', async (req, res) => {
const { position, team, q } = req.query as Record<string, string | undefined>;
const params: any[] = [];
const where: string[] = [];
if (position) { params.push(position); where.push(`position = $${params.length}`); }
if (team) { params.push(team); where.push(`team = $${params.length}`); }
if (q) { params.push(`%${q}%`); where.push(`name ILIKE $${params.length}`); }
const sql = `SELECT * FROM players ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name ASC LIMIT 200`;
const { rows } = await query(sql, params);
res.json({ players: rows });
});


// Upsert players (for your ESPN/feeds ingester to call)
router.post('/upsert', async (req, res) => {
const players = req.body?.players as any[];
if (!Array.isArray(players)) return res.status(400).json({ error: 'players[] required' });


const valuesSql = players.map((_p, i) =>
`($${i*6+1}, $${i*6+2}, $${i*6+3}, $${i*6+4}, $${i*6+5}, $${i*6+6})`
).join(',');


const params = players.flatMap(p => [p.espn_id, p.name, p.position, p.team, p.bye_week, p.status ?? 'active']);


const sql = `
INSERT INTO players (espn_id, name, position, team, bye_week, status)
VALUES ${valuesSql}
ON CONFLICT (espn_id) DO UPDATE SET
name = EXCLUDED.name,
position = EXCLUDED.position,
team = EXCLUDED.team,
bye_week = EXCLUDED.bye_week,
status = EXCLUDED.status,
updated_at = NOW();
`;


await query(sql, params);
res.json({ ok: true, upserted: players.length });
});


export default router;
