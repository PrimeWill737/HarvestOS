import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/server';
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const next = req.nextUrl.searchParams.get('next');
  const target = next === '/auth/reset' ? next : '/workspace/farmer';
  if (code) {
    const client = await supabase();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(target, req.url));
  }
  return NextResponse.redirect(new URL('/auth/login?error=verification_failed', req.url));
}
