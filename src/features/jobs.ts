import { persistRisk } from './intelligence/persist';
import postgres from 'postgres';
export async function runJobs(sql: ReturnType<typeof postgres>) {
  const [policy] =
    await sql`select settings from operational_policies order by created_at desc limit 1`;
  const grace = Number(policy?.settings?.pickup_grace_hours ?? 2),
    escalation = Number(policy?.settings?.incident_escalation_hours ?? 24);
  // Expire unaccepted offers. Confirmed orders become incidents; inventory is never silently released after dispatch.
  await sql`update purchase_offers set status='expired' where status='pending' and expires_at<now()`;
  await sql`
insert into
  incidents (organization_id, order_id, kind, description)
select
  o.seller_organization_id,
  o.id,
  'late_pickup',
  'Reservation deadline passed; coordinator must review before stock release.'
from
  inventory_reservations r
  join orders o on o.id = r.order_id
where
  r.status = 'active'
  and r.expires_at < now() - (${grace} * interval '1 hour')
  and not exists (
    select
      1
    from
      incidents i
    where
      i.order_id = o.id
      and i.kind = 'late_pickup'
  )
on conflict do nothing
`;
  await sql`
insert into
  incidents (organization_id, storage_reservation_id, kind, description)
select
  r.organization_id,
  r.id,
  'late_storage_collection',
  'Storage window expired with goods still held. Coordinate release and inspect condition.'
from
  storage_reservations r
where
  r.status = 'received'
  and r.ends_at < now()
on conflict do nothing
`;
  await sql`
update incidents
set
  escalated_at = now()
where
  status <> 'resolved'
  and escalated_at is null
  and created_at < now() - (${escalation} * interval '1 hour')
`;
  await sql`
update notification_outbox
set
  status = 'pending',
  locked_at = null
where
  status = 'processing'
  and locked_at < now() - interval '10 minutes'
`;
  for (let i = 0; i < 100; i++) {
    const job = await sql.begin(async (tx) => {
      const [row] = await tx`
select
  *
from
  notification_outbox
where
  status = 'pending'
  and next_attempt_at <= now()
order by
  created_at
for update
  skip locked
limit
  1
`;
      if (!row) return null;
      await tx`
update notification_outbox
set
  status = 'processing',
  locked_at = now(),
  attempts = attempts + 1
where
  id = ${row.id}
`;
      return row;
    });
    if (!job) break;
    try {
      const users = await sql`
select
  p.id,
  u.email
from
  organization_memberships m
  join profiles p on p.id = m.user_id
  join auth.users u on u.id = p.id
where
  m.organization_id = ${job.organization_id}
  and m.status = 'active'
  and p.status = 'active'
`;
      for (const u of users) {
        await sql`
insert into
  notifications (id, user_id, title, body)
values
  (md5(${job.id + ':' + u.id})::uuid, ${u.id}, ${job.event}, ${JSON.stringify(job.payload)})
on conflict (id) do nothing
`;
        if (process.env.RESEND_API_KEY && u.email) {
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
              'Content-Type': 'application/json',
              'Idempotency-Key': job.id + ':' + u.id,
            },
            body: JSON.stringify({
              from: process.env.NOTIFICATION_FROM,
              to: u.email,
              subject: 'HarvestOS: ' + job.event,
              text: 'An update is available in your HarvestOS workspace. Sign in to review it.',
            }),
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) throw new Error('Notification provider rejected delivery');
        }
      }
      await sql`
update notification_outbox
set
  status = 'sent',
  locked_at = null,
  last_error = null
where
  id = ${job.id}
`;
    } catch {
      const attempts = Number(job.attempts) + 1;
      await sql`
update notification_outbox
set
  status = ${attempts >= Number(process.env.OUTBOX_MAX_ATTEMPTS || 5) ? 'failed' : 'pending'},
  next_attempt_at = now() + (${Math.min(3600, 30 * 2 ** attempts)} * interval '1 second'),
  last_error = 'Delivery failed; inspect provider logs',
  locked_at = null
where
  id = ${job.id}
`;
    }
  }
  await sql`delete from api_rate_limits where window_start<now()-interval '1 day'`;
  const harvests =
    await sql`select id from harvests where status in ('published','partially_allocated','allocated')`;
  for (const h of harvests) await persistRisk(sql, h.id);
  console.log('Outbox and deadline review completed.');

  return { processed: true };
}
