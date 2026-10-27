import 'server-only';
import postgres from 'postgres';
let client: ReturnType<typeof postgres> | undefined;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_NOT_CONFIGURED');
  return (client ??= postgres(process.env.DATABASE_URL, {
    max: Number(process.env.DATABASE_POOL_MAX || 2),
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
    prepare: false,
  }));
}
export const configured = () =>
  Boolean(
    process.env.DATABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
