import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase/server';
export default async function AuthPage({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params;
  if (mode === 'mfa') {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
      redirect('/auth/login');
    const client = await supabase();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) redirect('/auth/login');
  }
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <AuthForm mode={mode} />
    </Suspense>
  );
}
