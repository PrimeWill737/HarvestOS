import { connection } from './connection';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sql = connection();
try {
  await sql`
create table if not exists schema_migrations (
  name text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
)
`;
  for (const name of (await readdir('supabase/migrations'))
    .filter((x) => x.endsWith('.sql'))
    .sort()) {
    const content = await readFile('supabase/migrations/' + name, 'utf8'),
      checksum = createHash('sha256').update(content).digest('hex');
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(927311)`;
      const [old] = await tx`select checksum from schema_migrations where name=${name}`;
      if (old) {
        if (old.checksum !== checksum) throw new Error('Applied migration changed: ' + name);
        return;
      }
      await tx.unsafe(content);
      await tx`insert into schema_migrations(name,checksum) values(${name},${checksum})`;
      console.log('Applied ' + name);
    });
  }
} finally {
  await sql.end();
}
