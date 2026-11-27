import * as Sentry from '@sentry/nextjs';

/**
 * Registra un error crítico en Sentry (si está configurado mediante DSN) y en consola.
 */
export function captureMonitoringError(
  error: unknown,
  context?: Record<string, string | number | boolean | undefined>
): void {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN) {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      extra: context,
    });
  }
  if (process.env.NODE_ENV !== 'production') {
    console.error('[VistaSatPRO Monitor]', context || {}, error);
  }
}
