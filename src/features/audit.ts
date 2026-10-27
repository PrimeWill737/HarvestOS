import type { Actor } from '@/lib/auth';
export async function audit(
  tx: any,
  a: Actor,
  action: string,
  resource: string,
  resourceId: string | null,
  org: string | null,
  before: unknown,
  after: unknown,
) {
  await tx`
insert into
  audit_logs (actor_id, organization_id, action, resource, resource_id, before_data, after_data)
values
  (${a.id}, ${org}, ${action}, ${resource}, ${resourceId}, ${tx.json(before ?? null)}, ${tx.json(after ?? null)})
`;
}
export async function notify(tx: any, org: string, event: string, payload: unknown) {
  await tx`insert into notification_outbox(organization_id,event,payload) values(${org},${event},${tx.json(payload)})`;
}
