import 'server-only';
import { supabase } from './supabase/server';
import { db, configured } from './db';
import { Problem } from './errors';
export type Actor = { id: string; email: string; role: string; region: string | null; aal: string };
export async function actor(): Promise<Actor> {
  if (!configured())
    throw new Problem(
      503,
      'SETUP_REQUIRED',
      'Add your Supabase and PostgreSQL credentials to .env.',
    );
  const client = await supabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Problem(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  if (!data.user.email_confirmed_at && !data.user.phone_confirmed_at)
    throw new Problem(403, 'IDENTITY_UNVERIFIED', 'Verify your email or phone first.');
  const [p] = await db()`select * from profiles where id=${data.user.id}`;
  if (!p || p.status !== 'active')
    throw new Problem(403, 'ACCOUNT_INACTIVE', 'Complete onboarding or contact support.');
  const { data: assurance } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  const aal = assurance?.currentLevel || 'aal1';
  if (['admin', 'super_admin'].includes(p.platform_role) && aal !== 'aal2')
    throw new Problem(
      403,
      'MFA_REQUIRED',
      'Administrator access requires an authenticator verification.',
    );
  return { id: p.id, email: data.user.email || '', role: p.platform_role, region: p.region, aal };
}
export function requireRole(a: Actor, roles: string[]) {
  if (!roles.includes(a.role))
    throw new Problem(403, 'FORBIDDEN', 'Your role cannot perform this action.');
}
export async function authorize(a: Actor, org: string, roles?: string[], tx: any = db()) {
  const [organization] = await tx`select * from organizations where id=${org}`;
  if (!organization || organization.verification_status === 'suspended')
    throw new Problem(403, 'ORGANIZATION_INACTIVE', 'Organization unavailable or suspended.');
  if (a.role === 'super_admin') return organization;
  if (['admin', 'coordinator'].includes(a.role) && a.region === organization.region)
    return organization;
  const [member] = await tx`
select
  role
from
  organization_memberships
where
  organization_id = ${org}
  and user_id = ${a.id}
  and status = 'active'
`;
  if (!member || (roles && !roles.includes(member.role)))
    throw new Problem(403, 'FORBIDDEN', 'You do not have permission in this organization.');
  return organization;
}
export async function scope(a: Actor) {
  if (a.role === 'super_admin') return (await db()`select id from organizations`).map((x) => x.id);
  if (['admin', 'coordinator'].includes(a.role))
    return (await db()`select id from organizations where region=${a.region}`).map((x) => x.id);
  return (
    await db()`
select
  m.organization_id
from
  organization_memberships m
  join organizations o on o.id = m.organization_id
where
  m.user_id = ${a.id}
  and m.status = 'active'
  and o.verification_status <> 'suspended'
`
  ).map((x) => x.organization_id);
}

export async function authorizeFarm(a: Actor, farmId: string, tx: any = db()) {
  const [farm] = await tx`select * from farms where id=${farmId}`;
  if (!farm) throw new Problem(404, 'NOT_FOUND', 'Farm not found.');
  const [owner] =
    await tx`select verification_status from organizations where id=${farm.organization_id}`;
  if (owner?.verification_status === 'suspended')
    throw new Problem(403, 'ORGANIZATION_INACTIVE', 'Farm organization is suspended.');
  try {
    return await authorize(a, farm.organization_id, ['owner', 'manager', 'agent'], tx);
  } catch (error) {
    const [delegation] = await tx`
select
  d.id
from
  farm_delegations d
  join organization_memberships m on m.organization_id = d.organization_id
  join organizations o on o.id = d.organization_id
where
  d.farm_id = ${farmId}
  and d.expires_at > now()
  and m.user_id = ${a.id}
  and m.status = 'active'
  and m.role in ('owner', 'manager', 'agent')
  and o.verification_status = 'verified'
`;
    if (!delegation) throw error;
    return farm;
  }
}
