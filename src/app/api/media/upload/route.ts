import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { actor, authorize } from '@/lib/auth';
import { assert, Problem } from '@/lib/errors';
import { db } from '@/lib/db';
import { audit } from '@/features/audit';
import { z } from 'zod';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const a = await actor();
    assert(
      req.headers.get('origin') === new URL(process.env.NEXT_PUBLIC_APP_URL || req.url).origin,
      'INVALID_ORIGIN',
      'Invalid origin.',
      403,
    );
    const max = Math.min(5242880, Number(process.env.MEDIA_MAX_BYTES || 5242880));
    assert(
      Number(req.headers.get('content-length') || 0) <= max + 65536,
      'FILE_TOO_LARGE',
      'Maximum image size is 5 MB.',
      413,
    );
    // Read with a strict cap even for chunked requests.
    const reader = req.body?.getReader();
    assert(reader, 'FILE_REQUIRED', 'Upload an image.', 400);
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max + 65536) {
        await reader.cancel();
        throw new Problem(413, 'FILE_TOO_LARGE', 'Maximum image size is 5 MB.');
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { 'Content-Type': req.headers.get('content-type') || '' },
    }).formData();
    const org = z.uuid().parse(form.get('organization_id'));
    await authorize(a, org);
    const file = form.get('file');
    assert(
      file instanceof File && file.size <= max,
      'INVALID_FILE',
      'Upload a JPEG, PNG or WebP image up to 5 MB.',
      400,
    );
    const bytes = Buffer.from(await file.arrayBuffer());
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
      png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      webp =
        bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    assert(jpeg || png || webp, 'INVALID_IMAGE', 'File signature is not a supported image.', 400);
    assert(
      process.env.CLOUDINARY_API_SECRET &&
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY,
      'MEDIA_NOT_CONFIGURED',
      'Set Cloudinary credentials to enable private image uploads.',
      503,
    );
    const publicId = 'harvestos/' + org + '/' + crypto.randomUUID();
    const params = {
      public_id: publicId,
      timestamp: Math.floor(Date.now() / 1000),
      type: 'authenticated',
      allowed_formats: 'jpg,png,webp',
    };
    const signature = createHash('sha1')
      .update(
        Object.entries(params)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join('&') + process.env.CLOUDINARY_API_SECRET,
      )
      .digest('hex');
    const upload = new FormData();
    Object.entries(params).forEach(([k, v]) => upload.set(k, String(v)));
    upload.set('api_key', process.env.CLOUDINARY_API_KEY!);
    upload.set('signature', signature);
    upload.set('file', file);
    const result = await fetch(
      'https://api.cloudinary.com/v1_1/' + process.env.CLOUDINARY_CLOUD_NAME + '/image/upload',
      { method: 'POST', body: upload, signal: AbortSignal.timeout(30000) },
    );
    const media = await result.json();
    assert(
      result.ok &&
        media.public_id === publicId &&
        media.bytes <= max &&
        ['jpg', 'jpeg', 'png', 'webp'].includes(media.format),
      'UPLOAD_FAILED',
      'Image provider rejected the upload.',
      502,
    );
    const out = await db().begin(async (tx) => {
      const [asset] = await tx`
insert into
  media_assets (organization_id, public_id, format, bytes, created_by)
values
  (${org}, ${publicId}, ${media.format}, ${media.bytes}, ${a.id})
returning
  *
`;
      const harvest = form.get('harvest_id');
      if (harvest) {
        z.uuid().parse(harvest);
        const [h] = await tx`select * from harvests where id=${String(harvest)} for update`;
        assert(
          h && h.organization_id === org,
          'FORBIDDEN',
          'Harvest is outside the selected organization.',
          403,
        );
        await tx`update harvests set photos=photos||${tx.json([{ asset_id: asset.id }])}::jsonb,version=version+1 where id=${h.id}`;
        await audit(tx, a, 'attach-photo', 'harvests', h.id, org, h, { asset_id: asset.id });
      }
      return asset;
    });
    return NextResponse.json({ success: true, data: out, requestId });
  } catch (e) {
    const status = e instanceof Problem ? e.status : 400;
    return NextResponse.json(
      {
        success: false,
        error: {
          code: e instanceof Problem ? e.code : 'UPLOAD_FAILED',
          message: e instanceof Problem ? e.message : 'Upload could not be completed.',
          requestId,
        },
      },
      { status },
    );
  }
}
