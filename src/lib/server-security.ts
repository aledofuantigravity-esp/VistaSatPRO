import { timingSafeEqual } from 'node:crypto';

/**
 * Compara secretos en tiempo constante para evitar ataques de temporización.
 */
export function timingSafeEqualSecret(provided: string, expected: string): boolean {
  const bufA = Buffer.from(provided, 'utf8');
  const bufB = Buffer.from(expected, 'utf8');
  if (bufA.length !== bufB.length) {
    // Ejecutamos timingSafeEqual sobre longitud fija para no filtrar tamaño por tiempo
    timingSafeEqual(bufB, bufB);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
