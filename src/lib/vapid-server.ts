import crypto from 'crypto';

export interface ServerVapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * Obtiene la configuración VAPID en tiempo de ejecución derivando la clave pública
 * directamente de `VAPID_PRIVATE_KEY` (curva P-256). Así es matemáticamente imposible
 * que exista un desajuste 403 entre la clave pública del navegador y la privada del servidor.
 */
export function getServerVapidConfig(): ServerVapidConfig | null {
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!privateKey) return null;

  const subject = (process.env.VAPID_SUBJECT || 'mailto:soporte@vistasat.pro').trim();
  const envPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();

  try {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    const derivedPublicKey = ecdh.getPublicKey().toString('base64url');
    return {
      publicKey: derivedPublicKey,
      privateKey,
      subject,
    };
  } catch {
    if (!envPublicKey) return null;
    return {
      publicKey: envPublicKey,
      privateKey,
      subject,
    };
  }
}
