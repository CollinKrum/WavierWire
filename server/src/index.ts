import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { query } from './db';
import playersRouter from './routes/players';
import rosterRouter from './routes/roster';
import watchlistRouter from './routes/watchlist';
import newsRouter from './routes/news';


const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*' }));
app.use(express.json());


app.get('/health', (_req, res) => res.json({ ok: true }));


app.use('/api/players', playersRouter);
app.use('/api/roster', rosterRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/news', newsRouter);


const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => console.log(`🟢 Fantasy Manager API on :${PORT}`));


// Optional: tiny helper to ensure schema exists (only for local dev)
app.post('/admin/migrate', async (_req, res) => {
try {
await query(await (await import('node:fs/promises')).readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
res.json({ ok: true });
} catch (e: any) {
res.status(500).json({ ok: false, error: e?.message });
}
});
