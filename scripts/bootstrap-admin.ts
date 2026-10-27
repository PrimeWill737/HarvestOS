import { connection } from './connection';
const sql = connection();
try {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!email) throw new Error('Set BOOTSTRAP_ADMIN_EMAIL to an existing, verified Supabase user.');
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(927314)`;
    const [existing] = await tx`select id from profiles where platform_role='super_admin'`;
    if (existing)
      throw new Error(
        'Bootstrap is disabled after the first super administrator exists. Use the audited panel.',
      );
    const [user] = await tx`
select
  id
from
  auth.users
where
  lower(email) = lower(${email})
  and email_confirmed_at is not null
`;
    if (!user) throw new Error('Register and verify the administrator email first.');
    await tx`update profiles set platform_role='super_admin' where id=${user.id}`;
    await tx`
insert into
  audit_logs (actor_id, action, resource, resource_id, after_data)
values
  (${user.id}, 'bootstrap-super-admin', 'profiles', ${user.id}, '{"platform_role":"super_admin"}')
`;
  });
  console.log(
    'Super administrator bootstrapped. Enroll MFA at /auth/mfa before opening the panel.',
  );
} finally {
  await sql.end();
}
