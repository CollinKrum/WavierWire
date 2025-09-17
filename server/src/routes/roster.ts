import { Router } from 'express';
import { query } from '../db';


const router = Router();


router.get('/', async (_req, res) => {
  const viewQuery = 'SELECT * FROM v_my_roster ORDER BY position_slot';

  try {
    const { rows } = await query(viewQuery);
    return res.json({ roster: rows });
  } catch (error) {
    const err = error as { code?: string; message?: string } | undefined;

    if (err?.code === '42P01') {
      console.warn('[WARN] v_my_roster view missing, using fallback query');

      const fallbackQuery = `
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
      `;

      try {
        const { rows } = await query(fallbackQuery);
        return res.json({ roster: rows });
      } catch (fallbackError) {
        const fallbackErr = fallbackError as { code?: string; message?: string } | undefined;

        if (fallbackErr?.code === '42P01') {
          console.warn('[WARN] Roster tables missing, returning empty roster');
          return res.json({ roster: [] });
        }

        console.error('Error fetching roster via fallback:', fallbackError);
        return res.status(500).json({ error: fallbackErr?.message ?? 'Failed to load roster' });
      }
    }

    console.error('Error fetching roster:', error);
    return res.status(500).json({ error: err?.message ?? 'Failed to load roster' });
  }
});


router.post('/', async (req, res) => {
  const { player_id, position_slot } = req.body || {};

  if (!player_id || !position_slot) {
    return res.status(400).json({ error: 'player_id, position_slot required' });
  }

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
