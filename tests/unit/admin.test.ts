import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/lib/db', () => ({ db: () => ({ begin: (fn: any) => fn({}) }) }));
vi.mock('../../src/lib/supabase/server', () => ({ supabase: vi.fn() }));
import { adminChange, adminOverview } from '../../src/features/admin';
import { extendedWrite } from '../../src/features/extended';
import type { Actor } from '../../src/lib/auth';
const a: Actor = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'test@example.test',
  role: 'member',
  region: 'Plateau',
  aal: 'aal1',
};
describe('privileged entry points fail closed', () => {
  it.each(['users', 'organizations', 'configuration', 'incidents', 'privacy', 'outbox'])(
    'denies a member mutation of %s',
    async (section) => {
      await expect(adminChange(a, section, a.id, {})).rejects.toMatchObject({ status: 403 });
    },
  );
  it.each(['users', 'configuration', 'privacy'])(
    'denies a regional administrator global %s mutation',
    async (section) => {
      await expect(
        adminChange({ ...a, role: 'admin', aal: 'aal2' }, section, a.id, {}),
      ).rejects.toMatchObject({ status: 403 });
    },
  );
  it('denies coordinator access to administrator user listing', async () => {
    await expect(adminOverview({ ...a, role: 'coordinator' }, 'users')).rejects.toMatchObject({
      status: 403,
    });
  });
  it.each(['catalog', 'policies'])(
    'denies regional administrator global %s configuration',
    async (section) => {
      await expect(
        extendedWrite({ ...a, role: 'admin', aal: 'aal2' }, section, {}),
      ).rejects.toMatchObject({ status: 403 });
    },
  );
});
