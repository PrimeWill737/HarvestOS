import './connection';
const required = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'DATABASE_URL',
];
let missing = false;
for (const key of required) {
  const present = Boolean(process.env[key]);
  console.log(key + ': ' + (present ? 'configured' : 'MISSING'));
  if (!present) missing = true;
}
if (process.env.DATABASE_URL) {
  const u = new URL(process.env.DATABASE_URL);
  if (u.port === '6543')
    console.warn(
      'Port 6543 usually indicates transaction pooling. Confirm your actual Supabase connection mode.',
    );
}
console.log('Optional: Cloudinary, Resend, Sentry and MapLibre are enabled only when configured.');
process.exitCode = missing ? 1 : 0;
