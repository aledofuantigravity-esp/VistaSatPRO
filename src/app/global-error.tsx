'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
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
    <html lang="es">
      <body className="min-h-dvh flex items-center justify-center bg-[#F8F7F7] text-[#222222] p-6 font-sans">
        <div className="max-w-md bg-white p-6 rounded-md shadow-md border-l-4 border-[#D40000] space-y-3 text-center">
          <h1 className="text-lg font-bold">Error crítico de aplicación</h1>
          <p className="text-sm text-[#666666]">
            Se ha producido un fallo inesperado en VistaSatPRO.
          </p>
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 bg-[#002169] text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            Recargar aplicación
          </button>
        </div>
      </body>
    </html>
  );
}
