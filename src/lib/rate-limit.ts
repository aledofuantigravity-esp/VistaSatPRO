import { NextResponse } from 'next/server';

interface BucketEntry {
  count: number;
  resetAt: number;
}

declare global {
  var __vistasatRateLimitStore: Map<string, BucketEntry> | undefined;
}

const store = globalThis.__vistasatRateLimitStore ?? new Map<string, BucketEntry>();
if (!globalThis.__vistasatRateLimitStore) {
  globalThis.__vistasatRateLimitStore = store;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Extrae la IP de cliente de forma segura a partir de las cabeceras proxy (Vercel / Reverse Proxy).
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Aplica limitación de peticiones en ventana fija por clave (ruta + IP/usuario).
 * Soporta limpieza periódica para evitar fugas de memoria y Upstash Redis REST opcional.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000
): Promise<RateLimitResult> {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Camino opcional distribuido con Upstash Redis REST (si está configurado)
  if (upstashUrl && upstashToken) {
    try {
      const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
      const redisKey = `rl:${key}`;
      const res = await fetch(`${upstashUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['EXPIRE', redisKey, windowSec, 'NX'],
          ['TTL', redisKey],
        ]),
      });
      if (res.ok) {
        const results = (await res.json()) as Array<{ result?: number }>;
        const count = Number(results[0]?.result ?? 1);
        const ttl = Math.max(1, Number(results[2]?.result ?? windowSec));
        return {
          allowed: count <= limit,
          limit,
          remaining: Math.max(0, limit - count),
          retryAfterSec: count <= limit ? 0 : ttl,
        };
      }
    } catch {
      // Fallback silencioso a memoria local si Upstash falla
    }
  }

  const now = Date.now();
  if (store.size > 2000) {
    for (const [k, entry] of store.entries()) {
      if (entry.resetAt <= now) store.delete(k);
    }
  }

  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      retryAfterSec: 0,
    };
  }

  current.count += 1;
  store.set(key, current);

  const allowed = current.count <= limit;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - current.count),
    retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

/**
 * Construye respuesta HTTP 429 estándar con cabecera Retry-After.
 */
export function rateLimitExceededResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: `Demasiadas peticiones. Inténtalo de nuevo en ${result.retryAfterSec} segundos.`,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSec),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    }
  );
}
