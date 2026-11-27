/**
 * Utilidades isomórficas de seguridad y validación de entradas (cliente y servidor).
 */

export const MIN_PASSWORD_LENGTH = 10;

/**
 * Valida la fortaleza mínima de una contraseña para cuentas reales:
 * - Al menos 10 caracteres (máx. 128)
 * - Al menos una letra y un dígito
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  error?: string;
} {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }
  if (password.length > 128) {
    return {
      valid: false,
      error: 'La contraseña no puede superar los 128 caracteres.',
    };
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return {
      valid: false,
      error: 'La contraseña debe incluir al menos una letra y un número.',
    };
  }
  return { valid: true };
}

/**
 * Comprueba que una URL de destino sea segura (`https://`, `http://` local o `blob:`)
 * evitando esquemas peligrosos como `javascript:` o `vbscript:`.
 */
export function isSafePreviewUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('data:application/pdf') ||
    trimmed.startsWith('/')
  ) {
    return true;
  }
  return false;
}
