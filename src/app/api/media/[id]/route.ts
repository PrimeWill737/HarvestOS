import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { actor, authorize } from '@/lib/auth';
import { db } from '@/lib/db';
import { assert, Problem } from '@/lib/errors';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await actor(),
      id = z.uuid().parse((await params).id);
    const [asset] = await db()`select * from media_assets where id=${id}`;
    assert(asset, 'NOT_FOUND', 'Media not found.', 404);
    await authorize(a, asset.organization_id);
    assert(
      process.env.CLOUDINARY_API_SECRET &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_CLOUD_NAME,
      'MEDIA_NOT_CONFIGURED',
      'Media provider not configured.',
      503,
    );
    const now = Math.floor(Date.now() / 1000),
      values = {
        public_id: asset.public_id,
        format: asset.format,
        type: 'authenticated',
        timestamp: now,
        expires_at: now + 60,
      };
    const signature = createHash('sha1')
      .update(
        Object.entries(values)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => k + '=' + v)
          .join('&') + process.env.CLOUDINARY_API_SECRET,
      )
      .digest('hex');
    const query = new URLSearchParams({
      ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])),
      api_key: process.env.CLOUDINARY_API_KEY!,
      signature,
    });
    const response = await fetch(
      'https://api.cloudinary.com/v1_1/' +
        process.env.CLOUDINARY_CLOUD_NAME +
        '/image/download?' +
        query,
      { signal: AbortSignal.timeout(15000) },
    );
    assert(response.ok, 'MEDIA_UNAVAILABLE', 'Evidence could not be loaded.', 502);
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': 'image/' + (asset.format === 'jpg' ? 'jpeg' : asset.format),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: { message: e instanceof Problem ? e.message : 'Media unavailable.' },
      },
      { status: e instanceof Problem ? e.status : 400 },
    );
  }
}
