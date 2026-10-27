import postgres from 'postgres';
// Bun automatically loads .env before running these scripts.
export function connection() {
  if (!process.env.DATABASE_URL)
    throw new Error('Set DATABASE_URL in .env to your Supabase Session Pooler connection string.');
  return postgres(process.env.DATABASE_URL, {
    max: 1,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
    prepare: false,
  });
}
