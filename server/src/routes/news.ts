import { Router } from 'express';
import { query } from '../db';


const router = Router();


router.get('/', async (req, res) => {
const { player_id } = req.query as { player_id?: string };
const params: any[] = [];
let sql = 'SELECT * FROM player_news';
if (player_id) { params.push(player_id); sql += ` WHERE player_id = $${params.length}`; }
sql += ' ORDER BY published_date DESC LIMIT 200';
const { rows } = await query(sql, params);
res.json({ news: rows });
});


// Bulk insert news items (your ingester calls this)
router.post('/bulk', async (req, res) => {
const items = req.body?.items as any[];
if (!Array.isArray(items)) return res.status(400).json({ error: 'items[] required' });


const valuesSql = items.map((_n, i) => `($${i*5+1}, $${i*5+2}, $${i*5+3}, $${i*5+4}, $${i*5+5})`).join(',');
const params = items.flatMap(n => [n.player_id, n.headline, n.content ?? null, n.source ?? 'misc', n.published_date ?? new Date()]);


const sql = `
INSERT INTO player_news (player_id, headline, content, source, published_date)
VALUES ${valuesSql}
`;


await query(sql, params);
res.json({ ok: true, inserted: items.length });
});


export default router;
