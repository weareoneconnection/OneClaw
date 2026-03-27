import "dotenv/config";
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { loadConfig } from '../config.js';

async function main() {
  const config = loadConfig();
  if (!config.postgresUrl) throw new Error('POSTGRES_URL is required for migrations');
  const pool = new Pool({ connectionString: config.postgresUrl });
  try {
    await pool.query(`
      create table if not exists oneclaw_migrations (
        id serial primary key,
        name text not null unique,
        applied_at timestamptz not null default now()
      )
    `);

    const migrationDir = path.resolve('src/db/migrations');
    const files = fs.readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const already = await pool.query('select 1 from oneclaw_migrations where name = $1', [file]);
      if (already.rowCount) {
        console.log(`skip ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
      console.log(`apply ${file}`);
      await pool.query('begin');
      try {
        await pool.query(sql);
        await pool.query('insert into oneclaw_migrations (name) values ($1)', [file]);
        await pool.query('commit');
      } catch (error) {
        await pool.query('rollback');
        throw error;
      }
    }
    console.log('migrations complete');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
