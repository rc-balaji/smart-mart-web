import { NextResponse } from 'next/server';
import bwipjs from 'bwip-js';

import { isAdmin } from '../../../../lib/admin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!await isAdmin()) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const value = new URL(request.url).searchParams.get('value')?.trim() || '';
  if (!value || value.length > 256) {
    return NextResponse.json(
      { ok: false, error: 'A barcode value of 1 to 256 characters is required.' },
      { status: 400 },
    );
  }

  try {
    const image = await bwipjs.toBuffer({
      bcid: 'code128',
      text: value,
      scale: 4,
      height: 18,
      includetext: true,
      textxalign: 'center',
      backgroundcolor: 'FFFFFF',
      paddingwidth: 14,
      paddingheight: 14,
    });

    return new Response(new Uint8Array(image), {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'private, no-store',
        'content-length': String(image.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Barcode generation failed.';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 400 },
    );
  }
}
