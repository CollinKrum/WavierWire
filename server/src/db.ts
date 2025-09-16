import 'dotenv/config';
import { Pool } from 'pg';


const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl: process.env.PGSSL?.toLowerCase() === 'true' ? { rejectUnauthorized: false } : undefined,
});


export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }> {
const res = await pool.query(text, params);
return { rows: res.rows as T[] };
}
