import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 * Endpoint ligero de monitorización (uptime) sin exponer detalles internos ni secretos.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'VistaSatPRO',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
