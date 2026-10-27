import { redirect } from 'next/navigation';
import { actor } from '@/lib/auth';
import { Problem } from '@/lib/errors';

export default async function CompleteSignIn() {
  let user;
  try {
    user = await actor();
  } catch (error) {
    if (error instanceof Problem && error.code === 'MFA_REQUIRED') redirect('/auth/mfa');
    if (error instanceof Problem && error.code === 'UNAUTHENTICATED') redirect('/auth/login');
    throw error;
  }
  const destination = {
    super_admin: 'super-admin',
    admin: 'admin',
    coordinator: 'operations',
  }[user.role] || 'farmer';
  redirect(`/workspace/${destination}`);
}
