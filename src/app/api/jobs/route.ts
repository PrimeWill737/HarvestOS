import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runJobs } from '@/features/jobs';
import { db } from '@/lib/db';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const actual = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (
    !expected ||
    !actual ||
    expected.length !== actual.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  )
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
  try {
    return NextResponse.json({ success: true, data: await runJobs(db()) });
  } catch {
    return NextResponse.json({ success: false, error: { code: 'WORKER_FAILED' } }, { status: 500 });
  }
}
