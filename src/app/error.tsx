'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/Button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <div className="min-h-[60dvh] flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="max-w-md bg-white p-6 rounded-md shadow-card border-l-4 border-danger space-y-3">
        <h2 className="text-lg font-bold text-charcoal">Ha ocurrido un error inesperado</h2>
        <p className="text-xs text-mid-grey">
          Hemos registrado la incidencia para revisarla. Puedes intentar recargar la vista actual.
        </p>
        <Button type="button" variant="primary" size="sm" onClick={reset}>
          Reintentar
        </Button>
      </div>
    </div>
  );
}
