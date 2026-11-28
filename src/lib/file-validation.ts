/**
 * Utilidades de validación por firma binaria (magic bytes) y compresión automática
 * de fotografías en cliente antes de subirlas a Supabase Storage.
 */

export type AllowedBinaryKind = 'jpeg' | 'png' | 'webp' | 'pdf';

const KIND_TO_MIME: Record<AllowedBinaryKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

const KIND_LABELS: Record<AllowedBinaryKind, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WEBP',
  pdf: 'PDF',
};

/**
 * Detecta el tipo binario real de un archivo inspeccionando sus primeros bytes (magic bytes).
 */
export function detectBinaryKindFromBytes(bytes: Uint8Array): AllowedBinaryKind | null {
  if (bytes.length < 5) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }

  // WEBP: "RIFF" (0..3) + "WEBP" (8..11)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp';
  }

  // PDF: "%PDF-" (admite BOM UTF-8 o espacios iniciales dentro de los primeros 64 bytes)
  if (bytes.length >= 5) {
    const maxOffset = Math.min(bytes.length - 5, 59);
    for (let offset = 0; offset <= maxOffset; offset++) {
      if (
        bytes[offset] === 0x25 &&
        bytes[offset + 1] === 0x50 &&
        bytes[offset + 2] === 0x44 &&
        bytes[offset + 3] === 0x46 &&
        bytes[offset + 4] === 0x2d
      ) {
        return 'pdf';
      }
    }
  }

  return null;
}

/**
 * Valida la cabecera binaria real de un File/Blob frente a los formatos permitidos.
 */
export async function validateFileMagicBytes(
  file: Blob,
  allowed: AllowedBinaryKind[]
): Promise<{ valid: boolean; detectedKind?: AllowedBinaryKind; error?: string }> {
  try {
    const slice = file.slice(0, 64);
    const buffer =
      typeof slice.arrayBuffer === 'function'
        ? await slice.arrayBuffer()
        : await new Response(slice).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const detected = detectBinaryKindFromBytes(bytes);

    if (!detected || !allowed.includes(detected)) {
      const allowedStr = allowed.map((k) => KIND_LABELS[k]).join(', ');
      return {
        valid: false,
        detectedKind: detected ?? undefined,
        error: `El contenido del archivo no corresponde a un formato válido (${allowedStr}).`,
      };
    }

    return { valid: true, detectedKind: detected };
  } catch {
    return {
      valid: false,
      error: 'No se pudo verificar la integridad binaria del archivo.',
    };
  }
}

export function mimeTypeForKind(kind: AllowedBinaryKind): string {
  return KIND_TO_MIME[kind];
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo decodificar la imagen'));
    img.src = src;
  });
}

function replaceExtensionToJpg(filename: string): string {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx <= 0) return `${filename}.jpg`;
  return `${filename.slice(0, dotIdx)}.jpg`;
}

/**
 * Comprime y redimensiona automáticamente una fotografía en el navegador mediante <canvas>,
 * eliminando además metadatos EXIF innecesarios. Conserva intactos archivos pequeños (< 150 KB)
 * cuyas dimensiones ya entren en `maxDimension`.
 */
export async function compressImageFile(
  file: File,
  options?: { maxDimension?: number; quality?: number }
): Promise<File> {
  const maxDimension = options?.maxDimension ?? 1600;
  const quality = options?.quality ?? 0.82;

  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    file.type === 'application/pdf'
  ) {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const naturalW = img.naturalWidth || 0;
    const naturalH = img.naturalHeight || 0;
    if (naturalW === 0 || naturalH === 0) return file;

    const needsResize = Math.max(naturalW, naturalH) > maxDimension;
    if (!needsResize && file.size <= 150 * 1024) {
      return file;
    }

    const ratio = Math.min(1, maxDimension / Math.max(naturalW, naturalH));
    const targetW = Math.max(1, Math.round(naturalW * ratio));
    const targetH = Math.max(1, Math.round(naturalH * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/jpeg', quality);
    });

    if (!blob) return file;

    // Si no hubo reducción real ni redimensionado, devolvemos el original
    if (!needsResize && blob.size >= file.size) {
      return file;
    }

    return new File([blob], replaceExtensionToJpg(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
