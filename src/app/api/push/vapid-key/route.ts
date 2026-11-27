import { NextResponse } from 'next/server';
import { getServerVapidConfig } from '@/lib/vapid-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/push/vapid-key
 * Devuelve en tiempo de ejecución la clave pública VAPID exacta que corresponde
 * a la `VAPID_PRIVATE_KEY` activa en el servidor (evita desajustes por caché de build).
 */
export async function GET() {
  const cfg = getServerVapidConfig();
  return NextResponse.json(
    { publicKey: cfg?.publicKey || null },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
