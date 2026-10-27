import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';
export default async function AuthPage({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params;
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <AuthForm mode={mode} />
    </Suspense>
  );
}
