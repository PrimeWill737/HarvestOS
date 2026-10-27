import { connection } from './connection';
import { readFile } from 'node:fs/promises';
const sql = connection();
try {
  await sql.begin(async (tx) => {
    await tx.unsafe(await readFile('supabase/seed.sql', 'utf8'));
  });
  console.log('Catalogs and prototype rules seeded. No fictional transactions were added.');
} finally {
  await sql.end();
}
