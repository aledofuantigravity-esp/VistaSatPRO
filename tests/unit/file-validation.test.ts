import { describe, expect, it } from 'vitest';
import {
  detectBinaryKindFromBytes,
  validateFileMagicBytes,
} from '@/lib/file-validation';

describe('file-validation (magic bytes)', () => {
  it('identifica correctamente cabeceras JPEG, PNG, WEBP y PDF', () => {
    expect(detectBinaryKindFromBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe(
      'jpeg'
    );
    expect(
      detectBinaryKindFromBytes(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )
    ).toBe('png');
    expect(
      detectBinaryKindFromBytes(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
        ])
      )
    ).toBe('webp');
    expect(
      detectBinaryKindFromBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))
    ).toBe('pdf');
  });

  it('rechaza contenido HTML/script disfrazado con extensión o MIME de imagen', async () => {
    const fakeBlob = new Blob(['<html><script>alert(1)</script></html>'], {
      type: 'image/jpeg',
    });
    const res = await validateFileMagicBytes(fakeBlob, ['jpeg', 'png', 'webp']);
    expect(res.valid).toBe(false);
  });
});
