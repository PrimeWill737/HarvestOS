import { Problem } from '@/lib/errors';
import { notFound, redirect } from 'next/navigation';
import { configured } from '@/lib/db';
import { actor } from '@/lib/auth';
import { workspaces } from '@/lib/workspaces';
import Workspace from '@/components/Workspace';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ role: string; section?: string[] }>;
}) {
  const { role, section } = await params;
  if (!workspaces[role]) notFound();
  let access = 'member';
  if (configured()) {
    try {
      const a = await actor();
      access = a.role;
      if (role === 'super-admin' && a.role !== 'super_admin') redirect('/workspace/farmer');
      if (role === 'admin' && !['admin', 'super_admin'].includes(a.role))
        redirect('/workspace/farmer');
      if (role === 'operations' && !['coordinator', 'admin', 'super_admin'].includes(a.role))
        redirect('/workspace/farmer');
    } catch (e) {
      if (e instanceof Problem && e.code === 'MFA_REQUIRED') redirect('/auth/mfa');
      if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e;
      redirect('/auth/login');
    }
  }
  return (
    <Workspace
      role={role}
      section={section?.[0] || 'overview'}
      preview={!configured()}
      platformRole={access}
    />
  );
}
