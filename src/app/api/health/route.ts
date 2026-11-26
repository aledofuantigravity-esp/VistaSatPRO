import { NextResponse } from 'next/server';
import { isSupabaseConfigured, isVapidConfigured } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 * Endpoint ligero de monitorización (uptime) sin exponer secretos.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'VistaSatPRO',
      supabaseConfigured: isSupabaseConfigured(),
      pushConfigured: isVapidConfigured(),
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
