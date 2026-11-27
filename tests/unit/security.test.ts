import { describe, expect, it } from 'vitest';
import { isSafePreviewUrl, validatePasswordStrength } from '@/lib/security';

describe('security', () => {
  it('exige longitud mínima y combinación de letras y números', () => {
    expect(validatePasswordStrength('abc123').valid).toBe(false);
    expect(validatePasswordStrength('abcdefghijk').valid).toBe(false);
    expect(validatePasswordStrength('1234567890').valid).toBe(false);
    expect(validatePasswordStrength('Segura2026').valid).toBe(true);
  });

  it('filtra URLs inseguras y permite https, blob y rutas locales', () => {
    expect(isSafePreviewUrl('https://ejemplo.supabase.co/storage/v1/object/sign/x')).toBe(
      true
    );
    expect(isSafePreviewUrl('blob:https://vistasat.vercel.app/123')).toBe(true);
    expect(isSafePreviewUrl('data:application/pdf;base64,JVBERi0=')).toBe(true);
    expect(isSafePreviewUrl('javascript:alert(1)')).toBe(false);
    expect(isSafePreviewUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });
});
