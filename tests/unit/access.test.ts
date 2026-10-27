import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/lib/db', () => ({ db: vi.fn() }));
vi.mock('../../src/lib/supabase/server', () => ({ supabase: vi.fn() }));
import { requireRole, authorize, type Actor } from '../../src/lib/auth';
const member: Actor = {
  id: 'user',
  email: 'farmer@example.test',
  role: 'member',
  region: null,
  aal: 'aal1',
};
describe('server authorization', () => {
  it.each(['member', 'coordinator', 'admin'])('denies %s global administration', (role) =>
    expect(() => requireRole({ ...member, role }, ['super_admin'])).toThrow(),
  );
  it('allows super administrator role checks', () =>
    expect(() =>
      requireRole({ ...member, role: 'super_admin', aal: 'aal2' }, ['super_admin']),
    ).not.toThrow());
  it('denies an unrelated buyer editing a farmer organization', async () => {
    const tx = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 'farm-org', verification_status: 'verified', region: 'Plateau' },
      ])
      .mockResolvedValueOnce([]);
    await expect(authorize(member, 'farm-org', ['owner'], tx)).rejects.toMatchObject({
      status: 403,
    });
  });
  it('does not infer organization membership from an agent role label', async () => {
    const tx = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'org', verification_status: 'verified', region: 'Plateau' }])
      .mockResolvedValueOnce([{ role: 'member' }]);
    await expect(authorize(member, 'org', ['agent'], tx)).rejects.toMatchObject({ status: 403 });
  });
  it('bounds regional coordinator scope', async () => {
    const tx = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'org', verification_status: 'verified', region: 'Kano' }])
      .mockResolvedValueOnce([]);
    await expect(
      authorize({ ...member, role: 'coordinator', region: 'Plateau' }, 'org', undefined, tx),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('denies suspended organizations', async () => {
    const tx = vi.fn().mockResolvedValueOnce([{ id: 'org', verification_status: 'suspended' }]);
    await expect(authorize(member, 'org', undefined, tx)).rejects.toMatchObject({ status: 403 });
  });
});
